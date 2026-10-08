import type { HookDefinition } from '@agent-os/config';
import { spawnSync, execSync } from 'child_process';

export type HookEnv = Record<string, string>;

export class HookRunner {
  static async run(
    hook: HookDefinition,
    env: HookEnv = {},
    sandboxRoot: string = process.cwd()
  ): Promise<{ ok: boolean; output: string }> {
    const timeoutMs = hook.timeoutMs ?? 5000;

    // Expand $VARIABLE and ${VARIABLE} references in hook.command using env
    let expandedCommand = hook.command;
    for (const [key, val] of Object.entries(env)) {
      expandedCommand = expandedCommand.split(`\${${key}}`).join(val);
      expandedCommand = expandedCommand.split(`$${key}`).join(val);
    }

    const isWin = process.platform === 'win32';
    let shell = 'sh';
    if (isWin) {
      try {
        execSync('where.exe sh', { stdio: 'ignore' });
        shell = 'sh';
      } catch {
        shell = 'cmd.exe';
      }
    }

    const args = shell === 'cmd.exe' ? ['/d', '/s', '/c', expandedCommand] : ['-c', expandedCommand];

    try {
      const result = spawnSync(shell, args, {
        cwd: sandboxRoot,
        env: {
          ...process.env,
          ...env,
        },
        timeout: timeoutMs,
        encoding: 'utf8',
        windowsHide: true,
        maxBuffer: 1024 * 1024,
      });

      const stdout = result.stdout || '';
      const stderr = result.stderr || '';
      const output = (stdout + stderr).replace(/\r\n/g, '\n');

      if (result.error) {
        return {
          ok: false,
          output: output || result.error.message || 'Hook execution timed out or failed',
        };
      }

      return {
        ok: result.status === 0,
        output,
      };
    } catch (err: any) {
      return {
        ok: false,
        output: err.message || String(err),
      };
    }
  }
}
