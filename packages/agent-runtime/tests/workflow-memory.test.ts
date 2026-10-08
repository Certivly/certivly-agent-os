import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { WorkflowMemoryStore } from '../src/memory/WorkflowMemoryStore';
import { AgentLoop } from '../src/loop/AgentLoop';
import { ToolRegistry } from '@agent-os/tools';
import { SessionHistory } from '../src/loop/SessionHistory';
import { SessionManager } from '@agent-os/sessions';
import { LoggingEventBus } from '@agent-os/shared';
import { FakeScriptedModel } from '@agent-os/providers';

describe('WorkflowMemoryStore (Action 3.09)', () => {
  let tmpDir: string;
  let dbPath: string;
  let store: WorkflowMemoryStore;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-memory-test-'));
    dbPath = path.join(tmpDir, 'memory.db');
    store = new WorkflowMemoryStore(dbPath);
  });

  afterEach(() => {
    store.close();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  });

  it('1. verified run stores passing commands', () => {
    const saved = store.save({
      runId: 'run-1',
      verdict: 'verified',
      packageManager: 'bun',
      passingBuildCommands: ['bunx tsc --noEmit'],
      passingTestCommands: ['bun test'],
      filesChanged: ['src/math.ts'],
    });

    expect(saved).toBe(true);

    const memories = store.getMemories();
    expect(memories.length).toBe(1);
    expect(memories[0].verdict).toBe('verified');
    expect(memories[0].packageManager).toBe('bun');
    expect(memories[0].passingBuildCommands).toEqual(['bunx tsc --noEmit']);
    expect(memories[0].passingTestCommands).toEqual(['bun test']);
  });

  it('2. failed run stores failure signature', () => {
    const saved = store.save({
      runId: 'run-2',
      verdict: 'failed',
      packageManager: 'npm',
      failedCommandSignatures: ['npm test (exitCode: 1)'],
      filesChanged: ['src/broken.ts'],
    });

    expect(saved).toBe(true);

    const memories = store.getMemories();
    expect(memories.length).toBe(1);
    expect(memories[0].verdict).toBe('failed');
    expect(memories[0].failedCommandSignatures).toEqual(['npm test (exitCode: 1)']);
  });

  it('3. unverified run does not store success', () => {
    // Attempting to save an unverified run should be rejected
    const saved = store.save({
      runId: 'run-3',
      verdict: 'unverified' as any,
      packageManager: 'bun',
      passingTestCommands: ['bun test'],
    });

    expect(saved).toBe(false);
    expect(store.getMemories().length).toBe(0);
  });

  it('4. next run receives command hints', () => {
    store.save({
      runId: 'run-4',
      verdict: 'verified',
      packageManager: 'bun',
      passingBuildCommands: ['bunx tsc --noEmit'],
      passingTestCommands: ['bun test'],
    });

    const hints = store.formatPromptHints();
    expect(hints).toContain('Known project checks:');
    expect(hints).toContain('- bunx tsc --noEmit');
    expect(hints).toContain('- bun test');
  });

  it('5. duplicate memory is ignored', () => {
    const saved1 = store.save({
      runId: 'run-5a',
      verdict: 'verified',
      packageManager: 'bun',
      passingBuildCommands: ['bunx tsc --noEmit'],
      passingTestCommands: ['bun test'],
    });
    expect(saved1).toBe(true);

    // Save exact same content with different runId
    const saved2 = store.save({
      runId: 'run-5b',
      verdict: 'verified',
      packageManager: 'bun',
      passingBuildCommands: ['bunx tsc --noEmit'],
      passingTestCommands: ['bun test'],
    });
    expect(saved2).toBe(false);

    expect(store.getMemories().length).toBe(1);
  });

  it('integrates with AgentLoop to supply prompt hints and persist verified results', async () => {
    // Pre-populate store with verified checks
    store.save({
      runId: 'setup-run',
      verdict: 'verified',
      packageManager: 'bun',
      passingBuildCommands: ['bunx tsc --noEmit'],
      passingTestCommands: ['bun test'],
    });

    const sessionDb = path.join(tmpDir, 'sessions.db');
    const sessionManager = new SessionManager(sessionDb);
    const history = new SessionHistory(sessionManager);
    const eventBus = new LoggingEventBus();
    const toolRegistry = new ToolRegistry();

    let capturedSystemPrompt = '';
    const fakeModel = {
      id: 'test-model',
      generate: async (req: any) => {
        capturedSystemPrompt = req.systemPrompt || '';
        return {
          text: 'I understand the plan.',
        };
      },
      stream: async function* (req: any) {
        capturedSystemPrompt = req.systemPrompt || '';
        yield { type: 'text_delta', text: 'I understand the plan.' };
      },
    } as any;

    const loop = new AgentLoop({
      model: fakeModel,
      tools: [],
      toolRegistry,
      history,
      eventBus,
      workspaceRoot: tmpDir,
      options: {
        maxTurns: 3,
        workflowMemoryStore: store,
      },
    });

    const summary = await loop.run({
      sessionId: 'test-mem-session',
      userInput: 'Check the status',
      workspaceRoot: tmpDir,
    });

    expect(summary.success).toBe(true);

    // Verify system prompt received the hints
    expect(capturedSystemPrompt).toContain('Known project checks:');
    expect(capturedSystemPrompt).toContain('bunx tsc --noEmit');
    expect(capturedSystemPrompt).toContain('bun test');

    sessionManager.close();
  });
});
