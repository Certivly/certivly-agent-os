import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { AgentLoop } from '../src/loop/AgentLoop';
import type { LoopTool } from '../src/loop/LoopTool';
import { LoggingEventBus } from '@agent-os/shared';
import { SessionHistory } from '../src/loop/SessionHistory';
import { SessionManager } from '@agent-os/sessions';
import type { Model, GenerationRequest, StreamEvent } from '@agent-os/providers';

describe('AgentLoop with Streaming Model', () => {
  let tempDir: string;
  let sessionManager: SessionManager;
  let history: SessionHistory;
  let eventBus: LoggingEventBus;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-stream-loop-'));
    const dbPath = path.join(tempDir, 'sessions.db');
    sessionManager = new SessionManager(dbPath);
    history = new SessionHistory(sessionManager);
    eventBus = new LoggingEventBus();
  });

  afterEach(() => {
    try {
      sessionManager.close();
    } catch {}
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it('AgentLoop executes streamed tool calls and completes the task', async () => {
    const sessionId = 'test-stream-session';
    sessionManager.createSession(sessionId);

    let callCount = 0;
    const streamedDeltas: string[] = [];
    eventBus.subscribe('message.delta', (event: any) => {
      streamedDeltas.push(event.payload?.delta);
    });

    const streamingModel: Model = {
      id: 'mock-streaming',
      async generate(request: GenerationRequest) {
        throw new Error('generate should not be called when stream is supported');
      },
      async *stream(request: GenerationRequest): AsyncIterable<StreamEvent> {
        callCount++;
        if (callCount === 1) {
          yield { type: 'text_delta', text: 'Let me fetch data. ' };
          yield { type: 'tool_call_start', id: 'call_1', name: 'sample_tool' };
          yield {
            type: 'tool_call_args_delta',
            id: 'call_1',
            delta: '{"input":"test-value"}',
          };
          yield {
            type: 'tool_call_end',
            id: 'call_1',
            arguments: { input: 'test-value' },
          };
          yield {
            type: 'done',
            usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
          };
        } else {
          yield { type: 'text_delta', text: 'Task finished successfully.' };
          yield {
            type: 'done',
            usage: { inputTokens: 20, outputTokens: 10, totalTokens: 30 },
          };
        }
      },
    };

    let toolExecuted = false;
    const sampleTool: LoopTool = {
      spec: {
        name: 'sample_tool',
        description: 'A sample tool',
        readOnly: true,
        parameters: {
          type: 'object',
          properties: { input: { type: 'string' } },
          required: ['input'],
        },
      },
      requiresApproval: async () => false,
      execute: async (args: any) => {
        toolExecuted = true;
        return {
          toolCallId: 'call_1',
          name: 'sample_tool',
          content: `Executed with ${args.input}`,
          isError: false,
        };
      },
    };

    const loop = new AgentLoop({
      model: streamingModel,
      tools: [sampleTool],
      history,
      eventBus,
      workspaceRoot: tempDir,
      options: { maxTurns: 5 },
    });

    const summary = await loop.run({
      sessionId,
      workspaceRoot: tempDir,
      userInput: 'Run sample tool',
    });

    expect(toolExecuted).toBe(true);
    expect(summary.success).toBe(true);
    expect(summary.finalText).toBe('Task finished successfully.');
    expect(summary.turns).toBe(2);
    expect(streamedDeltas).toContain('Let me fetch data. ');
    expect(streamedDeltas).toContain('Task finished successfully.');
  });
});
