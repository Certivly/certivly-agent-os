import { SessionManager, type Run, type Message, type ToolCall } from '@agent-os/sessions';

export interface ReplayedToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: unknown;
}

export interface ReplayedCommand {
  command: string;
  cwd?: string;
  exitCode?: number | null;
  output?: string;
}

export interface ReplaySummary {
  sessionId: string;
  runId: string;
  status: string;
  userInput?: string;
  finalText?: string;
  messages: Array<{
    id: string;
    role: string;
    content: string;
    toolCalls?: any[];
  }>;
  tools: ReplayedToolCall[];
  fileChanges: string[];
  commands: ReplayedCommand[];
  verification?: any;
  approvalDecisions?: any[];
  tracePath?: string;
}

export class SessionReplayer {
  constructor(private sessionManager: SessionManager) {}

  public replay(sessionId: string, runId: string): ReplaySummary {
    const run = this.sessionManager.getRun(runId);
    if (!run) {
      throw new Error(`Run ${runId} not found`);
    }

    if (run.sessionId !== sessionId) {
      throw new Error(`Run ${runId} does not belong to session ${sessionId}`);
    }

    const rawMessages = this.sessionManager.getMessages(sessionId);
    const rawToolCalls = this.sessionManager.getToolCallsForSession(sessionId);

    const toolCallMap = new Map<string, ToolCall>();
    for (const tc of rawToolCalls) {
      toolCallMap.set(tc.id, tc);
    }

    const messages: ReplaySummary['messages'] = [];
    const tools: ReplayedToolCall[] = [];
    const fileChanges = new Set<string>();
    const commands: ReplayedCommand[] = [];

    for (const msg of rawMessages) {
      let content = msg.content;
      let toolCalls: any[] | undefined = undefined;

      if (msg.role === 'assistant') {
        try {
          const parsed = JSON.parse(msg.content);
          if (parsed && typeof parsed === 'object' && ('toolCalls' in parsed || 'text' in parsed)) {
            content = parsed.text ?? '';
            toolCalls = parsed.toolCalls;
          }
        } catch (_err) {
          // best-effort: fallback to plain text if assistant message is not JSON-encoded
        }
      }

      messages.push({
        id: msg.id,
        role: msg.role,
        content,
        toolCalls,
      });
    }

    for (const tc of rawToolCalls) {
      let parsedArgs: Record<string, unknown> = {};
      try {
        parsedArgs = JSON.parse(tc.args);
      } catch (_err: unknown) {
        parsedArgs = { raw: tc.args };
      }

      let parsedResult: unknown = tc.result;
      if (typeof tc.result === 'string') {
        try {
          parsedResult = JSON.parse(tc.result);
        } catch (_err: unknown) {
          parsedResult = tc.result;
        }
      }

      tools.push({
        id: tc.id,
        name: tc.name,
        args: parsedArgs,
        result: parsedResult,
      });

      // Track file modifications
      if (['write_file', 'patch_apply', 'file_edit', 'apply_diff'].includes(tc.name)) {
        const filePath = (parsedArgs.path || parsedArgs.filePath || parsedArgs.targetFile) as string | undefined;
        if (filePath) {
          fileChanges.add(filePath);
        }
      }

      // Track commands executed
      if (['run_command', 'bash', 'execute_command'].includes(tc.name)) {
        const cmd = (parsedArgs.command || parsedArgs.cmd) as string | undefined;
        if (cmd) {
          let outputTail: string | undefined;
          let exitCode: number | null = null;
          if (parsedResult && typeof parsedResult === 'object') {
            const res = parsedResult as Record<string, any>;
            outputTail = res.stdoutTail || res.stdout || res.output || res.error;
            exitCode = typeof res.exitCode === 'number' ? res.exitCode : null;
          } else if (typeof parsedResult === 'string') {
            outputTail = parsedResult;
          }
          commands.push({
            command: cmd,
            cwd: (parsedArgs.cwd as string) || undefined,
            exitCode,
            output: outputTail,
          });
        }
      }
    }

    let verification: any = undefined;
    if (run.verification) {
      try {
        verification = JSON.parse(run.verification);
      } catch (_err: unknown) {
        verification = run.verification;
      }
    }

    let approvalDecisions: any[] | undefined = undefined;
    if (run.approvalDecisions) {
      try {
        approvalDecisions = JSON.parse(run.approvalDecisions);
      } catch (_err: unknown) {
        approvalDecisions = [run.approvalDecisions];
      }
    }

    return {
      sessionId,
      runId,
      status: run.status,
      userInput: run.userInput ?? undefined,
      finalText: run.finalText ?? undefined,
      messages,
      tools,
      fileChanges: Array.from(fileChanges),
      commands,
      verification,
      approvalDecisions,
      tracePath: run.tracePath ?? undefined,
    };
  }

  public static formatSummary(summary: ReplaySummary): string {
    const lines: string[] = [];
    lines.push(`# Session Replay: ${summary.sessionId} (Run: ${summary.runId})`);
    lines.push(`- **Status**: ${summary.status.toUpperCase()}`);
    if (summary.userInput) {
      lines.push(`- **User Input**: "${summary.userInput}"`);
    }
    if (summary.tracePath) {
      lines.push(`- **Trace Path**: \`${summary.tracePath}\``);
    }
    lines.push('');

    lines.push(`## Messages (${summary.messages.length})`);
    for (const msg of summary.messages) {
      lines.push(`### [${msg.role.toUpperCase()}]`);
      if (msg.content) {
        lines.push(msg.content);
      }
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        lines.push(`Requested Tools: ${msg.toolCalls.map(t => t.name).join(', ')}`);
      }
      lines.push('');
    }

    lines.push(`## Tools Executed (${summary.tools.length})`);
    for (const tool of summary.tools) {
      lines.push(`- **${tool.name}** (\`${tool.id}\`)`);
      lines.push(`  - Args: \`${JSON.stringify(tool.args)}\``);
      if (tool.result !== undefined && tool.result !== null) {
        const resStr = typeof tool.result === 'string' ? tool.result : JSON.stringify(tool.result);
        lines.push(`  - Result: ${resStr.slice(0, 100)}${resStr.length > 100 ? '...' : ''}`);
      }
    }
    lines.push('');

    lines.push(`## Files Modified (${summary.fileChanges.length})`);
    if (summary.fileChanges.length === 0) {
      lines.push('- No files modified');
    } else {
      for (const f of summary.fileChanges) {
        lines.push(`- \`${f}\``);
      }
    }
    lines.push('');

    lines.push(`## Commands Executed (${summary.commands.length})`);
    if (summary.commands.length === 0) {
      lines.push('- No commands executed');
    } else {
      for (const cmd of summary.commands) {
        lines.push(`- \`${cmd.command}\`${cmd.exitCode !== null ? ` (exit: ${cmd.exitCode})` : ''}`);
      }
    }
    lines.push('');

    lines.push(`## Verification`);
    if (summary.verification) {
      lines.push(`- Verdict: **${summary.verification.verdict || 'unknown'}**`);
    } else {
      lines.push('- None recorded');
    }

    return lines.join('\n');
  }
}
