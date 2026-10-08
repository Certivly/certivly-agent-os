import { describe, it, expect, beforeEach } from 'bun:test';
import * as path from 'path';
import * as fs from 'fs';
import { SessionManager } from '@agent-os/sessions';
import { LoggingEventBus } from '@agent-os/shared';
import { SessionHistory } from '../src/loop/SessionHistory';
import { AgentLoop } from '../src/loop/AgentLoop';
import type { LoopTool, ToolExecutionResult } from '../src/loop/LoopTool';
import { ScriptedModel } from './helpers/ScriptedModel';

describe('AgentLoop with Tools (Action 06)', () => {
  const testDir = path.join(__dirname, '.tmp-agent-loop-tools');
  let dbPath: string;

  beforeEach(() => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    dbPath = path.join(testDir, `test-${crypto.randomUUID()}.db`);
  });

  const readFileTool: LoopTool = {
    spec: {
      name: 'read_file',
      description: 'Read file',
      parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
      readOnly: true,
    },
    requiresApproval: () => false,
    execute: async (args, signal, toolCallId = 'tc') => ({
      toolCallId,
      name: 'read_file',
      content: 'file content',
      isError: false,
    }),
  };

  const editFileTool: LoopTool = {
    spec: {
      name: 'edit_file',
      description: 'Edit file',
      parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
      readOnly: false,
    },
    requiresApproval: () => false,
    execute: async (args, signal, toolCallId = 'tc') => ({
      toolCallId,
      name: 'edit_file',
      content: 'edited',
      isError: false,
    }),
  };

  const brokenTool: LoopTool = {
    spec: {
      name: 'broken_tool',
      description: 'Broken tool',
      parameters: { type: 'object', properties: {} },
      readOnly: false,
    },
    requiresApproval: () => false,
    execute: async () => {
      throw new Error('Tool crashed violently');
    },
  };

  it('should feed read_file result back and allow second model response to become final', async () => {
    const sm = new SessionManager(dbPath);
    const history = new SessionHistory(sm);
    const eventBus = new LoggingEventBus();

    const model = new ScriptedModel([
      {
        text: 'Let me read the file first',
        toolCalls: [{ id: 'call_1', name: 'read_file', args: JSON.stringify({ path: 'src/main.ts' }) }],
      },
      {
        text: 'The file contains: file content',
      },
    ]);

    const loop = new AgentLoop({
      model,
      tools: [readFileTool, editFileTool],
      history,
      eventBus,
      workspaceRoot: process.cwd(),
    });

    const summary = await loop.run({
      sessionId: 'sess-tools-1',
      userInput: 'What is inside src/main.ts?',
      workspaceRoot: process.cwd(),
    });

    expect(summary.success).toBe(true);
    expect(summary.turns).toBe(2);
    expect(summary.finalText).toBe('The file contains: file content');
    expect(summary.toolCalls).toHaveLength(1);
    expect(summary.toolCalls[0].name).toBe('read_file');
    expect(summary.toolCalls[0].success).toBe(true);

    const historyMessages = await history.load('sess-tools-1');
    expect(historyMessages.some(m => m.role === 'tool' && m.content === 'file content')).toBe(true);
  });

  it('should feed tool error back as isError:true without crashing the loop', async () => {
    const sm = new SessionManager(dbPath);
    const history = new SessionHistory(sm);
    const eventBus = new LoggingEventBus();

    const model = new ScriptedModel([
      {
        text: 'Attempting operation',
        toolCalls: [{ id: 'call_err', name: 'broken_tool', args: '{}' }],
      },
      {
        text: 'I see the tool failed with error.',
      },
    ]);

    const loop = new AgentLoop({
      model,
      tools: [brokenTool],
      history,
      eventBus,
      workspaceRoot: process.cwd(),
    });

    const summary = await loop.run({
      sessionId: 'sess-tools-err',
      userInput: 'Run broken tool',
      workspaceRoot: process.cwd(),
    });

    expect(summary.success).toBe(true);
    expect(summary.turns).toBe(2);
    expect(summary.toolCalls[0].success).toBe(false);
    expect(summary.toolCalls[0].error).toContain('Tool crashed violently');

    const historyMessages = await history.load('sess-tools-err');
    const toolMsg = historyMessages.find(m => m.role === 'tool');
    expect(toolMsg).toBeDefined();
    expect(toolMsg?.isError).toBe(true);
    expect(toolMsg?.content).toContain('Tool crashed violently');
  });

  it('should feed missing tool back as an error result', async () => {
    const sm = new SessionManager(dbPath);
    const history = new SessionHistory(sm);
    const eventBus = new LoggingEventBus();

    const model = new ScriptedModel([
      {
        text: 'Trying a nonexistent tool',
        toolCalls: [{ id: 'call_none', name: 'nonexistent_tool', args: '{}' }],
      },
      {
        text: 'Understood, the tool was not found.',
      },
    ]);

    const loop = new AgentLoop({
      model,
      tools: [readFileTool],
      history,
      eventBus,
      workspaceRoot: process.cwd(),
    });

    const summary = await loop.run({
      sessionId: 'sess-tools-missing',
      userInput: 'Run missing tool',
      workspaceRoot: process.cwd(),
    });

    expect(summary.success).toBe(true);
    expect(summary.toolCalls[0].success).toBe(false);
    expect(summary.toolCalls[0].error).toContain("Tool 'nonexistent_tool' not found");
  });

  it('should stop with success:false when max turns is reached', async () => {
    const sm = new SessionManager(dbPath);
    const history = new SessionHistory(sm);
    const eventBus = new LoggingEventBus();

    // A model that keeps asking to read a file forever
    const infiniteResponses = Array.from({ length: 5 }, (_, i) => ({
      text: `Reading turn ${i}`,
      toolCalls: [{ id: `call_${i}`, name: 'read_file', args: JSON.stringify({ path: 'src/main.ts' }) }],
    }));

    const model = new ScriptedModel(infiniteResponses);

    const loop = new AgentLoop({
      model,
      tools: [readFileTool],
      history,
      eventBus,
      workspaceRoot: process.cwd(),
      options: { maxTurns: 3 },
    });

    const summary = await loop.run({
      sessionId: 'sess-tools-max-turns',
      userInput: 'Loop forever',
      workspaceRoot: process.cwd(),
    });

    expect(summary.success).toBe(false);
    expect(summary.turns).toBe(3);
    expect(summary.errors.some(e => e.includes('Maximum turns'))).toBe(true);
  });

  it('should execute contiguous read-only tools in parallel', async () => {
    const sm = new SessionManager(dbPath);
    const history = new SessionHistory(sm);
    const eventBus = new LoggingEventBus();

    let concurrentCount = 0;
    let maxConcurrent = 0;

    const parallelTool1: LoopTool = {
      spec: { name: 'parallel_1', description: 'p1', parameters: {}, readOnly: true },
      requiresApproval: () => false,
      execute: async (args, signal, id = '1') => {
        concurrentCount++;
        maxConcurrent = Math.max(maxConcurrent, concurrentCount);
        await new Promise(r => setTimeout(r, 50));
        concurrentCount--;
        return { toolCallId: id, name: 'parallel_1', content: 'p1 done', isError: false };
      },
    };

    const parallelTool2: LoopTool = {
      spec: { name: 'parallel_2', description: 'p2', parameters: {}, readOnly: true },
      requiresApproval: () => false,
      execute: async (args, signal, id = '2') => {
        concurrentCount++;
        maxConcurrent = Math.max(maxConcurrent, concurrentCount);
        await new Promise(r => setTimeout(r, 50));
        concurrentCount--;
        return { toolCallId: id, name: 'parallel_2', content: 'p2 done', isError: false };
      },
    };

    const model = new ScriptedModel([
      {
        text: 'Running both tools together',
        toolCalls: [
          { id: 'call_p1', name: 'parallel_1', args: '{}' },
          { id: 'call_p2', name: 'parallel_2', args: '{}' },
        ],
      },
      {
        text: 'Finished both tools.',
      },
    ]);

    const loop = new AgentLoop({
      model,
      tools: [parallelTool1, parallelTool2],
      history,
      eventBus,
      workspaceRoot: process.cwd(),
    });

    const summary = await loop.run({
      sessionId: 'sess-tools-parallel',
      userInput: 'Run parallel tools',
      workspaceRoot: process.cwd(),
    });

    expect(summary.success).toBe(true);
    expect(maxConcurrent).toBe(2);
  });
});
