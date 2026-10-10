import type { WorkspaceTool, ToolContext, ToolResult } from '../types';
import { commandPolicyEngine } from '../policy';

export const terminalInteractiveTool: WorkspaceTool = {
  spec: {
    name: 'terminal_interactive',
    description:
      'Manage persistent, interactive terminal sessions for long-running processes (dev servers, REPLs, database shells, interactive prompts). Supports starting sessions, typing keystrokes, sending control keys (ctrl-c, ctrl-d, etc.), waiting for stream idle, and capturing screen buffer.',
    readOnly: false,
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['start', 'send', 'capture', 'wait', 'stop'],
          description: 'Terminal action to perform: start a new session, send input, capture screen buffer, wait for idle, or stop/kill session.',
        },
        sessionId: {
          type: 'string',
          description: 'Unique identifier for the terminal session (e.g. "dev-server", "python-repl", "installer")',
        },
        command: {
          type: 'string',
          description: 'Shell or command executable to launch when action is "start" (e.g. "python", "node", "bash", "cmd.exe")',
        },
        input: {
          type: 'string',
          description: 'Text to send to the terminal session when action is "send"',
        },
        pressEnter: {
          type: 'boolean',
          description: 'Whether to append newline/enter when sending input (default: true)',
        },
        controlKey: {
          type: 'string',
          enum: ['ctrl-c', 'ctrl-d', 'tab', 'escape'],
          description: 'Special control key combination to send to the terminal',
        },
        maxLines: {
          type: 'number',
          description: 'Maximum lines of visual screen buffer to return (default: 50)',
        },
        waitMs: {
          type: 'number',
          description: 'Milliseconds to wait for output to stabilize after sending input or waiting for idle (default: 1000)',
        },
      },
      required: ['action', 'sessionId'],
    },
  },
  requiresApproval: async (args: Record<string, unknown>): Promise<boolean> => {
    const action = String(args.action || '');
    if (action === 'start') {
      const cmd = typeof args.command === 'string' ? args.command.trim() : '';
      if (cmd) {
        const decision = await commandPolicyEngine.evaluate(cmd);
        return !decision.allowed || Boolean(decision.requiresApproval);
      }
      return false;
    }
    if (action === 'send') {
      const input = typeof args.input === 'string' ? args.input.trim() : '';
      if (input) {
        const decision = await commandPolicyEngine.evaluate(input);
        return !decision.allowed || Boolean(decision.requiresApproval);
      }
    }
    return false;
  },
  execute: async (args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> => {
    const action = String(args.action || '');
    const sessionId = String(args.sessionId || '').trim();

    if (!sessionId) {
      return {
        content: 'Error: "sessionId" is required for terminal_interactive.',
        isError: true,
      };
    }

    const { TerminalSessionManager } = await import('@agent-os/sandbox');
    const manager = TerminalSessionManager.getInstance();

    const root = context?.workspaceRoot || process.cwd();
    const effectiveCwd = context?.cwd || root;
    const maxLines = typeof args.maxLines === 'number' ? args.maxLines : 50;

    switch (action) {
      case 'start': {
        const cmd = typeof args.command === 'string' && args.command.trim() ? args.command.trim() : undefined;
        if (cmd) {
          const decision = await commandPolicyEngine.evaluate(cmd);
          if (!decision.allowed) {
            return {
              content: `Error: Command "${cmd}" was denied by security policy: ${decision.reason || 'Blocked'}`,
              isError: true,
            };
          }
        }

        const session = manager.createSession({
          id: sessionId,
          cwd: effectiveCwd,
          shell: cmd,
        });

        // Allow process initial output / banner to render
        await new Promise((resolve) => setTimeout(resolve, 300));
        const capture = manager.captureScreen(sessionId, maxLines);

        return {
          content: `[Terminal Session "${sessionId}" Started] (PID: ${session.process.pid || 'unknown'})\n\nScreen Output:\n${capture.screenText || '(no initial output)'}`,
          isError: false,
        };
      }

      case 'send': {
        const session = manager.getSession(sessionId);
        if (!session || !session.isAlive) {
          return {
            content: `Error: Session "${sessionId}" is not active or has already terminated. Use action: "start" to create a new session.`,
            isError: true,
          };
        }

        const controlKey = args.controlKey as 'ctrl-c' | 'ctrl-d' | 'tab' | 'escape' | undefined;
        if (controlKey) {
          await manager.sendControl(sessionId, controlKey);
        }

        if (typeof args.input === 'string') {
          const pressEnter = args.pressEnter !== false;
          await manager.send(sessionId, args.input, pressEnter);
        }

        const waitMs = typeof args.waitMs === 'number' ? args.waitMs : 800;
        await manager.waitIdle(sessionId, { maxWaitMs: waitMs, idleStabilityMs: 200 });

        const capture = manager.captureScreen(sessionId, maxLines);
        return {
          content: `[Input Sent to "${sessionId}"]\n\nLatest Screen Buffer:\n${capture.screenText || '(idle, no output)'}`,
          isError: false,
        };
      }

      case 'capture': {
        const session = manager.getSession(sessionId);
        if (!session) {
          return {
            content: `Error: Session "${sessionId}" not found.`,
            isError: true,
          };
        }

        const capture = manager.captureScreen(sessionId, maxLines);
        return {
          content: `[Screen Buffer: "${sessionId}"] (Alive: ${session.isAlive})\n\n${capture.screenText || '(buffer empty)'}`,
          isError: false,
        };
      }

      case 'wait': {
        const session = manager.getSession(sessionId);
        if (!session || !session.isAlive) {
          return {
            content: `Error: Session "${sessionId}" is not active.`,
            isError: true,
          };
        }

        const waitMs = typeof args.waitMs === 'number' ? args.waitMs : 2000;
        const becameIdle = await manager.waitIdle(sessionId, { maxWaitMs: waitMs, idleStabilityMs: 250 });
        const capture = manager.captureScreen(sessionId, maxLines);

        return {
          content: `[Wait Finished for "${sessionId}"] (Idle stabilized: ${becameIdle})\n\nLatest Screen Buffer:\n${capture.screenText || '(buffer empty)'}`,
          isError: false,
        };
      }

      case 'stop': {
        const session = manager.getSession(sessionId);
        if (!session) {
          return {
            content: `Session "${sessionId}" was not active.`,
            isError: false,
          };
        }

        manager.destroySession(sessionId);
        return {
          content: `[Terminal Session "${sessionId}" Terminated]`,
          isError: false,
        };
      }

      default:
        return {
          content: `Error: Unknown action "${action}". Expected "start", "send", "capture", "wait", or "stop".`,
          isError: true,
        };
    }
  },
};
