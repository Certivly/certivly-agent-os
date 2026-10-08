import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { SessionManager } from '@agent-os/sessions';
import { SessionHistory } from '../src/loop/SessionHistory';

describe('SessionHistory', () => {
  const testDir = path.join(__dirname, '.tmp-session-history');
  let dbPath: string;

  beforeEach(() => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    dbPath = path.join(testDir, `test-${crypto.randomUUID()}.db`);
  });

  afterEach(() => {
    // Keep directory or cleanup if not locked
    try {
      if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    } catch {}
  });

  it('should append user, assistant with tool calls, and tool results, and load them in order', async () => {
    const sm = new SessionManager(dbPath);
    const history = new SessionHistory(sm);
    const sessionId = 'test-session-1';

    await history.appendUser(sessionId, 'Please read the file');
    await history.appendAssistant(
      sessionId,
      'Reading file now...',
      [{ id: 'call_1', name: 'read_file', args: JSON.stringify({ path: 'src/index.ts' }) }]
    );
    await history.appendTool(sessionId, 'call_1', 'read_file', 'export const x = 1;');

    const messages = await history.load(sessionId);

    expect(messages).toHaveLength(3);

    expect(messages[0].role).toBe('user');
    expect(messages[0].content).toBe('Please read the file');

    expect(messages[1].role).toBe('assistant');
    expect(messages[1].content).toBe('Reading file now...');
    expect(messages[1].toolCalls).toBeDefined();
    expect(messages[1].toolCalls![0].id).toBe('call_1');
    expect(messages[1].toolCalls![0].name).toBe('read_file');

    expect(messages[2].role).toBe('tool');
    expect(messages[2].content).toBe('export const x = 1;');
    expect(messages[2].name).toBe('read_file');
    expect(messages[2].toolCallId).toBe('call_1');
    expect(messages[2].isError).toBe(false);
  });

  it('should allow a new SessionHistory instance with the same db to load the same history', async () => {
    const sm1 = new SessionManager(dbPath);
    const history1 = new SessionHistory(sm1);
    const sessionId = 'test-session-persist';

    await history1.appendUser(sessionId, 'Initial prompt');
    await history1.appendAssistant(sessionId, 'Initial response');

    // New instance using the same database file
    const sm2 = new SessionManager(dbPath);
    const history2 = new SessionHistory(sm2);

    const reloaded = await history2.load(sessionId);
    expect(reloaded).toHaveLength(2);
    expect(reloaded[0].content).toBe('Initial prompt');
    expect(reloaded[1].content).toBe('Initial response');
  });

  it('should handle tool errors properly', async () => {
    const sm = new SessionManager(dbPath);
    const history = new SessionHistory(sm);
    const sessionId = 'test-session-err';

    await history.appendTool(sessionId, 'call_err', 'broken_tool', 'Something went wrong', true);

    const messages = await history.load(sessionId);
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('tool');
    expect(messages[0].isError).toBe(true);
    expect(messages[0].content).toBe('Something went wrong');
  });
});
