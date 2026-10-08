import { spawn, execSync, execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import { ExecutionOptions, ExecutionResult } from './models';

export const execFileAsync = promisify(execFile);

export function sanitizeEnv(env: Record<string, string | undefined>): Record<string, string | undefined> {
  const secretPattern = /(_API_KEY|_TOKEN|_SECRET|_PASSWORD)$/i;
  const cleanEnv: Record<string, string | undefined> = {};
  for (const [key, val] of Object.entries(env)) {
    if (!secretPattern.test(key)) {
      cleanEnv[key] = val;
    }
  }
  return cleanEnv;
}

export function killProcessTree(pid: number): void {
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore' });
    } else {
      try {
        process.kill(-pid, 'SIGKILL');
      } catch {
        process.kill(pid, 'SIGKILL');
      }
    }
  } catch {
    // Process already exited
  }
}

export async function executeInDir(
  command: string,
  cwd: string,
  options?: ExecutionOptions
): Promise<ExecutionResult> {
  const baseEnv = sanitizeEnv(process.env as Record<string, string | undefined>);
  const finalEnv = { ...baseEnv, ...(options?.env || {}) };
  const effectiveCwd = options?.cwd ? path.resolve(cwd, options.cwd) : cwd;
  const timeoutMs = options?.timeoutMs;
  const shell = options?.shell !== undefined ? options.shell : true;

  return new Promise((resolve) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(command, {
        shell,
        cwd: effectiveCwd,
        env: finalEnv as NodeJS.ProcessEnv,
        windowsHide: true,
        detached: process.platform !== 'win32',
      });
    } catch (err: any) {
      return resolve({
        stdout: '',
        stderr: err?.message || String(err),
        exitCode: 1,
      });
    }

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;

    child.stdout?.on('data', (d) => {
      stdout += d.toString();
    });
    child.stderr?.on('data', (d) => {
      stderr += d.toString();
    });

    let timer: NodeJS.Timeout | undefined;
    if (timeoutMs && timeoutMs > 0) {
      timer = setTimeout(() => {
        timedOut = true;
        if (child.pid) killProcessTree(child.pid);
      }, timeoutMs);
    }

    const abortHandler = () => {
      if (child.pid) killProcessTree(child.pid);
    };

    if (options?.signal) {
      options.signal.addEventListener('abort', abortHandler, { once: true });
    }

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      if (options?.signal) {
        options.signal.removeEventListener('abort', abortHandler);
      }
    };

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({
        stdout,
        stderr: stderr || err.message,
        exitCode: 1,
        timedOut,
      });
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      cleanup();

      const maxChars = 30_000;
      const cleanStdout = stdout.length > maxChars ? stdout.slice(0, maxChars) + '\n... [truncated]' : stdout;
      const cleanStderr = stderr.length > maxChars ? stderr.slice(0, maxChars) + '\n... [truncated]' : stderr;

      resolve({
        stdout: cleanStdout,
        stderr: cleanStderr,
        exitCode: timedOut ? 124 : (code ?? (options?.signal?.aborted ? 130 : 0)),
        timedOut,
      });
    });
  });
}
