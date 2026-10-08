import { spawn, execSync } from 'child_process';
import * as fs from 'fs';
import { Tool } from '../interface';
import { ToolError } from '@agent-os/shared';
import { commandPolicyEngine, truncateOutput, MAX_COMMAND_OUTPUT } from '../policy';
import { WorkspaceManager, workspaceManager } from '../workspace';
import type { WorkspaceTool, ToolContext, ToolResult } from '../types';

function killProcessTree(pid: number): void {
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore' });
    } else {
      try {
        process.kill(-pid, 'SIGKILL');
      } catch {
        process.kill(pid, 'SIGKILL');
      }
    }
  } catch {
    // Process might have already exited
  }
}

export const runCommandTool: WorkspaceTool & Tool = {
  name: 'run_command',
  description: 'Run a shell command safely in the workspace',
  spec: {
    name: 'run_command',
    description: 'Execute a shell command with workspace policy checks, process isolation, and output capping',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The shell command line to execute' },
        cwd: { type: 'string', description: 'Working directory relative to workspace root (optional)' },
        timeoutMs: { type: 'number', description: 'Execution timeout in milliseconds (default 120000)' },
      },
      required: ['command'],
    },
    readOnly: false,
  },
  requiresApproval: async (args: Record<string, unknown>) => {
    const command = args.command as string;
    if (typeof command !== 'string') return true;
    const decision = await commandPolicyEngine.evaluate(command);
    return !decision.allowed;
  },
  execute: async (args: Record<string, unknown>, context?: ToolContext): Promise<ToolResult & any> => {
    const command = args.command as string;
    if (typeof command !== 'string' || !command.trim()) {
      throw new ToolError('Command must be a non-empty string');
    }

    const decision = await commandPolicyEngine.evaluate(command);
    if (!decision.allowed) {
      throw new ToolError(`Command execution blocked by policy: ${decision.reason || 'Approval required'}`);
    }

    // Resolve and validate cwd
    let effectiveCwd: string;
    if (context?.workspaceRoot) {
      const wm = new WorkspaceManager(context.workspaceRoot);
      effectiveCwd = args.cwd ? wm.resolvePath(args.cwd as string) : context.workspaceRoot;
      if (!wm.isWithinWorkspace(effectiveCwd)) {
        throw new ToolError(`Security Violation: Path '${args.cwd}' escapes workspace root`);
      }
    } else {
      if (args.cwd) {
        effectiveCwd = workspaceManager.resolvePath(args.cwd as string);
        if (!workspaceManager.isWithinWorkspace(effectiveCwd)) {
          throw new ToolError(`Security Violation: Path '${args.cwd}' escapes workspace root`);
        }
      } else {
        effectiveCwd = workspaceManager.getRoot();
      }
    }

    if (!fs.existsSync(effectiveCwd)) {
      throw new ToolError(`Working directory does not exist: ${effectiveCwd}`);
    }

    const timeoutMs = typeof args.timeoutMs === 'number' && args.timeoutMs > 0 ? args.timeoutMs : 120_000;

    return new Promise((resolve, reject) => {
      let child: ReturnType<typeof spawn>;
      try {
        child = spawn(command, {
          shell: true,
          cwd: effectiveCwd,
          windowsHide: true,
          detached: process.platform !== 'win32',
        });
      } catch (err: any) {
        return reject(new ToolError(`Failed to spawn command: ${err?.message ?? String(err)}`));
      }

      let stdout = '';
      let stderr = '';
      let timedOut = false;
      let aborted = false;
      let settled = false;

      child.stdout?.on('data', (chunk) => {
        stdout += chunk.toString();
      });

      child.stderr?.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      const timer = setTimeout(() => {
        timedOut = true;
        if (child.pid) {
          killProcessTree(child.pid);
        }
      }, timeoutMs);

      const abortHandler = () => {
        aborted = true;
        if (child.pid) {
          killProcessTree(child.pid);
        }
      };

      if (context?.signal) {
        context.signal.addEventListener('abort', abortHandler, { once: true });
      }

      const cleanup = () => {
        clearTimeout(timer);
        if (context?.signal) {
          context.signal.removeEventListener('abort', abortHandler);
        }
      };

      child.on('error', (err) => {
        if (settled) return;
        settled = true;
        cleanup();
        const content = `Command failed with error: ${err.message}`;
        resolve(Object.assign(
          {
            success: false,
            content,
            isError: true,
            data: { exitCode: 1, stdout, stderr, timedOut, aborted },
          },
          { toString: () => content }
        ));
      });

      child.on('close', (code) => {
        if (settled) return;
        settled = true;
        cleanup();

        const cleanStdout = truncateOutput(stdout, MAX_COMMAND_OUTPUT);
        const cleanStderr = truncateOutput(stderr, MAX_COMMAND_OUTPUT);
        const exitCode = timedOut ? 124 : (code ?? (aborted ? 130 : 0));

        let content = '';
        if (timedOut) {
          content = `Command timed out after ${timeoutMs}ms.\n${cleanStderr ? 'Stderr:\n' + cleanStderr : ''}\n${cleanStdout ? 'Stdout:\n' + cleanStdout : ''}`.trim();
        } else if (aborted) {
          content = `Command execution was aborted.\n${cleanStderr ? 'Stderr:\n' + cleanStderr : ''}\n${cleanStdout ? 'Stdout:\n' + cleanStdout : ''}`.trim();
        } else if (exitCode === 0) {
          content = (cleanStdout || cleanStderr || 'Command executed successfully with no output.').trim();
        } else {
          const details = [
            cleanStderr ? `STDERR:\n${cleanStderr}` : '',
            cleanStdout ? `STDOUT:\n${cleanStdout}` : '',
          ].filter(Boolean).join('\n\n');
          content = `Command exited with code ${exitCode}${details ? `:\n${details}` : '.'}`;
        }

        resolve(Object.assign(
          {
            success: exitCode === 0,
            content,
            isError: exitCode !== 0,
            data: {
              exitCode,
              stdout: cleanStdout,
              stderr: cleanStderr,
              timedOut,
              aborted,
            },
          },
          { toString: () => content }
        ));
      });
    });
  },
};
