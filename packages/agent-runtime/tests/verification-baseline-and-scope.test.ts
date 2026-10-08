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
import {
  Verification,
  ProjectVerifier,
  runVerification,
} from '../src/verification/Verification';

describe('Action 6-12: Verification Baseline, Scope, and Unverified Policy', () => {
  let tempDir: string;
  let dbPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-verify-baseline-'));
    dbPath = path.join(tempDir, 'sessions.db');
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  const createWriteTool = (wsDir: string): LoopTool => ({
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
  });

  it('1. unverified policy: missing scripts does NOT fail the run', async () => {
    // Repo with NO verification scripts in package.json
    fs.writeFileSync(
      path.join(tempDir, 'package.json'),
      JSON.stringify({ name: 'no-scripts-repo' }, null, 2)
    );

    const sm = new SessionManager(dbPath);
    const history = new SessionHistory(sm);
    const eventBus = new LoggingEventBus();
    const sessionId = 'session-unverified-pass';
    sm.createSession(sessionId);

    const model = new ScriptedModel([
      {
        text: 'Editing file',
        toolCalls: [
          {
            id: 'tc-1',
            name: 'write_file',
            args: { path: 'notes.txt', content: 'Hello world' },
          },
        ],
      },
      {
        text: 'Done editing notes',
      },
    ]);

    const loop = new AgentLoop({
      model,
      tools: [createWriteTool(tempDir)],
      history,
      eventBus,
      workspaceRoot: tempDir,
      options: {
        maxTurns: 5,
        maxWallTimeMs: 10000,
        maxApproxTokens: 4000,
      },
    });

    const summary = await loop.run({
      sessionId,
      userInput: 'Add notes',
      workspaceRoot: tempDir,
    });

    // Run must succeed even though verification is 'unverified'
    expect(summary.success).toBe(true);
    expect(summary.verification?.verdict).toBe('unverified');
    expect(summary.errors).toHaveLength(0);
  });

  it('2. baseline comparison: pre-existing failing test does not fail post-edit run', async () => {
    const pkgJson = {
      name: 'pre-existing-fail-repo',
      scripts: {
        test: 'bun test',
        lint: 'eslint .',
      },
    };
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(pkgJson));

    // Baseline executor where 'test' fails initially, but 'lint' passes
    const baselineResult = await Verification.run({
      workspaceRoot: tempDir,
      executor: async (cmd) => {
        if (cmd.includes('test')) {
          return { exitCode: 1, stdout: '', stderr: 'OLD_FAIL: pre-existing bug' };
        }
        return { exitCode: 0, stdout: 'lint ok', stderr: '' };
      },
    });

    expect(baselineResult.verdict).toBe('failed');
    expect(baselineResult.checks.find((c) => c.name === 'test')?.status).toBe('failed');

    // Post-edit verification with the baseline passed
    const postEditResult = await Verification.run({
      workspaceRoot: tempDir,
      baseline: baselineResult,
      executor: async (cmd) => {
        if (cmd.includes('test')) {
          return { exitCode: 1, stdout: '', stderr: 'OLD_FAIL: pre-existing bug' };
        }
        return { exitCode: 0, stdout: 'lint ok', stderr: '' };
      },
    });

    // The failure in 'test' was pre-existing, so post-edit verdict should not be 'failed'
    const testCheck = postEditResult.checks.find((c) => c.name === 'test');
    expect(testCheck?.preExisting).toBe(true);
    expect(postEditResult.verdict).toBe('verified');
  });

  it('3. regression detection: new failure introduced by edits yields failed', async () => {
    const pkgJson = {
      name: 'regression-repo',
      scripts: {
        test: 'bun test',
      },
    };
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(pkgJson));

    // Baseline where test passes
    const baselineResult = await Verification.run({
      workspaceRoot: tempDir,
      executor: async () => ({ exitCode: 0, stdout: 'all tests passed', stderr: '' }),
    });
    expect(baselineResult.verdict).toBe('verified');

    // Post-edit verification introduces new failure
    const postEditResult = await Verification.run({
      workspaceRoot: tempDir,
      baseline: baselineResult,
      executor: async () => ({ exitCode: 1, stdout: '', stderr: 'NEW_FAIL: agent broke test' }),
    });

    const testCheck = postEditResult.checks.find((c) => c.name === 'test');
    expect(testCheck?.preExisting).toBeFalsy();
    expect(postEditResult.verdict).toBe('failed');
  });

  it('4. check selection: executes only specified checks', async () => {
    const pkgJson = {
      name: 'selection-repo',
      scripts: {
        typecheck: 'tsc --noEmit',
        test: 'bun test',
        lint: 'eslint .',
        build: 'bun build',
      },
    };
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(pkgJson));

    const executedCommands: string[] = [];
    const result = await Verification.run({
      workspaceRoot: tempDir,
      checks: ['typecheck', 'build'],
      executor: async (cmd) => {
        executedCommands.push(cmd);
        return { exitCode: 0, stdout: 'ok', stderr: '' };
      },
    });

    expect(result.verdict).toBe('verified');
    expect(result.checks).toHaveLength(2);
    expect(result.checks.map((c) => c.name)).toEqual(['typecheck', 'build']);
    expect(executedCommands.every((c) => c.includes('typecheck') || c.includes('build'))).toBe(true);
  });
});
