import type { PermissionMode } from './types';
import { isSafeCommand, isHardDeniedCommand, isReadOnlyCommand } from '@agent-os/tools';

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
    const isReadOnly = isReadOnlyCommand(command);
    if (this.mode === 'plan') {
      return isReadOnly ? 'allow' : 'block';
    }
    // Read-only inspection commands (git status, git diff, ls, dir, etc.)
    // do not require manual approval
    if (isReadOnly) {
      return 'allow';
    }
    if (this.mode === 'auto' && isSafeCommand(command, 'workspace-write')) {
      return 'allow';
    }
    return 'ask'; // 'manual' and 'acceptEdits' for mutating commands, or non-safe in 'auto'
  }

  checkTool(toolName: string, readOnly: boolean): 'allow' | 'block' | 'ask' {
    if (this.mode === 'plan') {
      return readOnly ? 'allow' : 'block';
    }
    if (readOnly) {
      return 'allow';
    }
    if (this.mode === 'auto') {
      return 'allow';
    }
    return 'ask';
  }

  get isPlanMode(): boolean {
    return this.mode === 'plan';
  }

  get currentMode(): PermissionMode {
    return this.mode;
  }
}
