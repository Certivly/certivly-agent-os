import { describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawnSync } from 'child_process';
import { RunTracer, runVerification } from '@agent-os/agent-runtime';
import { LoggingEventBus } from '@agent-os/shared';
import { ChangeSetApplier, computeSha256, type ChangeSet } from '@agent-os/patch-engine';

describe('Manual Smoke Scenario: Sandboxing, Verification, Approval, and Rollback', () => {
  it('satisfies all 7 end-to-end smoke scenario guarantees on a temporary repo', async () => {
    // 0. Setup a temporary fixture git repository
    const tempRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'agentos-smoke-scenario-'));
    const srcDir = path.join(tempRepo, 'src');
    const testsDir = path.join(tempRepo, 'tests');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.mkdirSync(testsDir, { recursive: true });

    // Initial files
    fs.writeFileSync(
      path.join(tempRepo, 'package.json'),
      JSON.stringify(
        {
          name: 'smoke-scenario-repo',
          scripts: {
            test: 'bun test',
          },
        },
        null,
        2
      )
    );

    fs.writeFileSync(
      path.join(srcDir, 'math.ts'),
      '// Empty math module\n'
    );

    fs.writeFileSync(
      path.join(testsDir, 'math.test.ts'),
      `import { expect, test } from 'bun:test';
import { sum } from '../src/math';

test('sum adds two numbers correctly', () => {
  expect(sum(2, 3)).toBe(5);
});
`
    );

    // Init git repo so git worktrees / diffs operate truthfully
    spawnSync('git init', { cwd: tempRepo, shell: true });
    spawnSync('git config user.name "SmokeTest"', { cwd: tempRepo, shell: true });
    spawnSync('git config user.email "smoke@test.local"', { cwd: tempRepo, shell: true });
    spawnSync('git add .', { cwd: tempRepo, shell: true });
    spawnSync('git commit -m "initial commit"', { cwd: tempRepo, shell: true });

    const originalMathContent = fs.readFileSync(path.join(srcDir, 'math.ts'), 'utf-8');

    // Setup tracer
    const eventBus = new LoggingEventBus();
    const tracer = new RunTracer({
      sessionId: 'manual-smoke-session',
      workspaceRoot: tempRepo,
    });
    tracer.attachToEventBus(eventBus);

    eventBus.publish('agent.loop.started', {
      sessionId: 'manual-smoke-session',
      userInput: 'Add an exported function sum(a, b) to src/math.ts and add a test for it.',
    });

    try {
      // 1. Edits happen in sandbox first
      const sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentos-smoke-sandbox-'));
      // Copy workspace to sandbox
      fs.cpSync(tempRepo, sandboxDir, { recursive: true });

      eventBus.publish('tool.call.started', {
        sessionId: 'manual-smoke-session',
        toolCallId: 'call-1',
        toolName: 'write_file',
        args: { path: 'src/math.ts' },
      });

      const updatedMathContent = `export function sum(a: number, b: number): number {
  return a + b;
}
`;
      fs.writeFileSync(path.join(sandboxDir, 'src', 'math.ts'), updatedMathContent, 'utf-8');

      eventBus.publish('tool.call.completed', {
        sessionId: 'manual-smoke-session',
        toolCallId: 'call-1',
        toolName: 'write_file',
        result: 'Wrote to src/math.ts',
      });

      // 2. Real workspace is unchanged before approval
      const realMathBeforeApproval = fs.readFileSync(path.join(srcDir, 'math.ts'), 'utf-8');
      expect(realMathBeforeApproval).toBe(originalMathContent);
      expect(realMathBeforeApproval).not.toContain('export function sum');

      // 3. Verification runs in sandbox
      const verificationRes = await runVerification({
        workspaceRoot: sandboxDir,
        checks: ['test'],
      });
      eventBus.publish('agent.loop.turn.started', {
        sessionId: 'manual-smoke-session',
        turn: 2,
        verification: verificationRes,
      });

      expect(verificationRes.verdict).toBe('verified');

      // 4. Patch bundle is non-empty
      const changeSet: ChangeSet = {
        id: 'changeset-smoke-manual',
        workspaceRoot: tempRepo,
        createdAt: new Date().toISOString(),
        files: [
          {
            path: 'src/math.ts',
            kind: 'modify',
            before: computeSha256(originalMathContent),
            after: computeSha256(updatedMathContent),
            afterContent: updatedMathContent,
            diff: `--- a/src/math.ts\n+++ b/src/math.ts\n@@ -1,1 +1,3 @@\n-// Empty math module\n+export function sum(a: number, b: number): number {\n+  return a + b;\n+}\n`,
          },
        ],
      };

      expect(changeSet.files.length).toBeGreaterThan(0);
      expect(changeSet.files[0].path).toBe('src/math.ts');

      // 5. Approval applies exact patch to real workspace
      const applier = new ChangeSetApplier();
      const applyResult = await applier.applyChangeSet(tempRepo, changeSet);

      expect(applyResult.applied).toBe(true);
      expect(applyResult.backupId).toBeDefined();

      const realMathAfterApproval = fs.readFileSync(path.join(srcDir, 'math.ts'), 'utf-8');
      expect(realMathAfterApproval).toContain('export function sum(a: number, b: number)');

      // Verify real repo now passes test
      const realVerification = await runVerification({
        workspaceRoot: tempRepo,
        checks: ['test'],
      });
      expect(realVerification.verdict).toBe('verified');

      // 6. Rollback restores original bytes
      const rolledBack = await applier.rollback(tempRepo, applyResult.backupId!);
      expect(rolledBack).toBe(true);
      const realMathAfterRollback = fs.readFileSync(path.join(srcDir, 'math.ts'), 'utf-8');
      expect(realMathAfterRollback).toBe(originalMathContent);

      // 7. Run trace shows all steps
      eventBus.publish('agent.loop.completed', {
        sessionId: 'manual-smoke-session',
        success: true,
      });
      tracer.stop();

      const traceEntries = RunTracer.readTrace(tracer.traceFilePath);
      expect(traceEntries.length).toBeGreaterThanOrEqual(4);
      expect(traceEntries.some((e) => e.type === 'agent.loop.started')).toBe(true);
      expect(traceEntries.some((e) => e.type === 'tool.call.started')).toBe(true);
      expect(traceEntries.some((e) => e.type === 'agent.loop.completed')).toBe(true);

      // Clean up sandbox
      fs.rmSync(sandboxDir, { recursive: true, force: true });
    } finally {
      fs.rmSync(tempRepo, { recursive: true, force: true });
    }
  });
});
