import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { SessionManager } from '@agent-os/sessions';
import { LoggingEventBus } from '@agent-os/shared';
import {
  writeFileTool,
  editFileTool,
  commandPolicyEngine,
} from '@agent-os/tools';
import { SessionHistory } from '../src/loop/SessionHistory';
import { AgentLoop } from '../src/loop/AgentLoop';
import { AdaptedLoopTool } from '../src/loop/LoopTool';
import { ScriptedModel } from './helpers/ScriptedModel';

describe('Verification Feedback Loop (Action 2.14)', () => {
  let tempWorkspaceDir: string;
  let dbPath: string;

  beforeEach(() => {
    tempWorkspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-verify-feedback-'));
    dbPath = path.join(tempWorkspaceDir, `session-${crypto.randomUUID()}.db`);

    // package.json with test script
    fs.writeFileSync(
      path.join(tempWorkspaceDir, 'package.json'),
      JSON.stringify(
        {
          name: 'feedback-fixture',
          scripts: {
            test: 'bun test',
          },
        },
        null,
        2
      )
    );

    // Initial file
    fs.mkdirSync(path.join(tempWorkspaceDir, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(tempWorkspaceDir, 'src', 'index.ts'),
      'export const answer = 0;\n'
    );

    commandPolicyEngine.setMode('workspace-write');
  });

  afterEach(() => {
    try {
      fs.rmSync(tempWorkspaceDir, { recursive: true, force: true });
    } catch {}
  });

  it('feeds verification failures back to model and succeeds when fixed', async () => {
    const sm = new SessionManager(dbPath);
    const history = new SessionHistory(sm);
    const eventBus = new LoggingEventBus();

    const tools = [
      new AdaptedLoopTool(writeFileTool, tempWorkspaceDir),
      new AdaptedLoopTool(editFileTool, tempWorkspaceDir),
    ];

    // Scripted flow:
    // Turn 1: model writes bad code
    // Turn 2: model says "Done."
    // Verification runs -> fails!
    // Turn 3: model sees failure and writes correct code
    // Turn 4: model says "Fixed."
    // Verification runs -> passes!
    const model = new ScriptedModel([
      {
        text: 'I will write the implementation.',
        toolCalls: [
          {
            id: 'call-1',
            name: 'write_file',
            args: {
              path: 'src/index.ts',
              content: 'export const answer = -1;\n',
              overwrite: true,
            },
          },
        ],
      },
      {
        text: 'Initial implementation complete.',
      },
      {
        text: 'I see the verification failure. Fixing the answer to 42.',
        toolCalls: [
          {
            id: 'call-2',
            name: 'write_file',
            args: {
              path: 'src/index.ts',
              content: 'export const answer = 42;\n',
              overwrite: true,
            },
          },
        ],
      },
      {
        text: 'All fixes applied.',
      },
    ]);

    const loop = new AgentLoop({
      model,
      tools,
      history,
      eventBus,
      workspaceRoot: tempWorkspaceDir,
      requestApproval: async () => ({ approved: true }),
      options: {
        maxTurns: 10,
        maxVerificationFixAttempts: 3,
        verificationExecutor: async (_cmd, cwd) => {
          const content = fs.readFileSync(path.join(cwd, 'src', 'index.ts'), 'utf8');
          if (content.includes('answer = 42')) {
            return { exitCode: 0, stdout: 'PASS src/index.test.ts', stderr: '' };
          }
          return {
            exitCode: 1,
            stdout: '',
            stderr: 'FAIL: Expected answer to be 42 but received -1',
          };
        },
      },
    });

    const summary = await loop.run({
      sessionId: 'session-feedback-1',
      userInput: 'Please set answer to 42 in src/index.ts',
      workspaceRoot: tempWorkspaceDir,
    });

    // Assert 1: failure output reached model in turn 3
    expect(model.requests.length).toBeGreaterThanOrEqual(3);
    const turn3Request = model.requests[2];
    const failureMsg = turn3Request.messages.find((m) =>
      m.content?.includes('Verification failed:')
    );
    expect(failureMsg).toBeDefined();
    expect(failureMsg?.content).toContain('Expected answer to be 42 but received -1');

    // Assert 2: final verdict is verified
    expect(summary.success).toBe(true);
    expect(summary.verification).toBeDefined();
    expect(summary.verification?.verdict).toBe('verified');

    // Assert 3: attempt count recorded
    expect(summary.verificationAttempts).toBe(1);

    // Verify disk content
    const finalContent = fs.readFileSync(
      path.join(tempWorkspaceDir, 'src', 'index.ts'),
      'utf8'
    );
    expect(finalContent).toContain('answer = 42');
  });

  it('returns success:false when max verification fix attempts are exceeded', async () => {
    const sm = new SessionManager(dbPath);
    const history = new SessionHistory(sm);
    const eventBus = new LoggingEventBus();

    const tools = [
      new AdaptedLoopTool(writeFileTool, tempWorkspaceDir),
    ];

    // Model continually fails
    const model = new ScriptedModel([
      {
        text: 'Turn 1 edit',
        toolCalls: [
          {
            id: 'c1',
            name: 'write_file',
            args: { path: 'src/index.ts', content: 'export const x = 1;', overwrite: true },
          },
        ],
      },
      { text: 'Final 1' },
      { text: 'Final 2' },
      { text: 'Final 3' },
    ]);

    const loop = new AgentLoop({
      model,
      tools,
      history,
      eventBus,
      workspaceRoot: tempWorkspaceDir,
      requestApproval: async () => ({ approved: true }),
      options: {
        maxTurns: 10,
        maxVerificationFixAttempts: 2,
        verificationExecutor: async () => ({
          exitCode: 1,
          stdout: '',
          stderr: 'Persistent compilation error TS9999',
        }),
      },
    });

    const summary = await loop.run({
      sessionId: 'session-feedback-max-attempts',
      userInput: 'Fix bug',
      workspaceRoot: tempWorkspaceDir,
    });

    expect(summary.success).toBe(false);
    expect(summary.verification?.verdict).toBe('failed');
    expect(summary.verificationAttempts).toBe(2);
    expect(summary.errors.some((e) => e.includes('Verification failed after 2 fix attempts'))).toBe(true);
  });

  it('marks unverified when files were changed but no checks ran', async () => {
    // Empty scripts in package.json
    fs.writeFileSync(
      path.join(tempWorkspaceDir, 'package.json'),
      JSON.stringify({ name: 'no-scripts' })
    );

    const sm = new SessionManager(dbPath);
    const history = new SessionHistory(sm);
    const eventBus = new LoggingEventBus();

    const tools = [
      new AdaptedLoopTool(writeFileTool, tempWorkspaceDir),
    ];

    const model = new ScriptedModel([
      {
        text: 'Modifying file',
        toolCalls: [
          {
            id: 'c1',
            name: 'write_file',
            args: { path: 'src/index.ts', content: 'export const y = 2;', overwrite: true },
          },
        ],
      },
      { text: 'Done without verification scripts.' },
    ]);

    const loop = new AgentLoop({
      model,
      tools,
      history,
      eventBus,
      workspaceRoot: tempWorkspaceDir,
      requestApproval: async () => ({ approved: true }),
    });

    const summary = await loop.run({
      sessionId: 'session-unverified',
      userInput: 'Change code',
      workspaceRoot: tempWorkspaceDir,
    });

    expect(summary.success).toBe(true);
    expect(summary.verification?.verdict).toBe('unverified');
  });
});
