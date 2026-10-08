import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { AgentLoop } from '../src/loop/AgentLoop';
import { SessionHistory } from '../src/loop/SessionHistory';
import { SessionManager } from '@agent-os/sessions';
import { LoggingEventBus } from '@agent-os/shared';
import { RunTracer } from '../src/trace/RunTracer';
import type { LoopTool } from '../src/loop/LoopTool';
import type { Model, GenerationRequest, GenerationResponse } from '@agent-os/providers';

describe('Action 3.13: Lightweight Planning Mode', () => {
  let tempDir: string;
  let tracesDir: string;
  let dbPath: string;
  let sessionManager: SessionManager;
  let history: SessionHistory;
  let eventBus: LoggingEventBus;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lightweight-planning-test-'));
    tracesDir = path.join(tempDir, 'traces');
    fs.mkdirSync(tracesDir, { recursive: true });
    dbPath = path.join(tempDir, 'sessions.db');
    sessionManager = new SessionManager(dbPath);
    history = new SessionHistory(sessionManager);
    eventBus = new LoggingEventBus();

    fs.writeFileSync(
      path.join(tempDir, 'package.json'),
      JSON.stringify({
        name: 'test-lightweight-planning',
        scripts: { test: 'bun test' },
      })
    );
  });

  afterEach(() => {
    try {
      sessionManager.close();
    } catch {}
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  const createDummyEditTool = (): LoopTool => ({
    spec: {
      name: 'edit_file',
      description: 'Edit a file',
      readOnly: false,
      parameters: { type: 'object', properties: {} },
    },
    requiresApproval: async () => false,
    execute: async (args: any) => {
      const fullPath = path.join(tempDir, args.path || 'file.ts');
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, args.content || 'code');
      return {
        toolCallId: 'call_1',
        name: 'edit_file',
        content: 'edited',
        isError: false,
      };
    },
  });

  it('1. small bug fix skips plan in auto mode', async () => {
    let planEvents = 0;
    eventBus.subscribe('plan.created', () => {
      planEvents++;
    });

    const model: Model = {
      id: 'mock-model',
      generate: async () => ({
        text: 'Fixed the typo in greeting without planning.',
      }),
      stream: async function* () {
        yield { type: 'text_delta', text: 'Fixed the typo in greeting without planning.' };
        yield { type: 'done' };
      },
    };

    const sessionId = 'session-small-fix';
    sessionManager.createSession(sessionId);
    const loop = new AgentLoop({
      model,
      tools: [],
      history,
      eventBus,
      workspaceRoot: tempDir,
      options: {
        skipVerification: true,
        planningMode: 'auto',
      },
    });

    const summary = await loop.run({
      sessionId,
      userInput: 'Fix typo in greeting string',
      workspaceRoot: tempDir,
    });

    expect(summary.success).toBe(true);
    expect(summary.plan).toBeUndefined();
    expect(planEvents).toBe(0);
  });

  it('2. multi-file request asks for plan', async () => {
    let planCreatedEventReceived = false;
    eventBus.subscribe('plan.created', (e: any) => {
      planCreatedEventReceived = true;
      expect(e.payload?.plan?.objective).toContain('refactor');
    });

    const model: Model = {
      id: 'mock-model',
      generate: async (req: GenerationRequest): Promise<GenerationResponse> => {
        const lastMsg = req.messages[req.messages.length - 1];
        if (typeof lastMsg.content === 'string' && lastMsg.content.includes('lightweight execution plan')) {
          return {
            text: JSON.stringify({
              objective: 'Execute multi-file refactor of auth module',
              filesLikelyTouched: ['src/auth.ts', 'src/session.ts', 'src/user.ts'],
              steps: [
                'Separate auth token generation',
                'Refactor user credential validator',
                'Update session storage bindings',
              ],
              verificationCommands: ['bun test test/auth.test.ts'],
              risks: ['Breaking backwards compatibility with token decoder'],
            }),
          };
        }
        return {
          text: 'Finished the multi-file refactor successfully.',
        };
      },
      stream: async function* () {
        yield { type: 'text_delta', text: 'Finished the multi-file refactor successfully.' };
        yield { type: 'done' };
      },
    };

    const sessionId = 'session-multi-file';
    sessionManager.createSession(sessionId);
    const loop = new AgentLoop({
      model,
      tools: [],
      history,
      eventBus,
      workspaceRoot: tempDir,
      options: {
        skipVerification: true,
        planningMode: 'auto',
      },
    });

    const summary = await loop.run({
      sessionId,
      userInput: 'Please refactor the multi-file authentication system',
      workspaceRoot: tempDir,
    });

    expect(summary.success).toBe(true);
    expect(planCreatedEventReceived).toBe(true);
    expect(summary.plan).toBeDefined();
    expect(summary.plan?.objective).toContain('refactor');
    expect(summary.plan?.filesLikelyTouched.length).toBe(3);
    expect(summary.plan?.steps.length).toBe(3);
  });

  it('3. failed verification twice triggers plan', async () => {
    let planCreatedCount = 0;
    eventBus.subscribe('plan.created', () => {
      planCreatedCount++;
    });

    let verifCount = 0;
    const mockExecutor = async (): Promise<{ exitCode: number; stdout: string; stderr: string; durationMs: number }> => {
      verifCount++;
      if (verifCount <= 2) {
        return {
          exitCode: 1,
          stdout: '',
          stderr: `Assertion failed on attempt ${verifCount}`,
          durationMs: 10,
        };
      }
      return {
        exitCode: 0,
        stdout: 'All tests pass',
        stderr: '',
        durationMs: 10,
      };
    };

    let turn = 0;
    const model: Model = {
      id: 'mock-model',
      generate: async (req: GenerationRequest): Promise<GenerationResponse> => {
        const lastMsg = req.messages[req.messages.length - 1];
        if (typeof lastMsg.content === 'string' && lastMsg.content.includes('execution plan')) {
          return {
            text: JSON.stringify({
              objective: 'Plan created after multiple verification failures',
              filesLikelyTouched: ['src/fix.ts'],
              steps: ['Diagnose root cause', 'Apply fix', 'Verify tests'],
              verificationCommands: ['bun test'],
              risks: ['Persistent failure'],
            }),
          };
        }

        turn++;
        if (turn === 1) {
          return {
            text: 'Editing file to fix issue',
            toolCalls: [
              {
                id: 'call_1',
                name: 'edit_file',
                args: JSON.stringify({ path: 'src/fix.ts', content: '// fixed' }),
              },
            ],
          };
        }
        return {
          text: `Attempting verification turn ${turn}`,
        };
      },
    };

    const sessionId = 'session-retry-planning';
    sessionManager.createSession(sessionId);
    const loop = new AgentLoop({
      model,
      tools: [createDummyEditTool()],
      history,
      eventBus,
      workspaceRoot: tempDir,
      options: {
        skipVerification: false,
        verificationExecutor: mockExecutor,
        maxVerificationFixAttempts: 4,
        planningMode: 'auto',
      },
    });

    const summary = await loop.run({
      sessionId,
      userInput: 'Fix broken calculation in ledger',
      workspaceRoot: tempDir,
    });

    expect(summary.success).toBe(true);
    expect(planCreatedCount).toBeGreaterThanOrEqual(1);
    expect(summary.plan).toBeDefined();
    expect(summary.plan?.objective).toContain('verification failures');
  });

  it('4. plan appears in trace', async () => {
    const sessionId = 'session-trace-plan';
    const runId = 'run-trace-plan';
    sessionManager.createSession(sessionId);

    const tracer = new RunTracer({
      sessionId,
      runId,
      tracesDir,
      workspaceRoot: tempDir,
    });
    tracer.attachToEventBus(eventBus);

    const model: Model = {
      id: 'mock-model',
      generate: async (req: GenerationRequest): Promise<GenerationResponse> => {
        const lastMsg = req.messages[req.messages.length - 1];
        if (typeof lastMsg.content === 'string' && lastMsg.content.includes('lightweight execution plan')) {
          return {
            text: JSON.stringify({
              objective: 'Migrate configuration schema',
              filesLikelyTouched: ['src/config.ts'],
              steps: ['Update schema definitions', 'Migrate legacy keys'],
              verificationCommands: ['bun test config.test.ts'],
              risks: ['Parsing regressions'],
            }),
          };
        }
        return {
          text: 'Configuration migration complete.',
        };
      },
      stream: async function* () {
        yield { type: 'text_delta', text: 'Configuration migration complete.' };
        yield { type: 'done' };
      },
    };

    const loop = new AgentLoop({
      model,
      tools: [],
      history,
      eventBus,
      workspaceRoot: tempDir,
      options: {
        skipVerification: true,
        planningMode: 'auto',
      },
    });

    const summary = await loop.run({
      sessionId,
      runId,
      userInput: 'Migrate configuration schema to v2',
      workspaceRoot: tempDir,
      tracePath: tracer.traceFilePath,
    });

    expect(summary.success).toBe(true);
    tracer.stop();

    const traceEntries = RunTracer.readTrace(tracer.traceFilePath);
    const planEvent = traceEntries.find((e) => e.type === 'plan.created');
    expect(planEvent).toBeDefined();
    const payload = planEvent?.payload as any;
    expect(payload?.plan?.objective).toContain('Migrate');

    const markdown = RunTracer.exportMarkdown(traceEntries);
    expect(markdown).toContain('## Planning');
    expect(markdown).toContain('Initial Plan');
  });

  it('5. revision is recorded', async () => {
    let planRevisedCount = 0;
    eventBus.subscribe('plan.revised', () => {
      planRevisedCount++;
    });

    let verifCount = 0;
    const mockExecutor = async (): Promise<{ exitCode: number; stdout: string; stderr: string; durationMs: number }> => {
      verifCount++;
      if (verifCount <= 2) {
        return {
          exitCode: 1,
          stdout: '',
          stderr: 'Still failing tests',
          durationMs: 10,
        };
      }
      return {
        exitCode: 0,
        stdout: 'Passing',
        stderr: '',
        durationMs: 10,
      };
    };

    let turn = 0;
    const model: Model = {
      id: 'mock-model',
      generate: async (req: GenerationRequest): Promise<GenerationResponse> => {
        const lastMsg = req.messages[req.messages.length - 1];
        if (typeof lastMsg.content === 'string' && lastMsg.content.includes('revising an execution plan')) {
          return {
            text: JSON.stringify({
              objective: 'Revised plan for refactoring after verification failures',
              filesLikelyTouched: ['src/refactor.ts', 'src/helper.ts'],
              steps: ['Adjust helper functions', 'Retry refactoring', 'Verify test suite'],
              verificationCommands: ['bun test'],
              risks: ['Edge case breakages'],
            }),
          };
        }
        if (typeof lastMsg.content === 'string' && lastMsg.content.includes('lightweight execution plan')) {
          return {
            text: JSON.stringify({
              objective: 'Initial refactor plan',
              filesLikelyTouched: ['src/refactor.ts'],
              steps: ['Do refactor'],
              verificationCommands: ['bun test'],
              risks: [],
            }),
          };
        }

        turn++;
        if (turn === 1) {
          return {
            text: 'Editing refactor file',
            toolCalls: [
              {
                id: 'call_1',
                name: 'edit_file',
                args: JSON.stringify({ path: 'src/refactor.ts', content: '// refactored' }),
              },
            ],
          };
        }
        return {
          text: `Attempting verification after refactor ${turn}`,
        };
      },
    };

    const sessionId = 'session-plan-revision';
    sessionManager.createSession(sessionId);
    const loop = new AgentLoop({
      model,
      tools: [createDummyEditTool()],
      history,
      eventBus,
      workspaceRoot: tempDir,
      options: {
        skipVerification: false,
        verificationExecutor: mockExecutor,
        maxVerificationFixAttempts: 4,
        planningMode: 'auto',
      },
    });

    const summary = await loop.run({
      sessionId,
      userInput: 'Please refactor the core pipeline',
      workspaceRoot: tempDir,
    });

    expect(summary.success).toBe(true);
    expect(planRevisedCount).toBeGreaterThanOrEqual(1);
    expect(summary.planRevisions).toBeDefined();
    expect(summary.planRevisions?.length).toBeGreaterThanOrEqual(1);
    expect(summary.planRevisions?.[0].objective).toContain('Revised plan');
  });
});
