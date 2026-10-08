import type { PermissionMode } from './types';

// Low-risk commands that are auto-allowed in 'auto' mode
const SAFE_COMMAND_PATTERNS = [
  /^bun\s+(test|run|install)/,
  /^bunx\s+tsc/,
  /^git\s+(status|log|diff|show)/,
  /^cat\s+/,
  /^echo\s+/,
];

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
    if (this.mode === 'plan') return 'block';
    const trimmed = (command || '').trim();
    if (this.mode === 'auto' && SAFE_COMMAND_PATTERNS.some((p) => p.test(trimmed))) {
      return 'allow';
    }
    return 'ask'; // 'manual' and 'acceptEdits' for commands
  }

  get isPlanMode(): boolean {
    return this.mode === 'plan';
  }

  get currentMode(): PermissionMode {
    return this.mode;
  }
}
