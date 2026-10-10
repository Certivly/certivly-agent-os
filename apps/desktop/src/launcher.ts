import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';

export interface LaunchDesktopOptions {
  port?: number;
  host?: string;
  workspaceRoot?: string;
  useElectron?: boolean;
}

export function launchElectronApp(options: LaunchDesktopOptions = {}): ChildProcess {
  const desktopRoot = path.resolve(__dirname, '..');
  const cmd = process.platform === 'win32' ? 'bunx.cmd' : 'bunx';

  const child = spawn(cmd, ['electron', '.'], {
    cwd: desktopRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      AGENTOS_DESKTOP_PORT: String(options.port || 3456),
      AGENTOS_DESKTOP_HOST: options.host || '127.0.0.1',
      AGENTOS_WORKSPACE_ROOT: options.workspaceRoot || process.cwd(),
    },
  });

  return child;
}
