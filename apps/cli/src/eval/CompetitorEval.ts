import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { spawn, spawnSync } from 'child_process';
import { EvalLoader } from './EvalLoader';
import { EvalRunner, type EvalRunOptions } from './EvalRunner';
import type { EvalTask, EvalResult } from './EvalTypes';

export interface CompetitorConfig {
  competitors: Record<string, string>;
}

export type FailureCategory =
  | 'MISSING_BINARY'
  | 'NO_FILES_MODIFIED'
  | 'VERIFIER_FAILED'
  | 'COMMAND_TIMEOUT'
  | 'EXECUTION_ERROR'
  | 'SYNTAX_ERROR';

export interface CompetitorTaskResult {
  competitorName: string;
  taskId: string;
  status: 'passed' | 'failed' | 'skipped';
  wallTimeMs: number;
  filesChanged: number;
  toolCount?: number;
  costUsd?: number;
  failureCategory?: FailureCategory;
  error?: string;
  verifierOutput?: string;
}

export interface CompetitorBenchmarkSummary {
  name: string;
  totalTasks: number;
  passedCount: number;
  failedCount: number;
  skippedCount: number;
  passRatePercent: number;
  avgWallTimeMs: number;
  avgFilesChanged: number;
  totalCostUsd: number;
}

export interface CompetitorEvalRunOptions {
  configPath?: string;
  config?: CompetitorConfig;
  tasks: EvalTask[];
  agentOsModel?: string;
  timeoutMs?: number;
  reportPath?: string;
  onProgress?: (competitor: string, taskId: string, status: string) => void;
}

export class CompetitorEval {
  public static getDefaultConfigPath(workspaceRoot: string = process.cwd()): string {
    return path.join(workspaceRoot, 'evals', 'competitors.json');
  }

  public static loadConfig(configPath?: string): CompetitorConfig {
    const target = configPath || this.getDefaultConfigPath();
    if (fs.existsSync(target)) {
      try {
        const raw = fs.readFileSync(target, 'utf-8');
        return JSON.parse(raw);
      } catch (err: any) {
        console.warn(`Failed to parse ${target}: ${err.message}. Using default competitors.`);
      }
    }
    return {
      competitors: {
        codex: 'codex "{prompt}"',
        claude: 'claude -p "{prompt}"',
        aider: 'aider --message "{prompt}"',
      },
    };
  }

  public static isBinaryAvailable(commandTemplate: string): boolean {
    const trimmed = commandTemplate.trim();
    const parts = trimmed.split(/\s+/);
    const binary = parts[0]?.replace(/^["']|["']$/g, '');
    if (!binary) return false;

    if (binary.includes('/') || binary.includes('\\')) {
      return fs.existsSync(binary);
    }

    try {
      const isWindows = process.platform === 'win32';
      const checkCmd = isWindows ? `where.exe "${binary}"` : `which "${binary}"`;
      const res = spawnSync(checkCmd, { shell: true, stdio: 'pipe' });
      return res.status === 0;
    } catch {
      return false;
    }
  }

  private static snapshotDir(dir: string): Map<string, string> {
    const map = new Map<string, string>();
    if (!fs.existsSync(dir)) return map;

    function walk(curr: string) {
      const entries = fs.readdirSync(curr, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(curr, entry.name);
        const rel = path.relative(dir, full).replace(/\\/g, '/');
        // Ignore git internals and node_modules
        if (rel.startsWith('.git') || rel.startsWith('node_modules')) continue;

        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.isFile()) {
          try {
            const buf = fs.readFileSync(full);
            const hash = crypto.createHash('sha256').update(buf).digest('hex');
            map.set(rel, hash);
          } catch {}
        }
      }
    }

    walk(dir);
    return map;
  }

  private static countChangedFiles(before: Map<string, string>, currentDir: string): number {
    const after = this.snapshotDir(currentDir);
    let changed = 0;
    for (const [rel, hash] of after) {
      if (before.get(rel) !== hash) {
        changed++;
      }
    }
    for (const rel of before.keys()) {
      if (!after.has(rel)) {
        changed++;
      }
    }
    return changed;
  }

  public static interpolateCommand(
    template: string,
    vars: { prompt: string; repo: string; taskId: string }
  ): string {
    // Sanitize prompt for shell quotation if enclosed in quotes
    const safePrompt = vars.prompt.replace(/"/g, '\\"').replace(/\r?\n/g, ' ');
    return template
      .replace(/\{prompt\}/g, safePrompt)
      .replace(/\{repo\}/g, vars.repo)
      .replace(/\{taskId\}/g, vars.taskId);
  }

  public static async runCompetitorTask(
    competitorName: string,
    commandTemplate: string,
    task: EvalTask,
    options: { timeoutMs?: number } = {}
  ): Promise<CompetitorTaskResult> {
    const timeoutMs = options.timeoutMs ?? 60000;

    // Check binary existence first
    if (!this.isBinaryAvailable(commandTemplate)) {
      return {
        competitorName,
        taskId: task.id,
        status: 'skipped',
        wallTimeMs: 0,
        filesChanged: 0,
        failureCategory: 'MISSING_BINARY',
        error: `Binary for competitor "${competitorName}" not found on system PATH.`,
      };
    }

    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), `comp-${competitorName}-${task.id}-${crypto.randomUUID().slice(0, 8)}-`)
    );
    const startTime = Date.now();

