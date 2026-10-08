import { describe, it, expect, beforeEach } from 'bun:test';
import * as path from 'path';
import * as fs from 'fs';
import { SessionManager } from '@agent-os/sessions';
import { LoggingEventBus } from '@agent-os/shared';
import { SessionHistory } from '../src/loop/SessionHistory';
import { AgentLoop } from '../src/loop/AgentLoop';
import type { LoopTool } from '../src/loop/LoopTool';
import { ScriptedModel } from './helpers/ScriptedModel';

describe('AgentLoop Approval Flow (Action 07)', () => {
  const testDir = path.join(__dirname, '.tmp-agent-loop-approval');
  let dbPath: string;

  beforeEach(() => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    dbPath = path.join(testDir, `test-${crypto.randomUUID()}.db`);
  });

  it('should not execute tool when denied, feed denial back as tool result, and emit approval.requested event', async () => {
    const sm = new SessionManager(dbPath);
    const history = new SessionHistory(sm);
    const eventBus = new LoggingEventBus();
    const emittedEvents: string[] = [];

    eventBus.subscribe('*', (e) => {
      emittedEvents.push(e.type);
    });

    let toolExecuted = false;
    const dangerousTool: LoopTool = {
      spec: {
        name: 'delete_database',
        description: 'Deletes the database',
        parameters: {},
        readOnly: false,
      },
      requiresApproval: () => true,
      execute: async (args, signal, id = 'tc') => {
        toolExecuted = true;
        return { toolCallId: id, name: 'delete_database', content: 'deleted', isError: false };
      },
    };

    const model = new ScriptedModel([
      {
        text: 'I will delete the db',
        toolCalls: [{ id: 'call_danger', name: 'delete_database', args: '{}' }],
      },
      {
        text: 'Understood, you denied the action. I will not proceed.',
      },
    ]);

    const loop = new AgentLoop({
      model,
      tools: [dangerousTool],
      history,
      eventBus,
      workspaceRoot: process.cwd(),
      requestApproval: async () => ({ approved: false, reason: 'risk too high' }),
    });

    const summary = await loop.run({
      sessionId: 'sess-approval-denied',
      userInput: 'Delete db',
      workspaceRoot: process.cwd(),
    });

    expect(summary.success).toBe(true);
    expect(toolExecuted).toBe(false);
    expect(emittedEvents).toContain('approval.requested');

    // Verify denial was fed back as a tool result
    const messages = await history.load('sess-approval-denied');
    const toolMsg = messages.find(m => m.role === 'tool');
    expect(toolMsg).toBeDefined();
    expect(toolMsg?.content).toContain('user denied: risk too high');
    expect(toolMsg?.isError).toBe(true);
  });

  it('should execute tool normally when approved', async () => {
    const sm = new SessionManager(dbPath);
    const history = new SessionHistory(sm);
    const eventBus = new LoggingEventBus();

    let toolExecuted = false;
    const dangerousTool: LoopTool = {
      spec: {
        name: 'write_code',
        description: 'Writes code',
        parameters: {},
        readOnly: false,
      },
      requiresApproval: () => true,
      execute: async (args, signal, id = 'tc') => {
        toolExecuted = true;
        return { toolCallId: id, name: 'write_code', content: 'code written successfully', isError: false };
      },
    };

    const model = new ScriptedModel([
      {
        text: 'Writing code',
        toolCalls: [{ id: 'call_write', name: 'write_code', args: '{}' }],
      },
      {
        text: 'All code has been written.',
      },
    ]);

    const loop = new AgentLoop({
      model,
      tools: [dangerousTool],
      history,
      eventBus,
      workspaceRoot: process.cwd(),
      requestApproval: async () => ({ approved: true }),
    });

    const summary = await loop.run({
      sessionId: 'sess-approval-approved',
      userInput: 'Write code',
      workspaceRoot: process.cwd(),
    });

    expect(summary.success).toBe(true);
    expect(toolExecuted).toBe(true);

    const messages = await history.load('sess-approval-approved');
    const toolMsg = messages.find(m => m.role === 'tool');
    expect(toolMsg?.content).toBe('code written successfully');
    expect(toolMsg?.isError).toBe(false);
  });
});
