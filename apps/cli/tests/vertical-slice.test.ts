import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawnSync } from 'child_process';
import {
  AgentLoop,
  SessionHistory,
  AdaptedLoopTool,
} from '@agent-os/agent-runtime';
import { SessionManager } from '@agent-os/sessions';
import { LoggingEventBus } from '@agent-os/shared';
import {
  readFileTool,
  editFileTool,
  writeFileTool,
  runCommandTool,
  listDirTool,
  grepTool,
  repoMapTool,
} from '@agent-os/tools';
import { FakeScriptedModel } from '@agent-os/providers';
import { ChangeSetApplier, ChangeSetStore } from '@agent-os/patch-engine';
import { handleApprove } from '../src/bridge/ApprovalHandler';

describe('vertical slice: add-function', () => {
  let tmpDir: string;
  let sandboxDir: string;
  let dbPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-test-ws-'));
    sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-test-sb-'));
    dbPath = path.join(os.tmpdir(), `vs-db-${Date.now()}-${Math.random()}.sqlite`);

    // Copy evals/tasks/vertical-slice-add-function/workspace to tmpDir and sandboxDir
    const fixtureDir = path.resolve(__dirname, '../../..', 'evals/tasks/vertical-slice-add-function/workspace');
    fs.cpSync(fixtureDir, tmpDir, { recursive: true });
    fs.cpSync(fixtureDir, sandboxDir, { recursive: true });
  });

  afterEach(() => {
    try {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
      if (fs.existsSync(sandboxDir)) {
        fs.rmSync(sandboxDir, { recursive: true, force: true });
      }
      if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
      }
    } catch {}
  });

  it('adds multiply function and test, produces non-empty changeset, applies cleanly', async () => {
    const sm = new SessionManager(dbPath);
    const history = new SessionHistory(sm);
    const eventBus = new LoggingEventBus();
    const sessionId = 'session-vertical-slice';

    const model = new FakeScriptedModel({ taskId: 'vertical-slice-add-function' });

    const tools = [
      new AdaptedLoopTool(readFileTool, { workspaceRoot: sandboxDir }),
      new AdaptedLoopTool(editFileTool, { workspaceRoot: sandboxDir }),
      new AdaptedLoopTool(writeFileTool, { workspaceRoot: sandboxDir }),
      new AdaptedLoopTool(runCommandTool, { workspaceRoot: sandboxDir }),
      new AdaptedLoopTool(listDirTool, { workspaceRoot: sandboxDir }),
      new AdaptedLoopTool(grepTool, { workspaceRoot: sandboxDir }),
      new AdaptedLoopTool(repoMapTool, { workspaceRoot: sandboxDir }),
    ];

    const loop = new AgentLoop({
      model,
      tools,
      history,
      eventBus,
      workspaceRoot: tmpDir,
      sandboxRoot: sandboxDir,
      requestApproval: async () => ({ approved: true }),
      options: {
        maxTurns: 10,
        planningMode: 'off',
      },
    });

    const summary = await loop.run({
      sessionId,
      userInput: 'Add multiply(a, b) to src/math.ts and a test for it.',
      workspaceRoot: tmpDir,
      sandboxRoot: sandboxDir,
    });

    // 1. Assert loop completion and changeset generation
    expect(summary.success).toBe(true);
    expect(summary.hasChanges).toBe(true);
    expect(summary.changeSetId).toBeDefined();
    expect(summary.verificationPassed).toBe(true);
    expect(summary.filesChanged).toContain('src/math.ts');
    expect(summary.filesChanged).toContain('src/math.test.ts');

    // 2. Real workspace is unchanged before approval
    const preApprovalMath = fs.readFileSync(path.join(tmpDir, 'src/math.ts'), 'utf8');
    expect(preApprovalMath).not.toContain('multiply');

    // 3. Apply the changeset using handleApprove
    const store = new ChangeSetStore();
    const approveResult = await handleApprove(summary.changeSetId!, {
      eventBus,
      sessionId,
      workspaceRoot: tmpDir,
      store,
    });
    expect(approveResult.success).toBe(true);

    // 4. Verify post-apply file contents
    const postApprovalMath = fs.readFileSync(path.join(tmpDir, 'src/math.ts'), 'utf8');
    expect(postApprovalMath).toContain('export function multiply(a: number, b: number): number');

    const postApprovalTest = fs.readFileSync(path.join(tmpDir, 'src/math.test.ts'), 'utf8');
    expect(postApprovalTest).toContain('multiplies two numbers');

    // 5. Run real 'bun test' in tmpDir and assert 0 exit code
    const testResult = spawnSync('bun test', {
      cwd: tmpDir,
      shell: true,
      encoding: 'utf8',
    });
    expect(testResult.status).toBe(0);
    const combinedOutput = (testResult.stdout || '') + (testResult.stderr || '');
    expect(combinedOutput).toContain('2 pass');
  });
});