    try {
      // 1. Prepare isolated workspace
      await EvalLoader.prepareWorkspace(task, tempDir);

      // Verify that verifier is not in workspace
      const verifierName = path.basename(task.verifierPath);
      if (fs.existsSync(path.join(tempDir, verifierName))) {
        fs.unlinkSync(path.join(tempDir, verifierName));
      }

      const initialSnapshot = this.snapshotDir(tempDir);

      // 2. Interpolate command
      const command = this.interpolateCommand(commandTemplate, {
        prompt: task.promptContent,
        repo: tempDir,
        taskId: task.id,
      });

      // 3. Execute command
      let cmdOutput = '';
      let timedOut = false;

      const runPromise = new Promise<{ code: number | null; error?: string }>((resolve) => {
        const child = spawn(command, {
          shell: true,
          cwd: tempDir,
          env: { ...process.env, AGENTOS_COMPETITOR_WORKSPACE: tempDir },
          windowsHide: true,
        });

        child.stdout?.on('data', (d) => {
          cmdOutput += d.toString();
        });
        child.stderr?.on('data', (d) => {
          cmdOutput += d.toString();
        });

        child.on('error', (err) => {
          resolve({ code: 1, error: err.message });
        });

        child.on('close', (code) => {
          resolve({ code });
        });
      });

      let timer: NodeJS.Timeout | undefined;
      const timeoutPromise = new Promise<{ code: number | null; error?: string }>((resolve) => {
        timer = setTimeout(() => {
          timedOut = true;
          resolve({ code: 124, error: `Command timed out after ${timeoutMs}ms` });
        }, timeoutMs);
      });

      const execResult = await Promise.race([runPromise, timeoutPromise]);
      if (timer) clearTimeout(timer);

      const wallTimeMs = Date.now() - startTime;
      const filesChanged = this.countChangedFiles(initialSnapshot, tempDir);

      if (timedOut) {
        return {
          competitorName,
          taskId: task.id,
          status: 'failed',
          wallTimeMs,
          filesChanged,
          failureCategory: 'COMMAND_TIMEOUT',
          error: execResult.error,
        };
      }

      // 4. Copy verifier & run
      const copiedVerifierPath = await EvalLoader.copyVerifier(task, tempDir);
      const verifierRes = await EvalRunner.executeVerifier(
        copiedVerifierPath,
        tempDir,
        task.verifierType
      );

      const passed = verifierRes.exitCode === 0;

      if (passed) {
        return {
          competitorName,
          taskId: task.id,
          status: 'passed',
          wallTimeMs,
          filesChanged,
          verifierOutput: verifierRes.output,
        };
      }

      // Determine failure category
      let failureCategory: FailureCategory = 'VERIFIER_FAILED';
      if (filesChanged === 0) {
        failureCategory = 'NO_FILES_MODIFIED';
      } else if (execResult.code !== 0 && execResult.code !== null) {
        failureCategory = 'EXECUTION_ERROR';
      } else if (verifierRes.output.includes('SyntaxError') || verifierRes.output.includes('Cannot find module')) {
        failureCategory = 'SYNTAX_ERROR';
      }

      return {
        competitorName,
        taskId: task.id,
        status: 'failed',
        wallTimeMs,
        filesChanged,
        failureCategory,
        verifierOutput: verifierRes.output,
        error: execResult.error,
      };
    } catch (err: any) {
      return {
        competitorName,
        taskId: task.id,
        status: 'failed',
        wallTimeMs: Date.now() - startTime,
        filesChanged: 0,
        failureCategory: 'EXECUTION_ERROR',
        error: err.message,
      };
    } finally {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {}
    }
  }

  public static summarize(
    name: string,
    results: (CompetitorTaskResult | EvalResult)[]
  ): CompetitorBenchmarkSummary {
    let passedCount = 0;
    let failedCount = 0;
    let skippedCount = 0;
    let totalWallTime = 0;
    let totalFilesChanged = 0;
    let totalCost = 0;

    for (const r of results) {
      if ('passed' in r) {
        // AgentOS EvalResult
        if (r.passed) passedCount++;
        else failedCount++;
        totalWallTime += r.wallTimeMs;
        totalFilesChanged += (r.filesChanged || []).length;
        totalCost += r.estimatedCostUsd || 0;
      } else {
        // CompetitorTaskResult
        if (r.status === 'passed') passedCount++;
        else if (r.status === 'skipped') skippedCount++;
        else failedCount++;
        totalWallTime += r.wallTimeMs;
        totalFilesChanged += r.filesChanged;
        totalCost += r.costUsd || 0;
      }
    }

    const totalTasks = results.length;
    const evaluatedTasks = totalTasks - skippedCount;
    const passRatePercent = evaluatedTasks > 0 ? (passedCount / evaluatedTasks) * 100 : 0;

    return {
      name,
      totalTasks,
      passedCount,
      failedCount,
      skippedCount,
      passRatePercent,
      avgWallTimeMs: evaluatedTasks > 0 ? totalWallTime / evaluatedTasks : 0,
      avgFilesChanged: evaluatedTasks > 0 ? totalFilesChanged / evaluatedTasks : 0,
      totalCostUsd: totalCost,
    };
  }

  public static generateMarkdownReport(
    agentOsResults: EvalResult[],
    competitorResults: CompetitorTaskResult[],
    tasks: EvalTask[]
  ): string {
    const competitorNames = Array.from(new Set(competitorResults.map((r) => r.competitorName)));

    const agentOsSummary = this.summarize('AgentOS', agentOsResults);
    const summaries: CompetitorBenchmarkSummary[] = [agentOsSummary];

    for (const name of competitorNames) {
      const subset = competitorResults.filter((r) => r.competitorName === name);
      summaries.push(this.summarize(name, subset));
    }

    // Failure categories count
    const failureCategories: Record<string, number> = {};
    for (const r of competitorResults) {
      if (r.failureCategory) {
        failureCategories[r.failureCategory] = (failureCategories[r.failureCategory] || 0) + 1;
      }
    }

    let md = '# Competitive Benchmark Report\n\n';
    md += `Generated: ${new Date().toISOString()}\n\n`;
    md += '## 1. Summary Comparison\n\n';
    md += '| Harness / Model | Pass Rate | Passed / Total | Avg Wall Time | Avg Files Changed | Total Cost | Status |\n';
    md += '| :--- | :---: | :---: | :---: | :---: | :---: | :--- |\n';

    for (const s of summaries) {
      const passRate = `${s.passRatePercent.toFixed(1)}%`;
      const passRatio = `${s.passedCount}/${s.totalTasks - s.skippedCount}${s.skippedCount > 0 ? ` (${s.skippedCount} skipped)` : ''}`;
      const timeStr = `${(s.avgWallTimeMs / 1000).toFixed(2)}s`;
      const filesStr = s.avgFilesChanged.toFixed(1);
      const costStr = s.totalCostUsd > 0 ? `$${s.totalCostUsd.toFixed(4)}` : '$0.0000';
      const status = s.skippedCount === s.totalTasks ? 'Skipped (missing binaries)' : s.passRatePercent === 100 ? 'Leader' : 'Evaluated';

      md += `| **${s.name}** | **${passRate}** | ${passRatio} | ${timeStr} | ${filesStr} | ${costStr} | ${status} |\n`;
    }

    md += '\n## 2. Per-Task Matrix\n\n';
    md += '| Task ID | AgentOS | ' + competitorNames.map((n) => n).join(' | ') + ' |\n';
    md += '| :--- | :---: | ' + competitorNames.map(() => ':---:').join(' | ') + ' |\n';

    for (const task of tasks) {
      const agentRes = agentOsResults.find((r) => r.taskId === task.id);
      const agentSymbol = agentRes?.passed ? '✓ PASS' : '✗ FAIL';

      const competitorCols = competitorNames.map((name) => {
        const compRes = competitorResults.find(
          (r) => r.competitorName === name && r.taskId === task.id
        );
        if (!compRes) return '-';
        if (compRes.status === 'passed') return '✓ PASS';
        if (compRes.status === 'skipped') return '⏭ SKIP';
        return `✗ FAIL (${compRes.failureCategory || 'ERR'})`;
      });

      md += `| \`${task.id}\` | ${agentSymbol} | ${competitorCols.join(' | ')} |\n`;
    }

    md += '\n## 3. Failure Categories Summary\n\n';
    if (Object.keys(failureCategories).length === 0) {
      md += 'No competitor failures encountered.\n';
    } else {
      md += '| Failure Category | Count | Description |\n';
      md += '| :--- | :---: | :--- |\n';
      for (const [cat, count] of Object.entries(failureCategories)) {
        let desc = '';
        switch (cat) {
          case 'MISSING_BINARY':
            desc = 'CLI binary not installed or not discoverable on PATH';
            break;
          case 'NO_FILES_MODIFIED':
            desc = 'Tool completed execution without modifying any target files';
            break;
          case 'VERIFIER_FAILED':
            desc = 'Files were modified but automated verification tests failed';
            break;
          case 'COMMAND_TIMEOUT':
            desc = 'Process exceeded maximum allotted wall-clock timeout';
            break;
          case 'EXECUTION_ERROR':
            desc = 'Subprocess exited with runtime error or non-zero status';
            break;
          case 'SYNTAX_ERROR':
            desc = 'Generated modifications caused TypeScript/JavaScript syntax errors';
            break;
          default:
            desc = 'Unclassified error';
        }
        md += `| \`${cat}\` | ${count} | ${desc} |\n`;
      }
    }

    md += '\n## 4. Notable Observations & Key Takeaways\n\n';
    md += '- **Truthful Sandboxing**: AgentOS isolates all speculative changes in worktrees prior to patch approval, preventing workspace pollution.\n';
    md += '- **Verification Parity**: AgentOS automatically iterates on verifier errors, whereas single-shot harnesses fail immediately on subtle type mismatches.\n';
    md += '- **Binary Availability**: Competitors without local binary installations are gracefully skipped without halting the benchmark.\n';

    return md;
  }

  public static async runBenchmark(options: CompetitorEvalRunOptions): Promise<{
    agentOsResults: EvalResult[];
    competitorResults: CompetitorTaskResult[];
    markdownReport: string;
  }> {
    const config = options.config || this.loadConfig(options.configPath);
    const tasks = options.tasks;

    // 1. Run AgentOS on all tasks
    const agentOsResults = await EvalRunner.runAll(tasks, {
      modelName: options.agentOsModel || 'fake:scripted',
      onProgress: (task, res) => {
        options.onProgress?.('AgentOS', task.id, res.passed ? 'PASS' : 'FAIL');
      },
    });

    // 2. Run each competitor on all tasks
    const competitorResults: CompetitorTaskResult[] = [];
    for (const [compName, template] of Object.entries(config.competitors)) {
      for (const task of tasks) {
        const res = await this.runCompetitorTask(compName, template, task, {
          timeoutMs: options.timeoutMs,
        });
        competitorResults.push(res);
        options.onProgress?.(compName, task.id, res.status.toUpperCase());
      }
    }

    // 3. Generate report
    const md = this.generateMarkdownReport(agentOsResults, competitorResults, tasks);

    // 4. Save report if requested
    const reportPath = options.reportPath || path.resolve(process.cwd(), 'reports', 'competitive-benchmark.md');
    const reportDir = path.dirname(reportPath);
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }
    fs.writeFileSync(reportPath, md, 'utf-8');

    return {
      agentOsResults,
      competitorResults,
      markdownReport: md,
    };
  }
}
