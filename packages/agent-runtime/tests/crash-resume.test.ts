import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SessionManager } from '@agent-os/sessions';
import { LoggingEventBus } from '@agent-os/shared';
import { AgentLoop } from '../src/loop/AgentLoop';
import { SessionHistory } from '../src/loop/SessionHistory';
import type { LoopTool } from '../src/loop/LoopTool';
import type { Model, GenerationRequest, GenerationResponse } from '@agent-os/providers';

describe('Crash Resume Behavior', () => {
  let tempDir: string;
  let dbPath: string;
  let sessionManager: SessionManager;
  let history: SessionHistory;
  let eventBus: LoggingEventBus;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentos-resume-test-'));
    dbPath = path.join(tempDir, 'sessions.db');
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



  it('1. crash after assistant tool call persists state, resume executes only missing continuation and does not run completed tool twice', async () => {
    const sessionId = 'test-session-crash';
    sessionManager.createSession(sessionId);

    let tool1ExecCount = 0;
    let tool2ExecCount = 0;

    const tool1: LoopTool = {
      spec: {
        name: 'step_one',
        description: 'First step',
        readOnly: false,
        parameters: { type: 'object', properties: {} },
      },
      requiresApproval: async () => false,
      execute: async () => {
        tool1ExecCount++;
        return {
          toolCallId: 'call_1',
          name: 'step_one',
          content: 'step 1 finished',
          isError: false,
        };
      },
    };

    let shouldCrashOnTool2 = true;

    const tool2: LoopTool = {
      spec: {
        name: 'step_two',
        description: 'Second step',
        readOnly: false,
        parameters: { type: 'object', properties: {} },
      },
      requiresApproval: async () => false,
      execute: async () => {
        if (shouldCrashOnTool2) {
          const err: any = new Error('SIMULATED_PROCESS_CRASH');
          err.fatal = true;
          throw err;
        }

        tool2ExecCount++;
        return {
          toolCallId: 'call_2',
          name: 'step_two',
          content: 'step 2 finished',
          isError: false,
        };
      },
    };

    // Scripted model:
    // Turn 1: requests tool1 and tool2
    // Turn 2: returns final answer
    let callIndex = 0;
    const model: Model = {
      id: 'test-model',
      async generate(req: GenerationRequest): Promise<GenerationResponse> {
        callIndex++;
        if (callIndex === 1) {
          return {
            text: 'I will run step 1 and step 2',
            toolCalls: [
              { id: 'call_1', name: 'step_one', args: '{}' },
              { id: 'call_2', name: 'step_two', args: '{}' },
            ],
          };
        } else {
          return {
            text: 'All steps completed successfully!',
          };
        }
      },
    };


    const loop = new AgentLoop({
      model,
      tools: [tool1, tool2],
      history,
      eventBus,
      workspaceRoot: tempDir,
    });

    const runId = 'crash-run-1';

    // 1. Initial run crashes during tool2
    const initialSummary = await loop.run({
      sessionId,
      runId,
      userInput: 'Run two steps please',
      workspaceRoot: tempDir,
    });

    // Run failed due to crash
    expect(initialSummary.success).toBe(false);
    expect(tool1ExecCount).toBe(1);
    expect(tool2ExecCount).toBe(0);

    // Verify step_one result was persisted
    const toolCallsInDb = sessionManager.getToolCallsForSession(sessionId);
    const tc1 = toolCallsInDb.find(tc => tc.id === 'call_1');
    expect(tc1).toBeDefined();
    expect(tc1?.result).toBe('step 1 finished');

    // 2. Resume the run
    // Now tool2 will succeed
    shouldCrashOnTool2 = false;

    // Reset run status to simulated crash state ('running') or resume directly
    sessionManager.updateRun(runId, { status: 'running' });

    const resumeSummary = await loop.resume({
      sessionId,
      runId,
      workspaceRoot: tempDir,
    });

    // Verify:
    // - Tool 1 was NOT re-executed (still count == 1)
    expect(tool1ExecCount).toBe(1);
    // - Tool 2 was executed (count == 1)
    expect(tool2ExecCount).toBe(1);
    // - Resume completed successfully
    expect(resumeSummary.success).toBe(true);
    expect(resumeSummary.status).toBe('completed');
    expect(resumeSummary.finalText).toContain('All steps completed successfully!');

    // Check run status in DB
    const persistedRun = sessionManager.getRun(runId);
    expect(persistedRun?.status).toBe('completed');
  });

  it('2. cancelled run does not auto-resume', async () => {
    const sessionId = 'test-cancelled-session';
    sessionManager.createSession(sessionId);

    const runId = 'cancelled-run-1';
    sessionManager.createRun({
      id: runId,
      sessionId,
      status: 'cancelled',
      userInput: 'cancelled input',
    });

    // Add a message so it's not empty
    await history.appendUser(sessionId, 'cancelled input');

    const model: Model = {
      id: 'test-model',
      async generate(): Promise<GenerationResponse> {
        return { text: 'Done' };
      },
    };


    const loop = new AgentLoop({
      model,
      history,
      eventBus,
      workspaceRoot: tempDir,
    });

    expect(
      loop.resume({
        sessionId,
        runId,
        workspaceRoot: tempDir,
      })
    ).rejects.toThrow('Cannot resume cancelled run');
  });

  it('3. fails clearly on inconsistent state with trace path', async () => {
    const sessionId = 'test-inconsistent-session';
    sessionManager.createSession(sessionId);

    const runId = 'inconsistent-run-1';
    sessionManager.createRun({
      id: runId,
      sessionId,
      status: 'running',
      userInput: 'empty state',
      tracePath: '/path/to/trace.jsonl',
    });

    const model: Model = {
      id: 'test-model',
      async generate(): Promise<GenerationResponse> {
        return { text: 'Done' };
      },
    };


    const loop = new AgentLoop({
      model,
      history,
      eventBus,
      workspaceRoot: tempDir,
    });

    expect(
      loop.resume({
        sessionId,
        runId,
        workspaceRoot: tempDir,
      })
    ).rejects.toThrow('Inconsistent session state: no messages found');
  });
});
