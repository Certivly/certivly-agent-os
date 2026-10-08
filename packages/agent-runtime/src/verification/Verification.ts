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

const defaultExecutor: VerificationExecutor = async (command: string, cwd: string) => {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    const child = spawn(command, {
      shell: true,
      cwd,
      env: process.env,
      windowsHide: true,
    });

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('error', (err) => {
      stderr += `\n${err.message}`;
      resolve({ exitCode: 1, stdout, stderr });
    });

    child.on('close', (code) => {
      resolve({ exitCode: code, stdout, stderr });
    });
  });
};

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
    const executor = options.executor || defaultExecutor;
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

    const failedCount = checks.filter((c) => c.status === 'failed').length;
    const passedCount = checks.filter((c) => c.status === 'passed').length;

    let verdict: VerificationVerdict;
    if (failedCount > 0) {
      verdict = 'failed';
    } else if (passedCount > 0) {
      verdict = 'verified';
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
  constructor(
    private workspaceRoot: string,
    private executor?: VerificationExecutor
  ) {}

  public async run(customCommands?: string[]): Promise<ProjectVerifierRunResult> {
    const exec = this.executor || defaultExecutor;

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

        if (res.exitCode === 0) {
          checks.push({
            name: cmd,
            command: cmd,
            status: 'passed',
            exitCode: 0,
            durationMs,
            outputTail: getOutputTail(out),
          });
        } else {
          allPassed = false;
          checks.push({
            name: cmd,
            command: cmd,
            status: 'failed',
            exitCode: res.exitCode ?? 1,
            durationMs,
            outputTail: getOutputTail(out),
          });
          break;
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
      executor: this.executor,
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
