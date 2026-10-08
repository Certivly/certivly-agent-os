import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { EvalLoader } from '../src/eval/EvalLoader';
import { EvalRunner } from '../src/eval/EvalRunner';
import { EvalReporter } from '../src/eval/EvalReporter';
import type { EvalTask } from '../src/eval/EvalTypes';
import type { Model, GenerationRequest, GenerationResponse } from '@agent-os/providers';

describe('Eval Runner (Action 2.16)', () => {
  let tempTasksRoot: string;
  let tempOutputDir: string;

  beforeEach(() => {
    tempTasksRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-eval-tasks-test-'));
    tempOutputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-eval-out-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempTasksRoot, { recursive: true, force: true });
      fs.rmSync(tempOutputDir, { recursive: true, force: true });
    } catch {}
  });

  function createTestTask(id: string, verifierExitZero: boolean = true): string {
    const dir = path.join(tempTasksRoot, id);
    fs.mkdirSync(path.join(dir, 'repo', 'src'), { recursive: true });

    fs.writeFileSync(path.join(dir, 'prompt.md'), `# Task ${id}\nPlease fix index.ts.`);
    fs.writeFileSync(
      path.join(dir, 'repo', 'src', 'index.ts'),
      'export const status = "initial";\n'
    );
    fs.writeFileSync(
      path.join(dir, 'verify.ts'),
      verifierExitZero
        ? 'console.log("PASS"); process.exit(0);\n'
        : 'console.error("FAIL"); process.exit(1);\n'
    );
    fs.writeFileSync(
      path.join(dir, 'meta.json'),
      JSON.stringify({ id, difficulty: 'easy' }, null, 2)
    );
    return dir;
  }

  it('1. pass when verifier exits 0', async () => {
    createTestTask('task-pass', true);
    const task = await EvalLoader.loadTask('task-pass', tempTasksRoot);

    const result = await EvalRunner.runTask(task, {
      modelName: 'fake:scripted',
    });

    expect(result.taskId).toBe('task-pass');
    expect(result.passed).toBe(true);
    expect(result.verifierOutput).toContain('PASS');
  });

  it('2. fail when verifier exits non-zero', async () => {
    createTestTask('task-fail', false);
    const task = await EvalLoader.loadTask('task-fail', tempTasksRoot);

    const result = await EvalRunner.runTask(task, {
      modelName: 'fake:scripted',
    });

    expect(result.taskId).toBe('task-fail');
    expect(result.passed).toBe(false);
    expect(result.verifierOutput).toContain('FAIL');
  });

  it('3. verifier absent during agent run', async () => {
    createTestTask('task-verifier-absent', true);
    const task = await EvalLoader.loadTask('task-verifier-absent', tempTasksRoot);

    let verifierFoundDuringRun: boolean = true;

    // Custom model that checks if verify.ts is in cwd during agent run
    const checkingModel: Model = {
      id: 'checking-model',
      async generate(request: GenerationRequest): Promise<GenerationResponse> {
        // Inspect current working directory of agent
        verifierFoundDuringRun = fs.existsSync('verify.ts');
        return {
          text: 'Finished inspecting.',
        };
      },
    };

    const result = await EvalRunner.runTask(task, {
      model: checkingModel,
    });

    expect(result.passed).toBe(true);
    expect(verifierFoundDuringRun).toBe(false);
  });

  it('4. JSONL result written and 5. Markdown table written', async () => {
    createTestTask('task-a', true);
    createTestTask('task-b', true);

    const tasks = await EvalLoader.loadAllTasks(tempTasksRoot);
    const jsonlPath = path.join(tempOutputDir, 'results.jsonl');
    const mdPath = path.join(tempOutputDir, 'report.md');

    const results = await EvalRunner.runAll(tasks, {
      modelName: 'fake:scripted',
      outputJsonl: jsonlPath,
      outputMarkdown: mdPath,
    });

    expect(results.length).toBe(2);
    expect(results.every((r) => r.passed)).toBe(true);

    // 4. Check JSONL
    expect(fs.existsSync(jsonlPath)).toBe(true);
    const loadedFromDisk = EvalReporter.readJsonl(jsonlPath);
    expect(loadedFromDisk.length).toBe(2);
    expect(loadedFromDisk[0].taskId).toBe('task-a');
    expect(loadedFromDisk[0].passed).toBe(true);
    expect(loadedFromDisk[1].taskId).toBe('task-b');

    // 5. Check Markdown table
    expect(fs.existsSync(mdPath)).toBe(true);
    const mdContent = fs.readFileSync(mdPath, 'utf8');
    expect(mdContent).toContain('### Evaluation Summary');
    expect(mdContent).toContain('| task-a | PASS |');
    expect(mdContent).toContain('| task-b | PASS |');
  });

  it('6. initial fixture tasks load and solve with scripted eval runner', async () => {
    // Tests the 5 real fixture tasks in evals/tasks
    const fixtureRoot = path.resolve(__dirname, '../../../evals/tasks');
    const tasks = await EvalLoader.loadAllTasks(fixtureRoot);
    expect(tasks.length).toBeGreaterThanOrEqual(5);

    const taskIds = tasks.map((t) => t.id);
    expect(taskIds).toContain('ts-off-by-one');
    expect(taskIds).toContain('ts-null-handling');
    expect(taskIds).toContain('ts-wrong-comparison');
    expect(taskIds).toContain('ts-add-function');
    expect(taskIds).toContain('py-wrong-regex');

    const results = await EvalRunner.runAll(tasks, {
      modelName: 'fake:scripted',
    });

    for (const r of results) {
      expect(r.passed).toBe(true);
    }
  });
});
