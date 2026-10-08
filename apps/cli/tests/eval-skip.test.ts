import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { EvalRunner } from '../src/eval/EvalRunner';
import { EvalLoader } from '../src/eval/EvalLoader';
import { EvalReporter } from '../src/eval/EvalReporter';
import type { EvalResult } from '../src/eval/EvalTypes';

describe('Action 5-07: Gemini Eval Gate & Skip-If-No-Key', () => {
  const originalOpenAiKey = process.env.OPENAI_API_KEY;

  afterEach(() => {
    if (originalOpenAiKey !== undefined) {
      process.env.OPENAI_API_KEY = originalOpenAiKey;
    } else {
      delete process.env.OPENAI_API_KEY;
    }
  });

  it('1. Skipped eval returns skipped=true when required key is missing', async () => {
    delete process.env.OPENAI_API_KEY;

    const tasksRoot = EvalLoader.getDefaultTasksRoot();
    const task = await EvalLoader.loadTask('ts-off-by-one', tasksRoot);

    const result = await EvalRunner.runTask(task, {
      modelName: 'openai:gpt-4o',
    });

    expect(result.skipped).toBe(true);
    expect(result.passed).toBe(false);
    expect(result.skipReason).toContain('OPENAI_API_KEY');
  });

  it('2. fake:scripted is never skipped', async () => {
    const tasksRoot = EvalLoader.getDefaultTasksRoot();
    const task = await EvalLoader.loadTask('ts-off-by-one', tasksRoot);

    const result = await EvalRunner.runTask(task, {
      modelName: 'fake:scripted',
    });

    expect(result.skipped).toBeUndefined();
    expect(result.passed).toBe(true);
  });

  it('3. EvalReporter shows [SKIP] not [FAIL] in markdown table for skipped results', () => {
    const results: EvalResult[] = [
      {
        taskId: 'test-skipped-task',
        passed: false,
        skipped: true,
        skipReason: 'GEMINI_API_KEY not set',
        turns: 0,
        toolCalls: {},
        tokens: { input: 0, output: 0 },
        wallTimeMs: 0,
        filesChanged: [],
        errors: ['Skipped: GEMINI_API_KEY not set'],
      },
    ];

    const markdown = EvalReporter.toMarkdownTable(results);
    expect(markdown).toContain('[SKIP]');
    expect(markdown).not.toContain('FAIL');
    expect(markdown).toContain('test-skipped-task');
  });
});
