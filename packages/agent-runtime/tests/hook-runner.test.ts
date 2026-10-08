import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as path from 'path';
import * as fs from 'fs';
import { HookRunner } from '../src/loop/HookRunner';
import { AgentLoop } from '../src/loop/AgentLoop';
import { SessionManager } from '@agent-os/sessions';
import { SessionHistory } from '../src/loop/SessionHistory';
import { LoggingEventBus } from '@agent-os/shared';
import { ScriptedModel } from './helpers/ScriptedModel';
import type { LoopTool } from '../src/loop/LoopTool';

describe('HookRunner Tests (Action 5-03)', () => {
  const testRoot = path.join(__dirname, '.tmp-hook-runner-test');
  let dbPath: string;

  beforeEach(() => {
    if (!fs.existsSync(testRoot)) {
      fs.mkdirSync(testRoot, { recursive: true });
    }
    dbPath = path.join(testRoot, `test-${crypto.randomUUID()}.db`);
  });

  afterEach(() => {
    try {
      if (fs.existsSync(testRoot)) {
        fs.rmSync(testRoot, { recursive: true, force: true });
      }
    } catch {}
  });

  it('1. Hook runs successfully', async () => {
    const result = await HookRunner.run({ command: 'echo hello' }, {}, testRoot);
    expect(result.ok).toBe(true);
    expect(result.output.trim()).toBe('hello');
  });

  it('2. Blocking hook failure aborts the stage in AgentLoop', async () => {
    const sm = new SessionManager(dbPath);
    const history = new SessionHistory(sm);
    const eventBus = new LoggingEventBus();

    let toolExecuted = false;
    const testTool: LoopTool = {
      spec: {
        name: 'test_tool',
        description: 'Test tool',
        parameters: {},
        readOnly: false,
      },
      requiresApproval: () => false,
      execute: async () => {
        toolExecuted = true;
        return { toolCallId: 'tc', name: 'test_tool', content: 'executed', isError: false };
      },
    };

    const model = new ScriptedModel([
      {
        text: 'Calling tool',
        toolCalls: [{ id: 'tc1', name: 'test_tool', args: '{}' }],
      },
      {
        text: 'Tool execution failed as expected.',
      },
    ]);

    const loop = new AgentLoop({
      model,
      tools: [testTool],
      history,
      eventBus,
      workspaceRoot: testRoot,
      options: {
        hooks: {
          before_tool: {
            command: 'exit 1',
            blocking: true,
          },
        },
      },
    });

    const summary = await loop.run({
      sessionId: 'sess-blocking-hook',
      userInput: 'Run test tool',
      workspaceRoot: testRoot,
    });

    expect(toolExecuted).toBe(false);
    expect(summary.toolCalls[0].success).toBe(false);
    expect(summary.toolCalls[0].error).toContain('[HookFailed before_tool]');
  });

  it('3. Non-blocking hook failure is ignored in AgentLoop', async () => {
    const sm = new SessionManager(dbPath);
    const history = new SessionHistory(sm);
    const eventBus = new LoggingEventBus();

    let toolExecuted = false;
    const testTool: LoopTool = {
      spec: {
        name: 'test_tool',
        description: 'Test tool',
        parameters: {},
        readOnly: false,
      },
      requiresApproval: () => false,
      execute: async () => {
        toolExecuted = true;
        return { toolCallId: 'tc', name: 'test_tool', content: 'executed successfully', isError: false };
      },
    };

    const model = new ScriptedModel([
      {
        text: 'Calling tool',
        toolCalls: [{ id: 'tc1', name: 'test_tool', args: '{}' }],
      },
      {
        text: 'Finished.',
      },
    ]);

    const loop = new AgentLoop({
      model,
      tools: [testTool],
      history,
      eventBus,
      workspaceRoot: testRoot,
      options: {
        hooks: {
          before_tool: {
            command: 'exit 1',
            blocking: false,
          },
        },
      },
    });

    const summary = await loop.run({
      sessionId: 'sess-nonblocking-hook',
      userInput: 'Run test tool',
      workspaceRoot: testRoot,
    });

    expect(toolExecuted).toBe(true);
    expect(summary.toolCalls[0].success).toBe(true);
    const msgs = await history.load('sess-nonblocking-hook');
    const toolMsg = msgs.find(m => m.role === 'tool');
    expect(toolMsg?.content).toBe('executed successfully');
  });

  it('4. Hook timeout is enforced', async () => {
    const start = Date.now();
    const result = await HookRunner.run(
      {
        command: 'sleep 60',
        timeoutMs: 100,
      },
      {},
      testRoot
    );
    const elapsed = Date.now() - start;

    expect(result.ok).toBe(false);
    expect(elapsed).toBeLessThan(1500); // well within reasonable bounds
  });

  it('5. Environment variables are expanded', async () => {
    const result = await HookRunner.run(
      { command: 'echo $TOOL_NAME' },
      { TOOL_NAME: 'edit_file' },
      testRoot
    );
    expect(result.ok).toBe(true);
    expect(result.output.trim()).toBe('edit_file');
  });
});
