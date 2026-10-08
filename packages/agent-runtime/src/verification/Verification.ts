import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';

export type CheckStatus = "passed" | "failed" | "skipped";
export type VerificationVerdict = "verified" | "failed" | "unverified";

export interface VerificationCheck {
  name: string;
  command?: string;
  status: CheckStatus;
  exitCode?: number | null;
  durationMs?: number;
  outputTail?: string;
  reason?: string;
  preExisting?: boolean;
}

export interface VerificationResult {
  verdict: VerificationVerdict;
  checks: VerificationCheck[];
}

export type VerificationCheckName = 'typecheck' | 'lint' | 'test' | 'build';

export const PREFERRED_CHECKS: readonly VerificationCheckName[] = [
  'typecheck',
  'lint',
  'test',
  'build',
] as const;

export type VerificationExecutor = (
  command: string,
  cwd: string
) => Promise<{
  exitCode: number | null;
  stdout: string;
  stderr: string;
}>;

export interface VerificationOptions {
  workspaceRoot: string;
  packageManager?: string;
  executor?: VerificationExecutor;
  checks?: VerificationCheckName[];
  stopOnFirstFailure?: boolean;
  timeoutMs?: number;
  maxOutputBytes?: number;
  env?: NodeJS.ProcessEnv;
  baseline?: VerificationResult;
}

export function findNearestPackageJson(startDir: string): string | null {
  let curr = path.resolve(startDir);
  while (true) {
    const candidate = path.join(curr, 'package.json');
    if (fs.existsSync(candidate)) {
      return candidate;
    }
    const parent = path.dirname(curr);
    if (parent === curr) break;
    curr = parent;
  }
  return null;
}

export function detectPackageManager(dir: string): string {
  if (fs.existsSync(path.join(dir, 'bun.lockb')) || fs.existsSync(path.join(dir, 'bun.lock'))) {
    return 'bun';
  }
  if (fs.existsSync(path.join(dir, 'pnpm-lock.yaml'))) {
    return 'pnpm';
  }
  if (fs.existsSync(path.join(dir, 'yarn.lock'))) {
    return 'yarn';
  }
  if (typeof (process.versions as any)?.bun !== 'undefined') {
    return 'bun';
  }
  return 'npm';
}

export interface VerificationExecutorOptions {
  timeoutMs?: number;
  maxOutputBytes?: number;
  env?: NodeJS.ProcessEnv;
}

export const DEFAULT_VERIFICATION_TIMEOUT_MS = 60_000;
export const DEFAULT_MAX_OUTPUT_BYTES = 512 * 1024; // 512 KB

export function createDefaultExecutor(options?: VerificationExecutorOptions): VerificationExecutor {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_VERIFICATION_TIMEOUT_MS;
  const maxOutputBytes = options?.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    CI: 'true',
    DEBIAN_FRONTEND: 'noninteractive',
    GIT_TERMINAL_PROMPT: '0',
    npm_config_yes: 'true',
    ...(options?.env ?? {}),
  };

  return async (command: string, cwd: string) => {
    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let stdoutTruncated = false;
      let stderrTruncated = false;
      let timedOut = false;
      let settled = false;

      const finish = (result: { exitCode: number | null; stdout: string; stderr: string }) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        resolve(result);
      };

      const child = spawn(command, {
        shell: true,
        cwd,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });

      const timer = timeoutMs > 0 ? setTimeout(() => {
        timedOut = true;
        try {
          if (child.pid) {
            if (process.platform === 'win32') {
              spawn('taskkill', ['/pid', child.pid.toString(), '/T', '/F'], { windowsHide: true });
            } else {
              child.kill('SIGKILL');
            }
          }
        } catch (_treeErr) {
          // best-effort process termination: fallback to direct kill
          try {
            child.kill();
          } catch (_killErr) {
            // best-effort: process may already have terminated
          }
        }

        const timeoutMsg = `\n[Verification command timed out after ${timeoutMs}ms]`;
        finish({
          exitCode: 124,
          stdout,
          stderr: (stderr ? stderr + timeoutMsg : timeoutMsg).trim(),
        });
      }, timeoutMs) : null;

      child.stdout?.on('data', (data) => {
        if (settled) return;
        const chunk = data.toString();
        if (stdout.length + chunk.length <= maxOutputBytes) {
          stdout += chunk;
        } else if (!stdoutTruncated) {
          const remaining = Math.max(0, maxOutputBytes - stdout.length);
          stdout += chunk.slice(0, remaining) + `\n[output truncated to ${maxOutputBytes} bytes]`;
          stdoutTruncated = true;
        }
      });

      child.stderr?.on('data', (data) => {
        if (settled) return;
        const chunk = data.toString();
        if (stderr.length + chunk.length <= maxOutputBytes) {
          stderr += chunk;
        } else if (!stderrTruncated) {
          const remaining = Math.max(0, maxOutputBytes - stderr.length);
          stderr += chunk.slice(0, remaining) + `\n[output truncated to ${maxOutputBytes} bytes]`;
          stderrTruncated = true;
        }
      });

      child.on('error', (err) => {
        if (settled) return;
        stderr += `\n${err.message}`;
        finish({ exitCode: 1, stdout, stderr });
      });

      child.on('close', (code) => {
        if (settled) return;
        finish({ exitCode: timedOut ? 124 : code, stdout, stderr });
      });
    });
  };
}

