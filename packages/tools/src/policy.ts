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

export class CommandPolicyEngine {
  private mode: CommandMode;
  
  // A callback the runtime can set to ask for user approval
  private approvalCallback?: (command: string) => Promise<boolean>;

  constructor(mode: CommandMode = CommandMode.ASK) {
    this.mode = mode;
  }

  setApprovalCallback(callback: (command: string) => Promise<boolean>) {
    this.approvalCallback = callback;
  }

  setMode(mode: CommandMode) {
    this.mode = mode;
  }

  async evaluate(command: string): Promise<PolicyDecision> {
    if (this.mode === CommandMode.DANGER) {
      return { allowed: true };
    }

    if (this.mode === CommandMode.AUTO) {
      // In a real system, we'd check against a list of safe commands.
      // For Phase 1.1, AUTO means execute without asking if it's generally safe.
      // We will define a basic set of safe prefixes.
      const safePrefixes = ['ls', 'dir', 'echo', 'cat', 'type', 'git status', 'pwd'];
      const isSafe = safePrefixes.some(prefix => command.trim().startsWith(prefix));
      if (isSafe) {
        return { allowed: true };
      }
      // Fallback to ASK if not safe
    }

    // ASK mode or fallback from AUTO
    if (this.approvalCallback) {
      const approved = await this.approvalCallback(command);
      if (approved) {
        return { allowed: true };
      } else {
        return { allowed: false, reason: 'User denied execution' };
      }
    }

    // If no approval callback is set, we must reject in ASK mode to be secure.
    return { 
      allowed: false, 
      requiresApproval: true, 
      reason: 'Command requires user approval, but no approval callback is configured.' 
    };
  }
}

export const commandPolicyEngine = new CommandPolicyEngine();
