import { describe, it, expect, beforeEach } from 'bun:test';
import * as path from 'path';
import * as fs from 'fs';
import { SessionManager } from '@agent-os/sessions';
import { LoggingEventBus } from '@agent-os/shared';
import { SessionHistory } from '../src/loop/SessionHistory';
import { AgentLoop } from '../src/loop/AgentLoop';
import type { LoopTool } from '../src/loop/LoopTool';
import { ScriptedModel } from './helpers/ScriptedModel';

describe('RunSummary and Event Log (Action 12)', () => {
  const testDir = path.join(__dirname, '.tmp-run-summary-events');
  let dbPath: string;

  beforeEach(() => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    dbPath = path.join(testDir, `test-${crypto.randomUUID()}.db`);
  });

  const echoTool: LoopTool = {
    spec: { name: 'echo', description: 'echo', parameters: {}, readOnly: true },
    requiresApproval: () => false,
    execute: async (args, signal, id = 'tc') => ({
      toolCallId: id,
      name: 'echo',
      content: 'pong',
      isError: false,
    }),
  };

  it('should include duration, timestamps, tokens, and final text in a successful run', async () => {
    const sm = new SessionManager(dbPath);
    const history = new SessionHistory(sm);
    const eventBus = new LoggingEventBus();

    const model = new ScriptedModel([
      { text: 'Final complete answer.' },
    ]);

    const loop = new AgentLoop({
      model,
      tools: [],
      history,
      eventBus,
      workspaceRoot: process.cwd(),
    });

    const summary = await loop.run({
      sessionId: 'sess-summary-1',
      userInput: 'Do work',
      workspaceRoot: process.cwd(),
    });

    expect(summary.success).toBe(true);
    expect(summary.finalText).toBe('Final complete answer.');
    expect(summary.startedAt).toBeDefined();
    expect(summary.completedAt).toBeDefined();
    expect(summary.durationMs).toBeGreaterThanOrEqual(0);
    expect(summary.approxInputTokens).toBeGreaterThan(0);
    expect(summary.approxOutputTokens).toBeGreaterThan(0);
    expect(summary.errors).toHaveLength(0);
  });

  it('should include errors in a failed run', async () => {
    const sm = new SessionManager(dbPath);
    const history = new SessionHistory(sm);
    const eventBus = new LoggingEventBus();

    const model = new ScriptedModel([
      { text: 'Tool call', toolCalls: [{ id: 'tc1', name: 'echo', args: '{}' }] },
    ]);

    // Model exhausted on next turn
    const loop = new AgentLoop({
      model,
      tools: [echoTool],
      history,
      eventBus,
      workspaceRoot: process.cwd(),
    });

    const summary = await loop.run({
      sessionId: 'sess-summary-fail',
      userInput: 'Fail soon',
      workspaceRoot: process.cwd(),
    });

    expect(summary.success).toBe(false);
    expect(summary.errors.length).toBeGreaterThan(0);
  });

  it('should record tool calls in ToolCallRecord', async () => {
    const sm = new SessionManager(dbPath);
    const history = new SessionHistory(sm);
    const eventBus = new LoggingEventBus();

    const model = new ScriptedModel([
      { text: 'Calling echo', toolCalls: [{ id: 'tc-echo', name: 'echo', args: '{"msg":"hello"}' }] },
      { text: 'Echo finished.' },
    ]);

    const loop = new AgentLoop({
      model,
      tools: [echoTool],
      history,
      eventBus,
      workspaceRoot: process.cwd(),
    });

    const summary = await loop.run({
      sessionId: 'sess-summary-tools',
      userInput: 'Run echo',
      workspaceRoot: process.cwd(),
    });

    expect(summary.success).toBe(true);
    expect(summary.toolCalls).toHaveLength(1);
    expect(summary.toolCalls[0].id).toBe('tc-echo');
    expect(summary.toolCalls[0].name).toBe('echo');
    expect(summary.toolCalls[0].success).toBe(true);
  });

  it('should emit events in a sensible chronological order', async () => {
    const sm = new SessionManager(dbPath);
    const history = new SessionHistory(sm);
    const eventBus = new LoggingEventBus();
    const eventSequence: string[] = [];

    eventBus.subscribe('*', (e) => {
      eventSequence.push(e.type);
    });

    const model = new ScriptedModel([
      { text: 'Step 1', toolCalls: [{ id: 'tc-1', name: 'echo', args: '{}' }] },
      { text: 'Final Answer.' },
    ]);

    const loop = new AgentLoop({
      model,
      tools: [echoTool],
      history,
      eventBus,
      workspaceRoot: process.cwd(),
    });

    await loop.run({
      sessionId: 'sess-events-order',
      userInput: 'Run test',
      workspaceRoot: process.cwd(),
    });

    expect(eventSequence[0]).toBe('agent.loop.started');
    expect(eventSequence).toContain('agent.loop.turn.started');
    expect(eventSequence).toContain('tool.call.started');
    expect(eventSequence).toContain('tool.call.completed');
    expect(eventSequence[eventSequence.length - 1]).toBe('agent.loop.completed');
  });
});