export const defaultExecutor: VerificationExecutor = createDefaultExecutor();

export function getOutputTail(output: string, maxLength: number = 2000): string {
  const trimmed = output.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return trimmed.slice(-maxLength);
}

export function formatVerificationFailure(result: VerificationResult): string {
  const failedChecks = result.checks.filter((c) => c.status === 'failed');
  if (failedChecks.length === 0) return '';
  const lines: string[] = ['Verification failed:'];
  for (const check of failedChecks) {
    lines.push(check.name);
    if (check.command) {
      lines.push(check.command);
    }
    if (check.outputTail) {
      lines.push(check.outputTail);
    }
  }
  return lines.join('\n');
}

export class Verification {
  public static async run(options: VerificationOptions): Promise<VerificationResult> {
    const checksToEvaluate = options.checks ?? PREFERRED_CHECKS;
    const pkgJsonPath = findNearestPackageJson(options.workspaceRoot);

    if (!pkgJsonPath) {
      const checks: VerificationCheck[] = checksToEvaluate.map((name) => ({
        name,
        status: 'skipped',
        reason: 'package.json not found in workspace',
      }));
      return {
        verdict: 'unverified',
        checks,
      };
    }

    const pkgDir = path.dirname(pkgJsonPath);
    let scripts: Record<string, string> = {};
    try {
      const pkgContent = fs.readFileSync(pkgJsonPath, 'utf8');
      const parsed = JSON.parse(pkgContent);
      scripts = parsed.scripts || {};
    } catch (e: any) {
      const checks: VerificationCheck[] = checksToEvaluate.map((name) => ({
        name,
        status: 'skipped',
        reason: `Failed to read package.json: ${e?.message || String(e)}`,
      }));
      return {
        verdict: 'unverified',
        checks,
      };
    }

    const pm = options.packageManager || detectPackageManager(pkgDir);
    const executor = options.executor || (options.timeoutMs !== undefined || options.maxOutputBytes !== undefined || options.env !== undefined
      ? createDefaultExecutor({ timeoutMs: options.timeoutMs, maxOutputBytes: options.maxOutputBytes, env: options.env })
      : defaultExecutor);
    const checks: VerificationCheck[] = [];

    for (const name of checksToEvaluate) {
      if (!scripts[name]) {
        checks.push({
          name,
          status: 'skipped',
          reason: `Script '${name}' not found in package.json`,
        });
        continue;
      }

      const command = `${pm} run ${name}`;
      const startTime = Date.now();
      try {
        const result = await executor(command, pkgDir);
        const durationMs = Date.now() - startTime;
        const combinedOutput = [result.stdout, result.stderr].filter(Boolean).join('\n');
        const outputTail = getOutputTail(combinedOutput);

        if (result.exitCode === 0) {
          checks.push({
            name,
            command,
            status: 'passed',
            exitCode: 0,
            durationMs,
            outputTail: outputTail || undefined,
          });
        } else {
          checks.push({
            name,
            command,
            status: 'failed',
            exitCode: result.exitCode ?? 1,
            durationMs,
            outputTail: outputTail || `Command exited with code ${result.exitCode}`,
          });

          if (options.stopOnFirstFailure) {
            break;
          }
        }
      } catch (err: any) {
        const durationMs = Date.now() - startTime;
        checks.push({
          name,
          command,
          status: 'failed',
          exitCode: 1,
          durationMs,
          outputTail: err?.message || String(err),
        });

        if (options.stopOnFirstFailure) {
          break;
        }
      }
    }

    if (options.baseline) {
      for (const check of checks) {
        if (check.status === 'failed') {
          const baseCheck = options.baseline.checks.find(
            (bc) => (bc.name === check.name || (bc.command && check.command && bc.command === check.command)) && bc.status === 'failed'
          );
          if (baseCheck) {
            check.preExisting = true;
          }
        }
      }
    }

    const failedChecks = checks.filter((c) => c.status === 'failed');
    const newFailures = failedChecks.filter((c) => !c.preExisting);
    const passedCount = checks.filter((c) => c.status === 'passed').length;

    let verdict: VerificationVerdict;
    if (newFailures.length > 0) {
      verdict = 'failed';
    } else if (passedCount > 0) {
      verdict = 'verified';
    } else if (failedChecks.length > 0) {
      verdict = 'failed';
    } else {
      verdict = 'unverified';
    }

    return {
      verdict,
      checks,
    };
  }
}

