import { describe, it, expect, beforeEach } from 'bun:test';
import * as path from 'path';
import * as fs from 'fs';
import { SessionManager } from '@agent-os/sessions';
import { LoggingEventBus } from '@agent-os/shared';
import { SessionHistory } from '../src/loop/SessionHistory';
import { AgentLoop } from '../src/loop/AgentLoop';
import { ScriptedModel } from './helpers/ScriptedModel';

describe('Basic AgentLoop', () => {
  const testDir = path.join(__dirname, '.tmp-agent-loop-basic');
  let dbPath: string;

  beforeEach(() => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    dbPath = path.join(testDir, `test-${crypto.randomUUID()}.db`);
  });

  it('should return success:true for a plain answer, persist messages, and emit events', async () => {
    const sm = new SessionManager(dbPath);
    const history = new SessionHistory(sm);
    const eventBus = new LoggingEventBus();
    const emittedEvents: string[] = [];

    eventBus.subscribe('*', (ev) => {
      emittedEvents.push(ev.type);
    });

    const model = new ScriptedModel([
      { text: 'Hello! How can I assist you with code today?' },
    ]);

    const loop = new AgentLoop({
      model,
      tools: [],
      history,
      eventBus,
      workspaceRoot: process.cwd(),
    });

    const summary = await loop.run({
      sessionId: 'sess-basic-1',
      userInput: 'Hello AgentOS',
      workspaceRoot: process.cwd(),
    });

    expect(summary.success).toBe(true);
    expect(summary.finalText).toBe('Hello! How can I assist you with code today?');
    expect(summary.turns).toBe(1);
    expect(summary.errors).toHaveLength(0);

    // Verify persistence
    const messages = await history.load('sess-basic-1');
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('user');
    expect(messages[0].content).toBe('Hello AgentOS');
    expect(messages[1].role).toBe('assistant');
    expect(messages[1].content).toBe('Hello! How can I assist you with code today?');

    // Verify events
    expect(emittedEvents).toContain('agent.loop.started');
    expect(emittedEvents).toContain('message.delta');
    expect(emittedEvents).toContain('agent.loop.completed');
  });

  it('should return success:false when model returns tool calls in basic loop', async () => {
    const sm = new SessionManager(dbPath);
    const history = new SessionHistory(sm);
    const eventBus = new LoggingEventBus();

    const model = new ScriptedModel([
      {
        text: 'I want to read a file',
        toolCalls: [{ id: 'call_1', name: 'read_file', args: JSON.stringify({ path: 'src/main.ts' }) }],
      },
    ]);

    const loop = new AgentLoop({
      model,
      tools: [],
      history,
      eventBus,
      workspaceRoot: process.cwd(),
    });

    const summary = await loop.run({
      sessionId: 'sess-basic-tools-disabled',
      userInput: 'Read file',
      workspaceRoot: process.cwd(),
    });

    expect(summary.success).toBe(false);
    expect(summary.errors).toContain('Tools are not enabled in this action');
  });
});
