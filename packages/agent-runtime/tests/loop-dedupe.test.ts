import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { SessionManager } from '@agent-os/sessions';
import { LoggingEventBus } from '@agent-os/shared';
import { SessionHistory } from '../src/loop/SessionHistory';
import { AgentLoop } from '../src/loop/AgentLoop';
import type { LoopTool } from '../src/loop/LoopTool';
import { ScriptedModel } from './helpers/ScriptedModel';

describe('Action 6-13: Unified AgentLoop Execution (run and resume deduplication)', () => {
  let tempDir: string;
  let dbPath: string;
  let sm: SessionManager;
  let history: SessionHistory;
  let eventBus: LoggingEventBus;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-dedupe-test-'));
    dbPath = path.join(tempDir, 'sessions.db');
    sm = new SessionManager(dbPath);
    history = new SessionHistory(sm);
    eventBus = new LoggingEventBus();
  });

  afterEach(() => {
    try {
      sm.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  const createTool = (name: string, onExec?: () => void): LoopTool => ({
    spec: {
      name,
      description: `Tool ${name}`,
      parameters: { type: 'object', properties: {} },
      readOnly: false,
    },
    requiresApproval: () => false,
    execute: async () => {
      if (onExec) onExec();
      return { toolCallId: `tc-${name}`, name, content: `Done ${name}`, isError: false };
    },
  });

  it('1. run delegates through unified loop and completes normally', async () => {
    const sessionId = 'session-run-unified';
    sm.createSession(sessionId);

    let executed = false;
    const model = new ScriptedModel([
      {
        text: 'Using tool',
        toolCalls: [{ id: 'tc-a', name: 'tool_a', args: {} }],
      },
      { text: 'Finished unified run' },
    ]);

    const loop = new AgentLoop({
      model,
      tools: [createTool('tool_a', () => { executed = true; })],
      history,
      eventBus,
      workspaceRoot: tempDir,
    });

    const summary = await loop.run({
      sessionId,
      userInput: 'Run task',
      workspaceRoot: tempDir,
    });

    expect(summary.success).toBe(true);
    expect(executed).toBe(true);
    expect(summary.turns).toBe(2);
    expect(summary.finalText).toBe('Finished unified run');
  });

  it('2. resume delegates through unified loop, resumes pending tool call, and finishes', async () => {
    const sessionId = 'session-resume-unified';
    sm.createSession(sessionId);

    // Seed history as if turn 1 assistant called tool_b, but process crashed before tool_b executed
    await history.appendUser(sessionId, 'Initial user input');
    await history.appendAssistant(sessionId, 'Calling tool_b', [
      { id: 'tc-pending', name: 'tool_b', args: '{}' },
    ]);

    sm.createRun({
      id: 'crashed-run-id',
      sessionId,
      status: 'running',
      userInput: 'Initial user input',
    });

    let toolBExecuted = false;
    const model = new ScriptedModel([
      { text: 'Finished resumed task successfully' },
    ]);

    const loop = new AgentLoop({
      model,
      tools: [createTool('tool_b', () => { toolBExecuted = true; })],
      history,
      eventBus,
      workspaceRoot: tempDir,
    });

    const summary = await loop.resume({
      sessionId,
      runId: 'crashed-run-id',
      workspaceRoot: tempDir,
    });

    expect(summary.success).toBe(true);
    expect(toolBExecuted).toBe(true);
    expect(summary.finalText).toBe('Finished resumed task successfully');
  });
});
