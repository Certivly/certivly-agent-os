import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { AgentRuntime, type PermissionMode, type RunSummary } from '@agent-os/agent-runtime';

export interface HeadlessOptions {
  goal: string;
  configPath?: string;
  workspaceRoot?: string;
  permissionMode?: PermissionMode;
  format?: 'json' | 'text';
  autoCommit?: boolean;
  commitMessage?: string;
  outputFile?: string;
  maxTurns?: number;
  maxWallTimeMs?: number;
  modelId?: string;
  debug?: boolean;
}

export interface HeadlessResult {
  exitCode: number;
  summary?: RunSummary;
  commitSha?: string;
  error?: string;
}

export async function runHeadless(options: HeadlessOptions): Promise<HeadlessResult> {
  const workspaceRoot = options.workspaceRoot || process.cwd();
  const format = options.format || 'text';
  const permissionMode = options.permissionMode || 'auto';
  const sessionId = `headless_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // Find config file
  let configPath = options.configPath;
  if (!configPath) {
    const local = path.join(workspaceRoot, 'agentos.config.json');
    const user = path.join(process.env.HOME || process.env.USERPROFILE || '', '.agentos', 'config.json');
    configPath = fs.existsSync(local) ? local : user;
  }

  let runtime: AgentRuntime | undefined;

  try {
    runtime = new AgentRuntime({
      configPath,
      workspaceRoot,
      permissionMode,
    }, sessionId);

    const eventBus = runtime.getEventBus();

    if (format === 'text') {
      eventBus.subscribe('agent.loop.turn.started', (event: any) => {
        console.log(`[AgentOS Turn ${event.payload?.turn}]`);
      });
      eventBus.subscribe('tool.call.started', (event: any) => {
        console.log(`  -> Executing tool: ${event.payload?.toolName}`);
      });
      eventBus.subscribe('tool.call.completed', (event: any) => {
        console.log(`  [OK] Tool: ${event.payload?.toolName}`);
      });
      eventBus.subscribe('tool.call.failed', (event: any) => {
        console.error(`  [FAIL] Tool: ${event.payload?.toolName} - ${event.payload?.error}`);
      });
      eventBus.subscribe('agent.loop.anti_loop_triggered', (event: any) => {
        console.warn(`  [Anti-Loop Triggered] ${event.payload?.loopType}: ${event.payload?.intervention}`);
      });
    }

    try {
      await runtime.handleRequest(sessionId, options.goal);
    } catch {
      // Loop failures are captured in lastRunSummary
    }
    const summary = runtime.getLastRunSummary();

    let commitSha: string | undefined;

    if (summary?.success && options.autoCommit && summary.filesChanged && summary.filesChanged.length > 0) {
      try {
        const msg = options.commitMessage || `fix(agentos): ${options.goal.slice(0, 72)}`;
        execSync('git add -A', { cwd: workspaceRoot, stdio: 'pipe' });
        execSync(`git commit -m ${JSON.stringify(msg)}`, { cwd: workspaceRoot, stdio: 'pipe' });
        commitSha = execSync('git rev-parse HEAD', { cwd: workspaceRoot, encoding: 'utf-8' }).trim();
        if (format === 'text') {
          console.log(`[AgentOS Git] Committed ${summary.filesChanged.length} file(s): ${commitSha}`);
        }
      } catch (gitErr: any) {
        if (format === 'text') {
          console.warn(`[AgentOS Git] Auto-commit skipped: ${gitErr.message}`);
        }
      }
    }

    if (options.outputFile && summary) {
      const outPath = path.resolve(workspaceRoot, options.outputFile);
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, JSON.stringify(summary, null, 2), 'utf-8');
      if (format === 'text') {
        console.log(`[AgentOS] Summary written to: ${outPath}`);
      }
    }

    if (format === 'json') {
      console.log(JSON.stringify(summary || { success: false, errors: ['No summary produced'] }, null, 2));
    } else if (summary) {
      console.log('\n=== AgentOS Run Summary ===');
      console.log(`Status: ${summary.success ? 'SUCCESS' : 'FAILED'}`);
      console.log(`Turns: ${summary.turns}`);
      console.log(`Input Tokens: ${summary.approxInputTokens}`);
      if (summary.cacheReadTokens) {
        console.log(`Cache Read Tokens: ${summary.cacheReadTokens}`);
      }
      console.log(`Files Modified: ${(summary.filesChanged || []).join(', ') || 'none'}`);
      if (summary.finalText) {
        console.log(`\nFinal Response:\n${summary.finalText}`);
      }
      if (!summary.success && summary.errors?.length > 0) {
        console.error(`\nErrors:\n${summary.errors.join('\n')}`);
      }
    }

    const exitCode = summary?.success ? 0 : 1;
    runtime.close();
    return {
      exitCode,
      summary,
      commitSha,
      error: summary?.success ? undefined : summary?.errors?.[0] || (summary ? undefined : 'No summary produced'),
    };
  } catch (err: any) {
    try {
      runtime?.close();
    } catch (_closeErr: any) {
      // Runtime was not started or already closed
    }
    if (format === 'json') {
      console.log(JSON.stringify({ success: false, error: err.message }, null, 2));
    } else {
      console.error(`[AgentOS Fatal Error]: ${err.message}`);
    }
    return { exitCode: 1, error: err.message };
  }
}