export const runVerification = Verification.run;

export interface ProjectVerifierRunResult {
  passed: boolean;
  output: string;
  exitCode: number;
  checks?: VerificationCheck[];
}

export class ProjectVerifier {
  private baseline?: VerificationResult;

  constructor(
    private workspaceRoot: string,
    private executor?: VerificationExecutor,
    private executorOptions?: VerificationExecutorOptions
  ) {}

  public async captureBaseline(customCommands?: string[]): Promise<VerificationResult | null> {
    const exec = this.executor || (this.executorOptions ? createDefaultExecutor(this.executorOptions) : defaultExecutor);
    if (customCommands && customCommands.length > 0) {
      const checks: VerificationCheck[] = [];
      for (const cmd of customCommands) {
        if (!cmd || !cmd.trim()) continue;
        const startTime = Date.now();
        const res = await exec(cmd, this.workspaceRoot);
        const durationMs = Date.now() - startTime;
        const out = [res.stdout, res.stderr].filter(Boolean).join('\n');
        checks.push({
          name: cmd,
          command: cmd,
          status: res.exitCode === 0 ? 'passed' : 'failed',
          exitCode: res.exitCode ?? 1,
          durationMs,
          outputTail: getOutputTail(out),
        });
      }
      const hasFailed = checks.some((c) => c.status === 'failed');
      this.baseline = {
        verdict: hasFailed ? 'failed' : 'verified',
        checks,
      };
      return this.baseline;
    }

    this.baseline = await Verification.run({
      workspaceRoot: this.workspaceRoot,
      executor: exec,
    });
    return this.baseline;
  }

  public setBaseline(baseline: VerificationResult): void {
    this.baseline = baseline;
  }

  public getBaseline(): VerificationResult | undefined {
    return this.baseline;
  }

  public async run(customCommands?: string[]): Promise<ProjectVerifierRunResult> {
    const exec = this.executor || (this.executorOptions ? createDefaultExecutor(this.executorOptions) : defaultExecutor);

    if (customCommands && customCommands.length > 0) {
      let allPassed = true;
      const outputs: string[] = [];
      let lastExitCode = 0;
      const checks: VerificationCheck[] = [];

      for (const cmd of customCommands) {
        if (!cmd || !cmd.trim()) continue;
        const startTime = Date.now();
        const res = await exec(cmd, this.workspaceRoot);
        const durationMs = Date.now() - startTime;
        const out = [res.stdout, res.stderr].filter(Boolean).join('\n');
        outputs.push(out);
        lastExitCode = res.exitCode ?? 0;

        const isFailed = res.exitCode !== 0;
        let preExisting = false;
        if (isFailed && this.baseline) {
          const baseCheck = this.baseline.checks.find(
            (c) => (c.name === cmd || c.command === cmd) && c.status === 'failed'
          );
          if (baseCheck) {
            preExisting = true;
          }
        }

        if (!isFailed) {
          checks.push({
            name: cmd,
            command: cmd,
            status: 'passed',
            exitCode: 0,
            durationMs,
            outputTail: getOutputTail(out),
          });
        } else {
          checks.push({
            name: cmd,
            command: cmd,
            status: 'failed',
            exitCode: res.exitCode ?? 1,
            durationMs,
            outputTail: getOutputTail(out),
            preExisting,
          });
          if (!preExisting) {
            allPassed = false;
            break;
          }
        }
      }

      const combined = outputs.join('\n');
      return {
        passed: allPassed,
        output: combined,
        exitCode: lastExitCode,
        checks,
      };
    }

    const vResult = await Verification.run({
      workspaceRoot: this.workspaceRoot,
      executor: exec,
      baseline: this.baseline,
    });

    const passed = vResult.verdict === 'verified';
    const output = formatVerificationFailure(vResult) || (passed ? 'All verification checks passed.' : 'No verification checks ran.');

    return {
      passed,
      output,
      exitCode: passed ? 0 : 1,
      checks: vResult.checks,
    };
  }
}
