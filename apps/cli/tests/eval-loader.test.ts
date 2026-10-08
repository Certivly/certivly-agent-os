import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { EvalLoader } from '../src/eval/EvalLoader';

describe('Eval Task Loader (Action 2.15)', () => {
  let tempTasksRoot: string;

  beforeEach(() => {
    tempTasksRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-eval-tasks-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempTasksRoot, { recursive: true, force: true });
    } catch {}
  });

  function createValidTask(taskId: string): string {
    const taskDir = path.join(tempTasksRoot, taskId);
    fs.mkdirSync(path.join(taskDir, 'repo', 'src'), { recursive: true });

    fs.writeFileSync(
      path.join(taskDir, 'prompt.md'),
      '# Fix the bug in index.ts\nMake it return true.\n'
    );

    fs.writeFileSync(
      path.join(taskDir, 'verify.ts'),
      'import { expect } from "bun:test";\nconsole.log("Verified");\n'
    );

    fs.writeFileSync(
      path.join(taskDir, 'meta.json'),
      JSON.stringify(
        {
          id: taskId,
          difficulty: 'easy',
          tags: ['bugfix', 'typescript'],
          language: 'typescript',
        },
        null,
        2
      )
    );

    fs.writeFileSync(
      path.join(taskDir, 'repo', 'src', 'index.ts'),
      'export function isReady() { return false; }\n'
    );

    return taskDir;
  }

  it('1. valid task loads', async () => {
    createValidTask('task-valid-1');
    const task = await EvalLoader.loadTask('task-valid-1', tempTasksRoot);

    expect(task.id).toBe('task-valid-1');
    expect(task.promptContent).toContain('Fix the bug in index.ts');
    expect(task.verifierType).toBe('ts');
    expect(task.meta.id).toBe('task-valid-1');
    expect(task.meta.difficulty).toBe('easy');
    expect(task.meta.tags).toContain('bugfix');
    expect(fs.existsSync(task.repoDir)).toBe(true);

    const list = await EvalLoader.listTasks(tempTasksRoot);
    expect(list).toEqual(['task-valid-1']);
  });

  it('2. missing prompt fails', async () => {
    const taskDir = createValidTask('task-no-prompt');
    fs.unlinkSync(path.join(taskDir, 'prompt.md'));

    await expect(
      EvalLoader.loadTask('task-no-prompt', tempTasksRoot)
    ).rejects.toThrow(/missing prompt\.md/i);
  });

  it('3. missing verifier fails', async () => {
    const taskDir = createValidTask('task-no-verifier');
    fs.unlinkSync(path.join(taskDir, 'verify.ts'));

    await expect(
      EvalLoader.loadTask('task-no-verifier', tempTasksRoot)
    ).rejects.toThrow(/missing verifier/i);
  });

  it('4. missing repo fails', async () => {
    const taskDir = createValidTask('task-no-repo');
    fs.rmSync(path.join(taskDir, 'repo'), { recursive: true, force: true });

    await expect(
      EvalLoader.loadTask('task-no-repo', tempTasksRoot)
    ).rejects.toThrow(/missing repo directory/i);
  });

  it('5. invalid meta fails', async () => {
    const taskDir = createValidTask('task-bad-meta');
    // Corrupt JSON
    fs.writeFileSync(path.join(taskDir, 'meta.json'), '{ not valid json');

    await expect(
      EvalLoader.loadTask('task-bad-meta', tempTasksRoot)
    ).rejects.toThrow(/invalid meta\.json/i);

    // Missing id in meta
    fs.writeFileSync(path.join(taskDir, 'meta.json'), JSON.stringify({ difficulty: 'easy' }));

    await expect(
      EvalLoader.loadTask('task-bad-meta', tempTasksRoot)
    ).rejects.toThrow(/invalid meta\.json/i);
  });

  it('6. verifier path identified as hidden and excluded from workspace', async () => {
    expect(EvalLoader.isVerifierFile('verify.ts')).toBe(true);
    expect(EvalLoader.isVerifierFile('verify.sh')).toBe(true);
    expect(EvalLoader.isVerifierFile('verify.js')).toBe(true);
    expect(EvalLoader.isVerifierFile('VERIFY.TS')).toBe(true);
    expect(EvalLoader.isVerifierFile('src/index.ts')).toBe(false);
    expect(EvalLoader.isVerifierFile('test.ts')).toBe(false);

    const taskDir = createValidTask('task-workspace-check');
    // If someone accidentally leaves a verify.ts in repo:
    fs.writeFileSync(path.join(taskDir, 'repo', 'verify.ts'), 'console.log("bad leak");');

    const task = await EvalLoader.loadTask('task-workspace-check', tempTasksRoot);
    const agentWorkspace = path.join(tempTasksRoot, 'agent-work');
    await EvalLoader.prepareWorkspace(task, agentWorkspace);

    // Verify regular files copied
    expect(fs.existsSync(path.join(agentWorkspace, 'src', 'index.ts'))).toBe(true);
    // Verifier file must NOT be present in agent workspace
    expect(fs.existsSync(path.join(agentWorkspace, 'verify.ts'))).toBe(false);

    // Verifier is copied only after agent run
    const copiedVerifierPath = await EvalLoader.copyVerifier(task, agentWorkspace);
    expect(fs.existsSync(copiedVerifierPath)).toBe(true);
    expect(fs.readFileSync(copiedVerifierPath, 'utf8')).toContain('Verified');
  });
});
