import type { PermissionMode } from './types';
import { isSafeCommand, isHardDeniedCommand } from '@agent-os/tools';

export { isHardDeniedCommand };

export class PermissionGuard {
  constructor(private mode: PermissionMode = 'manual') {}

  /**
   * Returns 'allow', 'block', or 'ask'.
   */
  checkEdit(_filePath: string): 'allow' | 'block' | 'ask' {
    if (this.mode === 'plan') return 'block';
    if (this.mode === 'acceptEdits' || this.mode === 'auto') return 'allow';
    return 'ask'; // 'manual'
  }

  checkCommand(command: string): 'allow' | 'block' | 'ask' {
    const hardDeny = isHardDeniedCommand(command);
    if (hardDeny.denied) {
      return 'block';
    }
    if (this.mode === 'plan') return 'block';
    if (this.mode === 'auto' && isSafeCommand(command, 'workspace-write')) {
      return 'allow';
    }
    return 'ask'; // 'manual' and 'acceptEdits' for commands, or non-safe in 'auto'
  }

  get isPlanMode(): boolean {
    return this.mode === 'plan';
  }

  get currentMode(): PermissionMode {
    return this.mode;
  }
}
