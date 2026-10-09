export interface CommandDispatchResult {
  isCommand: boolean;
  command?: string;
  args?: string[];
  action?: 'set_mode' | 'set_model' | 'toggle_diff' | 'compact' | 'undo' | 'review' | 'doctor' | 'mcp' | 'help' | 'unknown';
  payload?: any;
  message?: string;
}

export class CommandDispatcher {
  public static isCommand(input: string): boolean {
    return input.trim().startsWith('/');
  }

  public static dispatch(rawInput: string): CommandDispatchResult {
    const trimmed = rawInput.trim();
    if (!trimmed.startsWith('/')) {
      return { isCommand: false };
    }

    const parts = trimmed.slice(1).split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);
    const rest = args.join(' ');

    switch (cmd) {
      case 'plan':
        return {
          isCommand: true,
          command: 'plan',
          args,
          action: 'set_mode',
          payload: { mode: 'plan', goal: rest || undefined },
          message: rest ? `Switched to Plan Mode: ${rest}` : 'Switched to Plan Mode (Read-Only exploration)',
        };

      case 'build':
        return {
          isCommand: true,
          command: 'build',
          args,
          action: 'set_mode',
          payload: { mode: 'manual', goal: rest || undefined },
          message: rest ? `Switched to Build Mode: ${rest}` : 'Switched to Build Mode (Workspace mutations enabled)',
        };

      case 'diff':
        return {
          isCommand: true,
          command: 'diff',
          args,
          action: 'toggle_diff',
          payload: { file: args[0] },
          message: 'Toggling visual diff panel...',
        };

      case 'compact':
        return {
          isCommand: true,
          command: 'compact',
          args,
          action: 'compact',
          message: 'Triggering context compaction and pruning message history...',
        };

      case 'model':
        if (!args[0]) {
          return {
            isCommand: true,
            command: 'model',
            args,
            action: 'unknown',
            message: 'Usage: /model <model-id> (e.g. /model claude-3-5-sonnet-20241022 or /model deepseek-chat)',
          };
        }
        return {
          isCommand: true,
          command: 'model',
          args,
          action: 'set_model',
          payload: { modelId: args[0] },
          message: `Switched active reasoning model to: ${args[0]}`,
        };

      case 'undo':
        return {
          isCommand: true,
          command: 'undo',
          args,
          action: 'undo',
          message: 'Reverting last uncommitted sandbox change set...',
        };

      case 'review':
        return {
          isCommand: true,
          command: 'review',
          args,
          action: 'review',
          message: 'Dispatching ReviewSubagent to evaluate pending diff and verification status...',
        };

      case 'doctor':
        return {
          isCommand: true,
          command: 'doctor',
          args,
          action: 'doctor',
          message: 'Running AgentOS system diagnostics...',
        };

      case 'mcp':
        return {
          isCommand: true,
          command: 'mcp',
          args,
          action: 'mcp',
          payload: { subCommand: args[0] || 'status' },
          message: 'Inspecting connected Model Context Protocol (MCP) servers...',
        };

      case 'help':
        return {
          isCommand: true,
          command: 'help',
          args,
          action: 'help',
          message: [
            'Available Slash Commands:',
            '  /plan [goal]     - Switch to Plan mode (read-only architectural exploration)',
            '  /build [goal]    - Switch to Build mode (workspace mutations enabled)',
            '  /diff [file]     - Open/close interactive terminal diff inspector',
            '  /model <modelId> - Hot-switch active reasoning model',
            '  /compact         - Force context compaction to reduce token usage',
            '  /review          - Trigger ReviewSubagent check on current changeset',
            '  /undo            - Revert last uncommitted changeset in sandbox',
            '  /mcp             - Display connected MCP servers and tools',
            '  /doctor          - Run system diagnostics',
            '  /help            - Display this help reference',
            '',
            'Keybindings: Tab toggles Plan/Build mode · Ctrl+D toggles diff panel · Ctrl+C to quit',
          ].join('\n'),
        };

      default:
        return {
          isCommand: true,
          command: cmd,
          args,
          action: 'unknown',
          message: `Unknown command '/${cmd}'. Type /help for available commands.`,
        };
    }
  }
}
