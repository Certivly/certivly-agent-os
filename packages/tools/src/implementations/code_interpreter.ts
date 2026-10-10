import { spawn } from 'child_process';
import type { WorkspaceTool, ToolContext, ToolResult } from '../types';
import { WorkspaceManager, workspaceManager } from '../workspace';

export const codeInterpreterTool: WorkspaceTool = {
  spec: {
    name: 'code_interpreter',
    description: 'Execute a sandboxed JavaScript or TypeScript snippet in a secure runner to evaluate logic, compute values, parse structures, test regular expressions, or transform strings without altering repository files.',
    parameters: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'The JavaScript or TypeScript code snippet to execute. Can use console.log or return a value.',
        },
        timeoutMs: {
          type: 'number',
          description: 'Execution timeout in milliseconds (default: 5000, max: 15000)',
        },
      },
      required: ['code'],
    },
    readOnly: true,
  },
  requiresApproval: () => false,
  execute: async (args: Record<string, unknown>, context?: ToolContext): Promise<ToolResult & { output: string }> => {
    const rawCode = typeof args.code === 'string' ? args.code : '';
    if (!rawCode.trim()) {
      const msg = 'Code must be a non-empty string.';
      return { content: msg, output: msg, isError: true };
    }

    const ws = context?.workspaceRoot ? new WorkspaceManager(context.workspaceRoot) : workspaceManager;
    const workspaceRoot = ws.root;
    const timeoutMs = Math.min(Math.max(typeof args.timeoutMs === 'number' ? args.timeoutMs : 5000, 500), 15000);

    const wrappedScript = `
(async () => {
  const __stdout = [];
  const __stderr = [];
  const _origLog = console.log;
  const _origError = console.error;
  console.log = (...args) => {
    __stdout.push(args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' '));
  };
  console.error = (...args) => {
    __stderr.push(args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' '));
  };

  try {
    const __result = await (async () => {
${rawCode}
    })();
    process.stdout.write(JSON.stringify({
      success: true,
      stdout: __stdout.join('\\n'),
      stderr: __stderr.join('\\n'),
      result: __result !== undefined ? (typeof __result === 'object' ? JSON.stringify(__result, null, 2) : String(__result)) : undefined,
    }));
  } catch (err) {
    process.stdout.write(JSON.stringify({
      success: false,
      stdout: __stdout.join('\\n'),
      stderr: __stderr.join('\\n'),
      error: err instanceof Error ? err.stack || err.message : String(err),
    }));
  }
})();
`;

    const startTime = Date.now();

    return new Promise((resolve) => {
      let isSettled = false;

      if (context?.signal?.aborted) {
        const msg = 'Code execution was aborted.';
        return resolve({ content: msg, output: msg, isError: true });
      }

      const proc = spawn('bun', ['-'], {
        cwd: workspaceRoot,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          NODE_ENV: 'test',
        },
      });

      const timer = setTimeout(() => {
        if (!isSettled) {
          isSettled = true;
          try {
            proc.kill('SIGKILL');
          } catch (_killErr: any) {
            // Process may have already terminated
          }
          const msg = `Code execution timed out after ${timeoutMs}ms.`;
          resolve({ content: msg, output: msg, isError: true });
        }
      }, timeoutMs);

      const abortHandler = () => {
        if (!isSettled) {
          isSettled = true;
          clearTimeout(timer);
          try {
            proc.kill('SIGKILL');
          } catch (_killErr: any) {
            // Process may have already terminated or aborted
          }
          const msg = 'Code execution was aborted.';
          resolve({ content: msg, output: msg, isError: true });
        }
      };

      if (context?.signal) {
        context.signal.addEventListener('abort', abortHandler, { once: true });
      }

      let stdoutBuffer = '';
      let stderrBuffer = '';

      proc.stdout?.on('data', (chunk) => {
        stdoutBuffer += chunk.toString();
      });

      proc.stderr?.on('data', (chunk) => {
        stderrBuffer += chunk.toString();
      });

      proc.on('error', (err) => {
        if (!isSettled) {
          isSettled = true;
          clearTimeout(timer);
          if (context?.signal) context.signal.removeEventListener('abort', abortHandler);
          const msg = `Failed to spawn runtime interpreter: ${err.message}`;
          resolve({ content: msg, output: msg, isError: true });
        }
      });

      proc.on('close', (exitCode) => {
        if (isSettled) return;
        isSettled = true;
        clearTimeout(timer);
        if (context?.signal) context.signal.removeEventListener('abort', abortHandler);
        const durationMs = Date.now() - startTime;

        try {
          const parsed = JSON.parse(stdoutBuffer.trim());
          if (parsed.success) {
            const sections: string[] = [];
            sections.push(`## Code Interpreter Result`);
            sections.push(`- **Status:** Success (${durationMs}ms)`);
            if (parsed.stdout) {
              sections.push(`\n### Standard Output:\n\`\`\`\n${parsed.stdout}\n\`\`\``);
            }
            if (parsed.result !== undefined) {
              sections.push(`\n### Evaluated Result:\n\`\`\`json\n${parsed.result}\n\`\`\``);
            }
            if (!parsed.stdout && parsed.result === undefined) {
              sections.push('\nCode executed successfully with no output.');
            }
            const output = sections.join('\n');
            resolve({ content: output, output, isError: false });
          } else {
            const sections: string[] = [];
            sections.push(`## Code Interpreter Result`);
            sections.push(`- **Status:** Runtime Error (${durationMs}ms)`);
            if (parsed.stdout) {
              sections.push(`\n### Standard Output:\n\`\`\`\n${parsed.stdout}\n\`\`\``);
            }
            if (parsed.error) {
              sections.push(`\n### Error:\n\`\`\`\n${parsed.error}\n\`\`\``);
            }
            const output = sections.join('\n');
            resolve({ content: output, output, isError: true });
          }
        } catch (parseErr: unknown) {
          // If JSON parse failed, output raw buffers
          const _parseMsg = parseErr instanceof Error ? parseErr.message : String(parseErr);
          const errorMsg = stderrBuffer.trim() || stdoutBuffer.trim() || `Process exited with code ${exitCode}`;
          const output = `## Code Interpreter Result\n- **Status:** Execution Error (${durationMs}ms)\n\`\`\`\n${errorMsg}\n\`\`\``;
          resolve({ content: output, output, isError: exitCode !== 0 });
        }
      });

      try {
        proc.stdin?.write(wrappedScript);
        proc.stdin?.end();
      } catch (err: unknown) {
        if (!isSettled) {
          isSettled = true;
          clearTimeout(timer);
          const errMsg = err instanceof Error ? err.message : String(err);
          const msg = `Failed to send code to interpreter: ${errMsg}`;
          resolve({ content: msg, output: msg, isError: true });
        }
      }
    });
  },
};
