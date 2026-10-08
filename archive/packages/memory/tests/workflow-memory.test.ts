import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { AgentLoop } from '../src/loop/AgentLoop';
import { SessionHistory } from '../src/loop/SessionHistory';
import { SessionManager } from '@agent-os/sessions';
import { LoggingEventBus } from '@agent-os/shared';
import { WorkflowMemoryStore } from '@agent-os/memory';
import type { LoopTool } from '../src/loop/LoopTool';
import type { Model, GenerationRequest, GenerationResponse } from '@agent-os/providers';

describe('Verified Workflow Memory', () => {
  let tempDir: string;
  let dbPath: string;
  let memoryDbPath: string;
  let sessionManager: SessionManager;
  let history: SessionHistory;
  let eventBus: LoggingEventBus;
  let memoryStore: WorkflowMemoryStore;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-mem-test-'));
    dbPath = path.join(tempDir, 'sessions.db');
    memoryDbPath = path.join(tempDir, 'memory.db');
    sessionManager = new SessionManager(dbPath);
    history = new SessionHistory(sessionManager);
    eventBus = new LoggingEventBus();
    memoryStore = new WorkflowMemoryStore(memoryDbPath);

    // Setup package.json in tempDir so Verification can detect package manager
    fs.writeFileSync(
      path.join(tempDir, 'package.json'),
      JSON.stringify({
        name: 'test-pkg',
        scripts: { test: 'bun test', build: 'bunx tsc --noEmit' },
      })
    );
  });

  afterEach(() => {
    try {
      memoryStore.close();
      sessionManager.close();
    } catch {}
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it('1. verified run stores passing commands', async () => {
    const sessionId = 'test-verified-mem';
    sessionManager.createSession(sessionId);

    // Fake model that edits a file then completes
    let turn = 0;
    const model: Model = {
      id: 'test-model',
      async generate(request: GenerationRequest): Promise<GenerationResponse> {
        turn++;
        if (turn === 1) {
          return {
            text: 'I will modify a file.',
            toolCalls: [
              {
                id: 'call_edit',
                name: 'edit_file',
                args: JSON.stringify({ path: 'src.ts', content: 'const a = 1;' }),
              },
            ],
          };
        }
        return {
          text: 'File modified and verified.',
        };
      },
    };

    const editTool: LoopTool = {
      spec: {
        name: 'edit_file',
        description: 'Edit a file',
        readOnly: false,
        parameters: { type: 'object', properties: {} },
      },
      requiresApproval: async () => false,
      execute: async (args: any) => {
        fs.writeFileSync(path.join(tempDir, 'src.ts'), args.content || '');
        return {
          toolCallId: 'call_edit',
          name: 'edit_file',
          content: 'edited',
          isError: false,
        };
      },
    };

    const fakeExecutor = async (command: string, cwd: string) => {
      return { exitCode: 0, stdout: 'ok', stderr: '' };
    };

    const loop = new AgentLoop({
      model,
      tools: [editTool],
      history,
      eventBus,
      workspaceRoot: tempDir,
      options: {
        maxTurns: 5,
        maxWallTimeMs: 10000,
        maxApproxTokens: 4000,
        workflowMemoryStore: memoryStore,
        verificationExecutor: fakeExecutor,
      },
    });

    const summary = await loop.run({
      sessionId,
      workspaceRoot: tempDir,
      userInput: 'make changes',
    });

    expect(summary.success).toBe(true);
    expect(summary.verification?.verdict).toBe('verified');

    const memories = memoryStore.getMemories();
    expect(memories.length).toBe(1);
    expect(memories[0].verdict).toBe('verified');
    expect(memories[0].filesChanged).toContain('src.ts');
    expect(memories[0].passingTestCommands).toBeDefined();
    expect(memories[0].passingBuildCommands).toBeDefined();
  });

  it('2. failed run stores failure signature', async () => {
    const sessionId = 'test-failed-mem';
    sessionManager.createSession(sessionId);

    let turn = 0;
    const model: Model = {
      id: 'test-model',
      async generate(): Promise<GenerationResponse> {
        turn++;
        if (turn === 1) {
          return {
            text: 'Editing file.',
            toolCalls: [
              {
                id: 'call_edit',
                name: 'edit_file',
                args: JSON.stringify({ path: 'bug.ts', content: 'broken' }),
              },
            ],
          };
        }
        return { text: 'Done.' };
      },
    };

    const editTool: LoopTool = {
      spec: {
        name: 'edit_file',
        description: 'Edit',
        readOnly: false,
        parameters: { type: 'object', properties: {} },
      },
      requiresApproval: async () => false,
      execute: async () => ({
        toolCallId: 'call_edit',
        name: 'edit_file',
        content: 'edited',
        isError: false,
      }),
    };

    const failExecutor = async (command: string) => {
      return { exitCode: 1, stdout: '', stderr: 'SyntaxError: unexpected token' };
    };

    const loop = new AgentLoop({
      model,
      tools: [editTool],
      history,
      eventBus,
      workspaceRoot: tempDir,
      options: {
        maxTurns: 5,
        maxWallTimeMs: 10000,
        maxApproxTokens: 4000,
        maxVerificationFixAttempts: 1,
        workflowMemoryStore: memoryStore,
        verificationExecutor: failExecutor,
      },
    });

    const summary = await loop.run({
      sessionId,
      workspaceRoot: tempDir,
      userInput: 'edit bug.ts',
    });

    expect(summary.success).toBe(false);
    expect(summary.verification?.verdict).toBe('failed');

    const memories = memoryStore.getMemories();
    expect(memories.length).toBe(1);
    expect(memories[0].verdict).toBe('failed');
    expect(memories[0].failedCommandSignatures).toBeDefined();
    expect(memories[0].failedCommandSignatures?.length).toBeGreaterThan(0);
  });

  it('3. unverified run does not store success', async () => {
    const sessionId = 'test-unverified-mem';
    sessionManager.createSession(sessionId);

    // Run without modifying any files or with empty checks -> unverified
    const model: Model = {
      id: 'test-model',
      async generate(): Promise<GenerationResponse> {
        return { text: 'Just answering question without file edits.' };
      },
    };

    const loop = new AgentLoop({
      model,
      tools: [],
      history,
      eventBus,
      workspaceRoot: tempDir,
      options: {
        maxTurns: 5,
        maxWallTimeMs: 10000,
        maxApproxTokens: 4000,
        workflowMemoryStore: memoryStore,
      },
    });

    const summary = await loop.run({
      sessionId,
      workspaceRoot: tempDir,
      userInput: 'What is 2+2?',
    });

    expect(summary.success).toBe(true);
    // Because no files changed, verification didn't run -> verdict is undefined/unverified
    expect(summary.verification?.verdict).toBeUndefined();

    // Must NOT store any memory!
    const memories = memoryStore.getMemories();
    expect(memories.length).toBe(0);
  });

  it('4. next run receives command hints', async () => {
    // Seed verified memory into memoryStore
    memoryStore.save({
      runId: 'prior-run',
      verdict: 'verified',
      packageManager: 'bun',
      passingBuildCommands: ['bunx tsc --noEmit'],
      passingTestCommands: ['bun test'],
    });

    const sessionId = 'test-hints-session';
    sessionManager.createSession(sessionId);

    let receivedSystemPrompt = '';
    const model: Model = {
      id: 'test-model',
      async generate(req: GenerationRequest): Promise<GenerationResponse> {
        receivedSystemPrompt = req.systemPrompt || '';
        return { text: 'Received instructions.' };
      },
    };

    const loop = new AgentLoop({
      model,
      tools: [],
      history,
      eventBus,
      workspaceRoot: tempDir,
      options: {
        maxTurns: 1,
        maxWallTimeMs: 10000,
        maxApproxTokens: 4000,
        workflowMemoryStore: memoryStore,
      },
    });

    await loop.run({
      sessionId,
      workspaceRoot: tempDir,
      userInput: 'Start next run',
    });

    expect(receivedSystemPrompt).toContain('Known project checks:');
    expect(receivedSystemPrompt).toContain('- bunx tsc --noEmit');
    expect(receivedSystemPrompt).toContain('- bun test');
  });

  it('5. duplicate memory is ignored', () => {
    const record = {
      runId: 'run-1',
      verdict: 'verified' as const,
      packageManager: 'bun',
      passingBuildCommands: ['bunx tsc --noEmit'],
      passingTestCommands: ['bun test'],
    };

    const saved1 = memoryStore.save(record);
    expect(saved1).toBe(true);

    const saved2 = memoryStore.save({
      ...record,
      runId: 'run-2', // Different run ID, but identical commands & verdict
    });
    expect(saved2).toBe(false);

    const memories = memoryStore.getMemories();
    expect(memories.length).toBe(1);
  });
});
