import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SessionManager } from '@agent-os/sessions';
import { SessionReplayer } from '@agent-os/agent-runtime';

describe('Session Replay and Replayer', () => {
  let tempDir: string;
  let dbPath: string;
  let sessionManager: SessionManager;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentos-replay-test-'));
    dbPath = path.join(tempDir, 'sessions.db');
    sessionManager = new SessionManager(dbPath);
  });

  afterEach(() => {
    try {
      sessionManager.close();
    } catch {}
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });



  it('reconstructs messages, tools, file changes, commands, verification, and final status', () => {
    const sessionId = 'session-replay-1';
    const runId = 'run-replay-1';

    sessionManager.createSession(sessionId);

    // 1. User message
    const userMsgId = 'msg-user-1';
    sessionManager.addMessage(sessionId, {
      id: userMsgId,
      role: 'user',
      content: 'Fix the bug in src/math.ts and test it',
    });

    // 2. Assistant message requesting tools
    const assistantMsgId = 'msg-assistant-1';
    sessionManager.addMessage(sessionId, {
      id: assistantMsgId,
      role: 'assistant',
      content: JSON.stringify({
        text: 'Applying fix and running test...',
        toolCalls: [
          { id: 'call-write-1', name: 'write_file', args: JSON.stringify({ path: 'src/math.ts', content: 'export function add() {}' }) },
          { id: 'call-cmd-1', name: 'run_command', args: JSON.stringify({ command: 'bun test' }) },
        ],
      }),
    });

    // 3. Tool call records in tool_calls table
    sessionManager.addToolCall({
      id: 'call-write-1',
      messageId: assistantMsgId,
      name: 'write_file',
      args: JSON.stringify({ path: 'src/math.ts', content: 'export function add() {}' }),
      result: JSON.stringify({ success: true }),
    });

    sessionManager.addToolCall({
      id: 'call-cmd-1',
      messageId: assistantMsgId,
      name: 'run_command',
      args: JSON.stringify({ command: 'bun test' }),
      result: JSON.stringify({ exitCode: 0, stdoutTail: '1 pass\n0 fail' }),
    });

    // 4. Tool messages
    sessionManager.addMessage(sessionId, {
      id: 'msg-tool-1',
      role: 'tool',
      content: JSON.stringify({
        toolCallId: 'call-write-1',
        name: 'write_file',
        content: JSON.stringify({ success: true }),
      }),
    });

    sessionManager.addMessage(sessionId, {
      id: 'msg-tool-2',
      role: 'tool',
      content: JSON.stringify({
        toolCallId: 'call-cmd-1',
        name: 'run_command',
        content: JSON.stringify({ exitCode: 0, stdoutTail: '1 pass\n0 fail' }),
      }),
    });

    // 5. Run record
    sessionManager.createRun({
      id: runId,
      sessionId,
      status: 'completed',
      userInput: 'Fix the bug in src/math.ts and test it',
      tracePath: '.agentos/traces/session-replay-1/run-replay-1.jsonl',
    });

    sessionManager.updateRun(runId, {
      status: 'completed',
      finalText: 'Bug fixed and verified!',
      verification: JSON.stringify({ verdict: 'verified', checks: [{ name: 'typecheck', passed: true }] }),
      approvalDecisions: JSON.stringify([{ toolName: 'run_command', approved: true }]),
    });

    // Replay
    const replayer = new SessionReplayer(sessionManager);
    const summary = replayer.replay(sessionId, runId);

    expect(summary.sessionId).toBe(sessionId);
    expect(summary.runId).toBe(runId);
    expect(summary.status).toBe('completed');
    expect(summary.userInput).toBe('Fix the bug in src/math.ts and test it');
    expect(summary.finalText).toBe('Bug fixed and verified!');

    // Messages
    expect(summary.messages.length).toBe(4);
    expect(summary.messages[0].role).toBe('user');
    expect(summary.messages[1].role).toBe('assistant');

    // Tools
    expect(summary.tools.length).toBe(2);
    expect(summary.tools[0].name).toBe('write_file');
    expect(summary.tools[1].name).toBe('run_command');

    // File changes reconstructed
    expect(summary.fileChanges).toEqual(['src/math.ts']);

    // Commands reconstructed
    expect(summary.commands.length).toBe(1);
    expect(summary.commands[0].command).toBe('bun test');
    expect(summary.commands[0].exitCode).toBe(0);

    // Verification reconstructed
    expect(summary.verification?.verdict).toBe('verified');

    // Approvals reconstructed
    expect(summary.approvalDecisions?.[0].toolName).toBe('run_command');

    // Formatted report includes markdown sections
    const formatted = SessionReplayer.formatSummary(summary);
    expect(formatted).toContain('# Session Replay: session-replay-1');
    expect(formatted).toContain('COMPLETED');
    expect(formatted).toContain('`src/math.ts`');
    expect(formatted).toContain('`bun test`');
    expect(formatted).toContain('verified');
  });

  it('fails if run not found or does not belong to session', () => {
    const replayer = new SessionReplayer(sessionManager);
    expect(() => replayer.replay('nonexistent-session', 'nonexistent-run')).toThrow('Run nonexistent-run not found');
  });
});
