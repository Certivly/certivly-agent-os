import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ParallelExplorer } from '../src/exploration/ParallelExplorer';
import { AgentLoop } from '../src/loop/AgentLoop';
import { SessionHistory } from '../src/loop/SessionHistory';
import { SessionManager } from '@agent-os/sessions';
import { LoggingEventBus } from '@agent-os/shared';
import type { LoopTool } from '../src/loop/LoopTool';
import type { Model, GenerationRequest, GenerationResponse } from '@agent-os/providers';

describe('Parallel Read-Only Exploration', () => {
  let tempDir: string;
  let dbPath: string;
  let sessionManager: SessionManager;
  let history: SessionHistory;
  let eventBus: LoggingEventBus;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'parallel-expl-test-'));
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

  it('1. read-only tools allowed during exploration', async () => {
    let readToolCalled = false;
    const readTool: LoopTool = {
      spec: {
        name: 'read_file',
        description: 'Read file',
        readOnly: true,
        parameters: { type: 'object', properties: {} },
      },
      requiresApproval: async () => false,
      execute: async () => {
        readToolCalled = true;
        return { toolCallId: '1', name: 'read_file', content: 'contents', isError: false };
      },
    };

    const model: Model = {
      id: 'test-model',
      async generate(): Promise<GenerationResponse> {
        return {
          text: 'Found files',
          toolCalls: [{ id: 'tc1', name: 'read_file', args: '{}' }],
        };
      },
    };

    const explorer = new ParallelExplorer({
      model,
      tools: [readTool],
    });

    const res = await explorer.runJob(
      { topic: 'likely_files', prompt: 'Find files' },
      'Check code'
    );

    expect(readToolCalled).toBe(true);
    expect(res.summary).toBe('Found files');
  });

  it('2. write tools rejected during exploration', async () => {
    let writeExecuted = false;
    const writeTool: LoopTool = {
      spec: {
        name: 'edit_file',
        description: 'Edit file',
        readOnly: false,
        parameters: { type: 'object', properties: {} },
      },
      requiresApproval: async () => false,
      execute: async () => {
        writeExecuted = true;
        return { toolCallId: '1', name: 'edit_file', content: 'edited', isError: false };
      },
    };

    const model: Model = {
      id: 'test-model',
      async generate(): Promise<GenerationResponse> {
        return {
          text: 'Attempting edit',
          toolCalls: [{ id: 'tc1', name: 'edit_file', args: '{}' }],
        };
      },
    };

    const explorer = new ParallelExplorer({
      model,
      tools: [writeTool],
    });

    expect(
      explorer.runJob(
        { topic: 'risk_areas', prompt: 'Check risks' },
        'Analyze'
      )
    ).rejects.toThrow('Tool edit_file is not permitted during read-only exploration');

    expect(writeExecuted).toBe(false);
  });

  it('3. summaries merge deterministically', () => {
    const rawFindings = [
      { topic: 'test_commands', summary: 'Run bun test' },
      { topic: 'risk_areas', summary: 'Auth regression risk' },
      { topic: 'likely_files', summary: 'src/auth.ts, src/app.ts' },
    ];

    const merged = ParallelExplorer.mergeSummaries(rawFindings);

    const expectedOrder =
      'Exploration Summary:\n' +
      '- Likely Files: src/auth.ts, src/app.ts\n' +
      '- Risk Areas: Auth regression risk\n' +
      '- Test Commands: Run bun test';

    expect(merged).toBe(expectedOrder);
  });

  it('4. timeout cancels jobs', async () => {
    const slowModel: Model = {
      id: 'slow-model',
      async generate(req): Promise<GenerationResponse> {
        // Hang longer than timeout
        await new Promise((r) => setTimeout(r, 200));
        return { text: 'Done' };
      },
    };

    const explorer = new ParallelExplorer({
      model: slowModel,
      timeoutMs: 50, // very short timeout
    });

    const summary = await explorer.explore('Task');
    // On timeout, jobs are aborted and returns empty or partial without hanging
    expect(summary).toBe('');
  });

  it('5. main loop receives summary before first edit', async () => {
    const sessionId = 'test-expl-loop';
    sessionManager.createSession(sessionId);

    let systemPromptSeenByMainLoop = '';
    let turns = 0;

    const model: Model = {
      id: 'test-model',
      async generate(req: GenerationRequest): Promise<GenerationResponse> {
        // If this is an exploration job
        if (req.systemPrompt?.includes('exploration sub-agent')) {
          return { text: 'Identified target src/index.ts' };
        }

        turns++;
        if (turns === 1) {
          systemPromptSeenByMainLoop = req.systemPrompt || '';
          return {
            text: 'I will write the file.',
            toolCalls: [
              {
                id: 'call_1',
                name: 'write_file',
                args: JSON.stringify({ path: 'src/index.ts', content: 'export const ok = true;' }),
              },
            ],
          };
        }

        return { text: 'Task completed successfully.' };
      },
    };

    const writeTool: LoopTool = {
      spec: {
        name: 'write_file',
        description: 'Write file',
        readOnly: false,
        parameters: { type: 'object', properties: {} },
      },
      requiresApproval: async () => false,
      execute: async () => ({
        toolCallId: 'call_1',
        name: 'write_file',
        content: 'written',
        isError: false,
      }),
    };

    const loop = new AgentLoop({
      model,
      tools: [writeTool],
      history,
      eventBus,
      workspaceRoot: tempDir,
      options: {
        maxTurns: 3,
        maxWallTimeMs: 10000,
        maxApproxTokens: 4000,
        parallelExploration: true, // Enable feature flag
        skipVerification: true,
      },
    });

    const summary = await loop.run({
      sessionId,
      workspaceRoot: tempDir,
      userInput: 'Implement feature',
    });

    expect(summary.success).toBe(true);
    expect(systemPromptSeenByMainLoop).toContain('Exploration Summary:');
    expect(systemPromptSeenByMainLoop).toContain('Identified target src/index.ts');
  });
});
