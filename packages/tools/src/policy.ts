export type ToolMode = 'read-only' | 'workspace-write' | 'full-access';

export enum CommandMode {
  ASK = 'ask',
  AUTO = 'auto',
  DANGER = 'danger',
}

export interface PolicyDecision {
  allowed: boolean;
  reason?: string;
  requiresApproval?: boolean;
}

export const MAX_COMMAND_OUTPUT = 30_000;

export function truncateOutput(output: string, maxChars: number = MAX_COMMAND_OUTPUT): string {
  if (!output || output.length <= maxChars) {
    return output || '';
  }
  const keepChars = Math.floor((maxChars - 100) / 2);
  const head = output.slice(0, keepChars);
  const tail = output.slice(output.length - keepChars);
  const omitted = output.length - (head.length + tail.length);
  return `${head}\n\n... [output truncated: ${omitted} characters omitted] ...\n\n${tail}`;
}

export function hasShellOperators(command: string): boolean {
  if (typeof command !== 'string') return true;
  // Subshell invocation $() and backticks always trigger even inside quotes
  if (/\$\(/.test(command)) return true;
  if (/`/.test(command)) return true;

  // Strip quoted strings to inspect unquoted operators
  const unquoted = command
    .replace(/"(?:\\.|[^"\\])*"/g, '')
    .replace(/'(?:\\.|[^'\\])*'/g, '');

  // Shell chaining / redirection / subshell / pipes:
  // ;, |, &, >, <, (, ), \r, \n
  if (/[;&|><()\r\n]/.test(unquoted)) return true;
  return false;
}

export function parseCommandTokens(command: string): string[] {
  const trimmed = command.trim();
  if (!trimmed) return [];
  const tokens: string[] = [];
  const regex = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(trimmed)) !== null) {
    tokens.push(match[1] ?? match[2] ?? match[3]);
  }
  return tokens;
}

export function isReadOnlyCommand(command: string): boolean {
  if (hasShellOperators(command)) return false;
  const tokens = parseCommandTokens(command);
  if (tokens.length === 0) return false;

  const base = tokens[0].toLowerCase().replace(/\.exe$/, '');

  if (base === 'git') {
    const sub = tokens[1]?.toLowerCase();
    const safeGitSubcommands = [
      'status',
      'diff',
      'log',
      'show',
      'branch',
      'tag',
      'check-ignore',
      'rev-parse',
      'describe',
      'grep',
      'version',
      '--version',
    ];
    return safeGitSubcommands.includes(sub);
  }

  const safeInspectCommands = [
    'rg',
    'ripgrep',
    'grep',
    'ls',
    'dir',
    'pwd',
    'cat',
    'head',
    'tail',
    'type',
    'echo',
    'which',
    'where',
  ];
  if (safeInspectCommands.includes(base)) {
    return true;
  }

  if (['node', 'bun', 'npm', 'pnpm', 'git'].includes(base)) {
    if (tokens.length === 2 && (tokens[1] === '-v' || tokens[1] === '--version')) {
      return true;
    }
  }

  return false;
}

export function isDestructiveGitCommand(command: string): boolean {
  const tokens = parseCommandTokens(command);
  if (tokens.length === 0) return false;
  const base = tokens[0].toLowerCase().replace(/\.exe$/, '');
  if (base !== 'git') return false;

  const sub = tokens[1]?.toLowerCase();
  if (!sub) return false;

  if (sub === 'reset' && tokens.some(t => t.toLowerCase() === '--hard')) return true;
  if (sub === 'clean' && tokens.some(t => /-[a-zA-Z]*f/i.test(t))) return true;
  if (sub === 'push' && tokens.some(t => t === '-f' || t === '--force' || t === '--force-with-lease')) return true;
  if (sub === 'checkout' && tokens.some(t => t === '-f' || t === '--force' || t === '.')) return true;
  if (sub === 'restore' && tokens.some(t => t === '.' || t === '*' || t === '--staged')) return true;
  if (sub === 'branch' && tokens.some(t => t === '-D')) return true;
  if (sub === 'rebase') return true;
  if (sub === 'stash' && tokens.some(t => ['drop', 'clear', 'pop'].includes(t.toLowerCase()))) return true;

  return false;
}

export function isNetworkDownloadCommand(command: string): boolean {
  const tokens = parseCommandTokens(command);
  if (tokens.length === 0) return false;
  const base = tokens[0].toLowerCase().replace(/\.exe$/, '');
  const downloadBases = [
    'curl',
    'wget',
    'nc',
    'netcat',
    'ncat',
    'telnet',
    'ssh',
    'scp',
    'sftp',
    'ftp',
    'rsync',
    'invoke-webrequest',
    'iwr',
    'invoke-restmethod',
    'irm',
  ];
  return downloadBases.includes(base);
}

export function isPackageInstallCommand(command: string): boolean {
  const tokens = parseCommandTokens(command);
  if (tokens.length === 0) return false;
  const base = tokens[0].toLowerCase().replace(/\.exe$/, '');
  const sub = tokens[1]?.toLowerCase();

  if (['npm', 'pnpm', 'yarn', 'bun'].includes(base)) {
    if (['install', 'i', 'add', 'ci', 'update', 'upgrade'].includes(sub || '')) {
      return true;
    }
  }

  if (['pip', 'pip3'].includes(base)) {
    if (sub === 'install' || sub === 'uninstall') return true;
  }

  if (base === 'cargo' && sub === 'install') return true;
  if (base === 'gem' && sub === 'install') return true;

  return false;
}

export function isEncodedCommand(command: string): boolean {
  const lower = command.toLowerCase();
  if (/powershell|pwsh/.test(lower) && /-(?:e|ec|enc|encodedcommand)\b/i.test(command)) {
    return true;
  }
  if (/base64\b.*(?:-d|--decode).*\|\s*(?:ba)?sh/i.test(command)) {
    return true;
  }
  if (/certutil\s+-(?:decode|decodehex)/i.test(lower)) {
    return true;
  }
  return false;
}

export function isSafeCommand(command: string, mode: ToolMode = 'workspace-write'): boolean {
  if (mode === 'full-access') return true;
  if (hasShellOperators(command)) return false;
  if (isDestructiveGitCommand(command)) return false;
  if (isNetworkDownloadCommand(command)) return false;
  if (isPackageInstallCommand(command)) return false;
  if (isEncodedCommand(command)) return false;

  if (mode === 'read-only') return isReadOnlyCommand(command);

  if (isReadOnlyCommand(command)) return true;

  const tokens = parseCommandTokens(command);
  if (tokens.length === 0) return false;
  const base = tokens[0].toLowerCase().replace(/\.exe$/, '');

  if (base === 'bun') {
    const sub = tokens[1]?.toLowerCase();
    if (sub === 'test') return true;
    if (sub === 'run') {
      const action = tokens[2]?.toLowerCase();
      return ['test', 'build', 'check', 'lint', 'typecheck'].includes(action);
    }
    if (sub === '-v' || sub === '--version') return true;
  }

  if (base === 'npm' || base === 'pnpm') {
    const sub = tokens[1]?.toLowerCase();
    if (sub === 'test') return true;
    if (sub === 'run') {
      const action = tokens[2]?.toLowerCase();
      return ['test', 'build', 'check', 'lint', 'typecheck'].includes(action);
    }
    if (sub === '-v' || sub === '--version') return true;
  }

  if (base === 'tsc') {
    return true;
  }

  if (base === 'bunx' || base === 'npx') {
    const sub = tokens[1]?.toLowerCase();
    if (sub === 'tsc') return true;
  }

  if (base === 'cargo') {
    const sub = tokens[1]?.toLowerCase();
    return ['test', 'check'].includes(sub);
  }

  if (base === 'pytest' || base === 'vitest' || base === 'jest') {
    return true;
  }

  return false;
}

export const HARD_DENY_COMMAND_PATTERNS: RegExp[] = [
  // Fork bombs
  /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/,
  /bomb\(\)\s*\{\s*bomb\s*\|\s*bomb\s*&\s*\}\s*;/,
  // Disk partition / format
  /\b(?:mkfs|fdisk|gdisk|parted)\b/i,
  /\bformat\s+[a-zA-Z]:/i,
  /\bdiskpart\b/i,
  // Raw block device writes
  /\bdd\s+.*of=\/dev\/(?:sd[a-z]|hd[a-z]|nvme[0-9]n[0-9]|null|zero|disk)/i,
  />\s*\/dev\/(?:sd[a-z]|hd[a-z]|nvme[0-9]|mem|kmem)/i,
  // System power/shutdown control
  /\b(?:shutdown|reboot|poweroff|halt|init\s+[06])\b/i,
];

export function isHardDeniedCommand(command: string): { denied: boolean; reason?: string } {
  const trimmed = (command || '').trim();
  for (const pattern of HARD_DENY_COMMAND_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        denied: true,
        reason: 'Command matches hard-deny safety pattern (destructive system operation)',
      };
    }
  }
  return { denied: false };
}

export class CommandPolicyEngine {
  private mode: ToolMode;
  private rawMode: ToolMode | CommandMode;
  private recordedCommands: string[] = [];
  private approvalCallback?: (command: string) => Promise<boolean>;

  constructor(mode: ToolMode | CommandMode = 'workspace-write') {
    this.rawMode = mode;
    this.mode = this.normalizeMode(mode);
  }

  private normalizeMode(mode: ToolMode | CommandMode): ToolMode {
    if (mode === CommandMode.DANGER || mode === 'full-access') return 'full-access';
    if (mode === CommandMode.ASK) return 'workspace-write';
    if (mode === CommandMode.AUTO || mode === 'workspace-write') return 'workspace-write';
    if (mode === 'read-only') return 'read-only';
    return 'workspace-write';
  }

  setApprovalCallback(callback: (command: string) => Promise<boolean>) {
    this.approvalCallback = callback;
  }

  setMode(mode: ToolMode | CommandMode) {
    this.rawMode = mode;
    this.mode = this.normalizeMode(mode);
  }

  getMode(): ToolMode {
    return this.mode;
  }

  getRecordedCommands(): string[] {
    return [...this.recordedCommands];
  }

  clearRecordedCommands() {
    this.recordedCommands = [];
  }

  async evaluate(command: string): Promise<PolicyDecision> {
    this.recordedCommands.push(command);

    if (this.mode === 'full-access' || this.rawMode === CommandMode.DANGER) {
      return { allowed: true };
    }

    // Explicit ASK mode requires approval on every command unless callback approves
    if (this.rawMode === CommandMode.ASK) {
      if (this.approvalCallback) {
        const approved = await this.approvalCallback(command);
        return approved ? { allowed: true } : { allowed: false, reason: 'User denied execution' };
      }
      return {
        allowed: false,
        requiresApproval: true,
        reason: 'Command requires user approval, but no approval callback is configured.',
      };
    }

    if (hasShellOperators(command)) {
      if (this.mode === 'read-only') {
        return {
          allowed: false,
          reason: 'Compound or redirected commands not permitted in read-only mode',
        };
      }
      if (this.approvalCallback) {
        const approved = await this.approvalCallback(command);
        return approved ? { allowed: true } : { allowed: false, reason: 'User denied execution' };
      }
      return {
        allowed: false,
        requiresApproval: true,
        reason: 'Compound or shell operator command requires approval',
      };
    }

    if (isDestructiveGitCommand(command)) {
      if (this.approvalCallback) {
        const approved = await this.approvalCallback(command);
        return approved ? { allowed: true } : { allowed: false, reason: 'User denied execution' };
      }
      return {
        allowed: false,
        requiresApproval: true,
        reason: 'Destructive git command requires approval',
      };
    }

    if (isNetworkDownloadCommand(command)) {
      if (this.approvalCallback) {
        const approved = await this.approvalCallback(command);
        return approved ? { allowed: true } : { allowed: false, reason: 'User denied execution' };
      }
      return {
        allowed: false,
        requiresApproval: true,
        reason: 'Network download command requires approval',
      };
    }

    if (isPackageInstallCommand(command)) {
      if (this.approvalCallback) {
        const approved = await this.approvalCallback(command);
        return approved ? { allowed: true } : { allowed: false, reason: 'User denied execution' };
      }
      return {
        allowed: false,
        requiresApproval: true,
        reason: 'Package install or update command requires approval',
      };
    }

    if (isEncodedCommand(command)) {
      if (this.approvalCallback) {
        const approved = await this.approvalCallback(command);
        return approved ? { allowed: true } : { allowed: false, reason: 'User denied execution' };
      }
      return {
        allowed: false,
        requiresApproval: true,
        reason: 'Encoded shell execution requires approval',
      };
    }

    if (this.mode === 'read-only') {
      if (isReadOnlyCommand(command)) {
        return { allowed: true };
      }
      return {
        allowed: false,
        reason: `Command '${command}' not permitted in read-only mode`,
      };
    }

    if (this.mode === 'workspace-write') {
      if (isSafeCommand(command, 'workspace-write')) {
        return { allowed: true };
      }
      if (this.approvalCallback) {
        const approved = await this.approvalCallback(command);
        return approved ? { allowed: true } : { allowed: false, reason: 'User denied execution' };
      }
      return {
        allowed: false,
        requiresApproval: true,
        reason: `Command '${command}' is not in safe allowlist; requires approval`,
      };
    }

    return { allowed: false, requiresApproval: true, reason: 'Command requires approval' };
  }
}

export const commandPolicyEngine = new CommandPolicyEngine();
