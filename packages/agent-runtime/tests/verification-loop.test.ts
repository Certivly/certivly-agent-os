import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as path from 'path';
import * as fs from 'fs';
import { SessionManager } from '@agent-os/sessions';
import { LoggingEventBus } from '@agent-os/shared';
import { SessionHistory } from '../src/loop/SessionHistory';
import { AgentLoop } from '../src/loop/AgentLoop';
import type { LoopTool } from '../src/loop/LoopTool';
import { ScriptedModel } from './helpers/ScriptedModel';
import type { LightweightPlan } from '../src/loop/types';

describe('Real Verification Feedback Loop (Action 4-07)', () => {
  const baseTmpDir = path.join(__dirname, '.tmp-verification-loop');
  let workspaceDir: string;
  let dbPath: string;

  beforeEach(() => {
    if (!fs.existsSync(baseTmpDir)) {
      fs.mkdirSync(baseTmpDir, { recursive: true });
    }
    const testId = crypto.randomUUID();
    workspaceDir = path.join(baseTmpDir, `ws-${testId}`);
    fs.mkdirSync(workspaceDir, { recursive: true });
    dbPath = path.join(baseTmpDir, `db-${testId}.sqlite`);

    // Create a dummy package.json
    fs.writeFileSync(
      path.join(workspaceDir, 'package.json'),
      JSON.stringify(
        {
          name: 'test-fixture',
          scripts: { test: 'bun test' },
        },
        null,
        2
      )
    );
  });

  afterEach(() => {
    try {
      if (fs.existsSync(baseTmpDir)) {
        fs.rmSync(baseTmpDir, { recursive: true, force: true });
      }
    } catch {}
  });

  const createTools = (wsDir: string): LoopTool[] => [
    {
      spec: {
        name: 'write_file',
        description: 'Write file',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            content: { type: 'string' },
          },
          required: ['path', 'content'],
        },
        readOnly: false,
      },
      requiresApproval: () => false,
      execute: async (args, _signal, toolCallId = 'tc') => {
        const filePath = path.resolve(wsDir, args.path as string);
        fs.writeFileSync(filePath, (args.content as string) || '', 'utf8');
        return { toolCallId, name: 'write_file', content: `Wrote ${args.path}`, isError: false };
      },
    },
  ];

  it('1. Verification failure triggers repair turn: injects [Verification Failed] and gives model second turn', async () => {
    const sm = new SessionManager(dbPath);
    const history = new SessionHistory(sm);
    const eventBus = new LoggingEventBus();
    const tools = createTools(workspaceDir);

    let verifAttempt = 0;
    const model = new ScriptedModel([
      {
        text: 'Turn 1: breaking edit',
        toolCalls: [
          {
            id: 'tc-break',
            name: 'write_file',
            args: { path: 'code.ts', content: 'export const broken = true;' },
          },
        ],
      },
      {
        text: 'Turn 2: initial edit complete',
      },
      {
        text: 'Turn 3: model sees verification failure and fixes it',
        toolCalls: [
          {
            id: 'tc-fix',
            name: 'write_file',
            args: { path: 'code.ts', content: 'export const broken = false;' },
          },
        ],
      },
      {
        text: 'Turn 4: all tests now pass!',
      },
    ]);

    const loop = new AgentLoop({
      model,
      tools,
      history,
      eventBus,
      workspaceRoot: workspaceDir,
      options: {
        maxTurns: 10,
        maxVerificationFixAttempts: 3,
        verificationExecutor: async () => {
          verifAttempt++;
          if (verifAttempt === 1) {
            return { exitCode: 1, stdout: '', stderr: 'FAIL code.test.ts: broken is true' };
          }
          return { exitCode: 0, stdout: 'PASS code.test.ts: all pass', stderr: '' };
        },
      },
    });

    const summary = await loop.run({
      sessionId: 'session-repair-1',
      userInput: 'Fix broken code in code.ts',
      workspaceRoot: workspaceDir,
    });

    expect(summary.success).toBe(true);
    expect(summary.repairAttempts).toBe(1);
    expect(summary.verificationPassed).toBe(true);

    // Verify [Verification Failed] was injected into history
    const allMsgs = await history.load('session-repair-1');
    const failureMsg = allMsgs.find(m => m.content.includes('[Verification Failed]'));
    expect(failureMsg).toBeDefined();
    expect(failureMsg?.content).toContain('broken is true');
  });

  it('2. Verification success marks pipeline complete: verificationPassed is true', async () => {
    const sm = new SessionManager(dbPath);
    const history = new SessionHistory(sm);
    const eventBus = new LoggingEventBus();
    const tools = createTools(workspaceDir);

    const model = new ScriptedModel([
      {
        text: 'Applying clean change',
        toolCalls: [
          {
            id: 'tc-clean',
            name: 'write_file',
            args: { path: 'clean.ts', content: 'export const clean = true;' },
          },
        ],
      },
      {
        text: 'Clean change finished.',
      },
    ]);

    const loop = new AgentLoop({
      model,
      tools,
      history,
      eventBus,
      workspaceRoot: workspaceDir,
      options: {
        maxTurns: 5,
        verificationExecutor: async () => ({
          exitCode: 0,
          stdout: 'PASS all tests passed',
          stderr: '',
        }),
      },
    });

    const summary = await loop.run({
      sessionId: 'session-success-pipeline',
      userInput: 'Make clean change',
      workspaceRoot: workspaceDir,
    });

    expect(summary.success).toBe(true);
    expect(summary.verificationPassed).toBe(true);
    expect(summary.repairAttempts).toBe(0);
    expect(summary.verification?.verdict).toBe('verified');
  });

  it('3. Max repair cap: after 3 failed verifications, loop exits with success: false and repairAttempts: 3', async () => {
    const sm = new SessionManager(dbPath);
    const history = new SessionHistory(sm);
    const eventBus = new LoggingEventBus();
    const tools = createTools(workspaceDir);

    const model = new ScriptedModel([
      {
        text: 'Initial edit',
        toolCalls: [
          {
            id: 'tc-1',
            name: 'write_file',
            args: { path: 'persistent-fail.ts', content: 'export const x = 1;' },
          },
        ],
      },
      {
        text: 'Initial edit done',
      },
      {
        text: 'Repair 1 attempt',
        toolCalls: [
          {
            id: 'tc-2',
            name: 'write_file',
            args: { path: 'persistent-fail.ts', content: 'export const x = 2;' },
          },
        ],
      },
      {
        text: 'Repair 1 done',
      },
      {
        text: 'Repair 2 attempt',
        toolCalls: [
          {
            id: 'tc-3',
            name: 'write_file',
            args: { path: 'persistent-fail.ts', content: 'export const x = 3;' },
          },
        ],
      },
      {
        text: 'Repair 2 done',
      },
    ]);

    const loop = new AgentLoop({
      model,
      tools,
      history,
      eventBus,
      workspaceRoot: workspaceDir,
      options: {
        planningMode: 'off',
        maxTurns: 10,
        maxVerificationFixAttempts: 3,
        verificationExecutor: async () => ({
          exitCode: 1,
          stdout: '',
          stderr: 'PERSISTENT FAILURE: cannot compile',
        }),
      },
    });

    const summary = await loop.run({
      sessionId: 'session-max-cap',
      userInput: 'Try fixing',
      workspaceRoot: workspaceDir,
    });

    expect(summary.success).toBe(false);
    expect(summary.repairAttempts).toBe(3);
    expect(summary.verificationPassed).toBe(false);
    expect(summary.errors.some(e => e.includes('Verification failed after 3 fix attempts'))).toBe(true);
  });

  it('4. Read-only run skips verification: when plan.pipeline is [explore], no verification runs', async () => {
    const sm = new SessionManager(dbPath);
    const history = new SessionHistory(sm);
    const eventBus = new LoggingEventBus();
    let executorCalled = false;

    const explorePlan: LightweightPlan = {
      objective: 'Analyze the system',
      filesLikelyTouched: [],
      steps: ['Read docs'],
      verificationCommands: ['bun test'],
      risks: [],
      pipeline: ['explore'],
      isEditTask: false,
    };

    const model = new ScriptedModel([
      {
        text: 'Here is the analysis of the system.',
      },
    ]);

    const loop = new AgentLoop({
      model,
      tools: [],
      history,
      eventBus,
      workspaceRoot: workspaceDir,
      options: {
        planningMode: 'off',
        verificationExecutor: async () => {
          executorCalled = true;
          return { exitCode: 0, stdout: 'ok', stderr: '' };
        },
      },
    });

    const summary = await loop.run({
      sessionId: 'session-readonly',
      userInput: 'Analyze system',
      workspaceRoot: workspaceDir,
    });

    expect(summary.success).toBe(true);
    expect(executorCalled).toBe(false);
    expect(summary.verificationPassed).toBeUndefined();
    expect(summary.hasChanges).toBe(false);
  });
});
