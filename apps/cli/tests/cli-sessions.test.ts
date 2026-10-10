import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SessionsCommand } from '../src/cli/commands/sessions';
import { SessionManager } from '@agent-os/sessions';

describe('agentos sessions Command', () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentos-sessions-test-'));
    process.chdir(tempDir);

    // Setup local sessions database
    const sessionDir = path.join(tempDir, '.agentos', 'sessions');
    fs.mkdirSync(sessionDir, { recursive: true });
    const dbPath = path.join(sessionDir, 'sessions.db');

    const mgr = new SessionManager(dbPath);
    mgr.createSession('test-sess-1');
    mgr.createRun({
      id: 'run-1',
      sessionId: 'test-sess-1',
      status: 'completed',
      userInput: 'Implement binary search',
    });
    mgr.addMessage('test-sess-1', {
      id: 'msg-1',
      role: 'user',
      content: 'Implement binary search in typescript',
    });
    mgr.addMessage('test-sess-1', {
      id: 'msg-2',
      role: 'assistant',
      content: 'Here is the binary search implementation.',
    });
    mgr.addToolCall({
      id: 'tc-1',
      messageId: 'msg-2',
      name: 'edit_file',
      args: JSON.stringify({ path: 'src/search.ts' }),
      result: 'File created successfully',
    });
    mgr.close();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (_e) {}
  });

  it('lists past sessions from database', () => {
    const cmd = new SessionsCommand();
    const list = cmd.listSessions(10);
    expect(list.length).toBe(1);
    expect(list[0].sessionId).toBe('test-sess-1');
    expect(list[0].status).toBe('completed');
    expect(list[0].userInput).toContain('binary search');
  });

  it('retrieves detailed session history and tool executions', () => {
    const cmd = new SessionsCommand();
    const details = cmd.getSessionDetails('test-sess-1');
    expect(details).not.toBeNull();
    expect(details?.messages.length).toBe(2);
    expect(details?.toolCalls.length).toBe(1);
    expect(details?.toolCalls[0].name).toBe('edit_file');
  });

  it('exports session to Markdown format', () => {
    const cmd = new SessionsCommand();
    const res = cmd.exportSession('test-sess-1', 'md');
    expect(res.content).toContain('# AgentOS Session Export');
    expect(res.content).toContain('Implement binary search in typescript');
    expect(res.content).toContain('edit_file');
  });

  it('exports session to JSON file', () => {
    const cmd = new SessionsCommand();
    const outPath = path.join(tempDir, 'export.json');
    const res = cmd.exportSession('test-sess-1', 'json', outPath);
    expect(res.outputPath).toBe(outPath);
    expect(fs.existsSync(outPath)).toBe(true);

    const parsed = JSON.parse(fs.readFileSync(outPath, 'utf-8'));
    expect(parsed.messages.length).toBe(2);
  });
});
