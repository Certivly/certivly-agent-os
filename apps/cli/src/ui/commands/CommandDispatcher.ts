export interface CommandEntry {
  name: string;
  syntax: string;
  category: 'Mode' | 'Inspection' | 'Sandbox' | 'Intelligence' | 'System';
  description: string;
}

export interface CommandDispatchResult {
  isCommand: boolean;
  command?: string;
  args?: string[];
  action?: 'set_mode' | 'set_model' | 'toggle_diff' | 'toggle_todos' | 'compact' | 'undo' | 'review' | 'bugfix' | 'research' | 'librarian' | 'doctor' | 'mcp' | 'skills' | 'skill' | 'agents' | 'team' | 'snapshots' | 'clear' | 'help' | 'unknown';
  payload?: any;
  message?: string;
}

export class CommandDispatcher {
  public static readonly COMMANDS: CommandEntry[] = [
    { name: 'plan', syntax: '/plan [goal]', category: 'Mode', description: 'Switch to Plan mode (read-only architectural exploration)' },
    { name: 'build', syntax: '/build [goal]', category: 'Mode', description: 'Switch to Build mode (workspace mutations enabled)' },
    { name: 'diff', syntax: '/diff [file]', category: 'Inspection', description: 'Open/close visual terminal diff inspector' },
    { name: 'todos', syntax: '/todos', category: 'Inspection', description: 'View or toggle session checklist and task progress' },
    { name: 'model', syntax: '/model <modelId>', category: 'Intelligence', description: 'Hot-switch active reasoning model' },
    { name: 'compact', syntax: '/compact', category: 'Intelligence', description: 'Force context pruning & compaction to save tokens' },
    { name: 'research', syntax: '/research <topic>', category: 'Intelligence', description: 'Perform autonomous deep web & documentation research with citations' },
    { name: 'review', syntax: '/review', category: 'Intelligence', description: 'Dispatch ReviewSubagent to evaluate changeset' },
    { name: 'bugfix', syntax: '/bugfix [target]', category: 'Intelligence', description: 'Run project verifier and autonomously isolate and fix failing tests' },
    { name: 'team', syntax: '/team [workflow] [goal]', category: 'Intelligence', description: 'Execute a multi-agent team workflow (deep-research, research-and-implement, investigate-and-fix)' },
    { name: 'agents', syntax: '/agents', category: 'Intelligence', description: 'List all available specialized subagents and their tool permissions' },
    { name: 'undo', syntax: '/undo', category: 'Sandbox', description: 'Revert last uncommitted sandbox changeset' },
    { name: 'revert', syntax: '/revert [id]', category: 'Sandbox', description: 'Surgically revert workspace to a previous checkpoint or run' },
    { name: 'snapshots', syntax: '/snapshots', category: 'Sandbox', description: 'List historical shadow git snapshot checkpoints' },
    { name: 'librarian', syntax: '/librarian <repoUrl>', category: 'Intelligence', description: 'Inspect and query an external git repository' },
    { name: 'skills', syntax: '/skills', category: 'Intelligence', description: 'List all installed workspace and user skills' },
    { name: 'skill', syntax: '/skill <name>', category: 'Intelligence', description: 'Activate and load a specialized skill into session' },
    { name: 'mcp', syntax: '/mcp [status|tools]', category: 'System', description: 'Inspect connected MCP servers and tools' },
    { name: 'doctor', syntax: '/doctor', category: 'System', description: 'Run AgentOS system diagnostics and health checks' },
    { name: 'clear', syntax: '/clear', category: 'System', description: 'Clear conversation viewport and logs' },
    { name: 'help', syntax: '/help', category: 'System', description: 'Display complete slash commands and keybindings reference' },
  ];

  public static getAvailableCommands(): CommandEntry[] {
    return this.COMMANDS;
  }

  public static searchCommands(query: string): CommandEntry[] {
    const clean = query.replace(/^\//, '').toLowerCase().trim();
    if (!clean) return this.COMMANDS;
    return this.COMMANDS.filter(cmd => 
      cmd.name.toLowerCase().includes(clean) ||
      cmd.description.toLowerCase().includes(clean) ||
      cmd.category.toLowerCase().includes(clean)
    );
  }

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

      case 'todos':
        return {
          isCommand: true,
          command: 'todos',
          args,
          action: 'toggle_todos',
          message: 'Toggling session checklist panel...',
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
      case 'revert':
        return {
          isCommand: true,
          command: cmd,
          args,
          action: 'undo',
          payload: { targetId: args[0] },
          message: args[0] ? `Reverting to checkpoint/run ${args[0]}...` : 'Reverting last uncommitted sandbox change set...',
        };

      case 'snapshots':
        return {
          isCommand: true,
          command: 'snapshots',
          args,
          action: 'snapshots',
          message: 'Listing available workspace snapshots...',
        };

      case 'review':
        return {
          isCommand: true,
          command: 'review',
          args,
          action: 'review',
          message: 'Dispatching ReviewSubagent to evaluate pending diff and verification status...',
        };

      case 'bugfix':
        return {
          isCommand: true,
          command: 'bugfix',
          args,
          action: 'bugfix',
          payload: { target: rest || undefined },
          message: rest ? `Starting autonomous bugfix loop for: ${rest}...` : 'Running project verifier to isolate and resolve failures...',
        };

      case 'skills':
        return {
          isCommand: true,
          command: 'skills',
          args,
          action: 'skills',
          message: 'Listing available specialized skills...',
        };

      case 'skill':
        if (!args[0]) {
          return {
            isCommand: true,
            command: 'skill',
            args,
            action: 'skills',
            message: 'Usage: /skill <name> (e.g. /skill systematic-debugging). Listing available skills...',
          };
        }
        return {
          isCommand: true,
          command: 'skill',
          args,
          action: 'skill',
          payload: { skillName: args[0] },
          message: `Loading skill: ${args[0]}`,
        };

      case 'agents':
        return {
          isCommand: true,
          command: 'agents',
          args,
          action: 'agents',
          message: 'Listing available specialized subagents...',
        };

      case 'research':
        if (!rest) {
          return {
            isCommand: true,
            command: 'research',
            args,
            action: 'unknown',
            message: 'Usage: /research <topic or question> (e.g. /research Bun 1.1 cross-platform shell or /research Next.js 15 server actions)',
          };
        }
        return {
          isCommand: true,
          command: 'research',
          args,
          action: 'research',
          payload: { query: rest },
          message: `Dispatching Deep Research for: "${rest}"...`,
        };

      case 'team': {
        const validWorkflows = ['deep-research', 'research-and-implement', 'investigate-and-fix', 'audit-and-review'];
        const firstArg = args[0]?.toLowerCase();
        let workflow: string = 'research-and-implement';
        let goal: string = '';

        if (firstArg && validWorkflows.includes(firstArg)) {
          workflow = firstArg;
          goal = args.slice(1).join(' ') || 'Autonomous team execution';
        } else {
          workflow = 'research-and-implement';
          goal = args.join(' ') || 'Autonomous team execution';
        }

        return {
          isCommand: true,
          command: 'team',
          args,
          action: 'team',
          payload: {
            workflow,
            goal,
          },
          message: `Coordinating multi-agent team (${workflow}) for: ${goal}...`,
        };
      }

      case 'librarian':
        if (!args[0]) {
          return {
            isCommand: true,
            command: 'librarian',
            args,
            action: 'unknown',
            message: 'Usage: /librarian <repo-url> (e.g. /librarian https://github.com/owner/repo)',
          };
        }
        return {
          isCommand: true,
          command: 'librarian',
          args,
          action: 'librarian',
          payload: { repoUrl: args[0], question: args.slice(1).join(' ') || 'Summarize architecture' },
          message: `Dispatching LibrarianSubagent to investigate: ${args[0]}...`,
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

      case 'clear':
        return {
          isCommand: true,
          command: 'clear',
          args,
          action: 'clear',
          message: 'Cleared view buffer.',
        };

      case 'help':
        return {
          isCommand: true,
          command: 'help',
          args,
          action: 'help',
          message: [
            'Available Slash Commands:',
            '  /plan [goal]      - Switch to Plan mode (read-only architectural exploration)',
            '  /build [goal]     - Switch to Build mode (workspace mutations enabled)',
            '  /diff [file]      - Open/close interactive terminal diff inspector',
            '  /todos            - View/toggle live session task checklist',
            '  /model <modelId>  - Hot-switch active reasoning model',
            '  /compact          - Force context compaction to reduce token usage',
            '  /review           - Trigger ReviewSubagent check on current changeset',
            '  /bugfix [target]  - Autonomously run project verifier and fix failures',
            '  /team [flow] [g]  - Coordinate multi-agent team (research-and-implement, investigate-and-fix)',
            '  /agents           - List all available specialized subagents and tool permissions',
            '  /undo             - Revert last uncommitted changeset in sandbox',
            '  /librarian <url>  - Shallow-clone and query external git repository',
            '  /skills           - List all available workspace and user skills',
            '  /skill <name>     - Load instructions and recipes for a skill',
            '  /mcp              - Display connected MCP servers and tools',
            '  /doctor           - Run system diagnostics',
            '  /clear            - Clear viewport logs',
            '  /help             - Display this help reference',
            '',
            'Keybindings: Tab toggles Plan/Build · Ctrl+D diff · Ctrl+T todos · / for palette · Ctrl+C to quit',
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
