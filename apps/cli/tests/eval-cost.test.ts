import { describe, it, expect } from 'bun:test';
import * as path from 'path';
import { EvalReporter } from '../src/eval/EvalReporter';
import { EvalLoader } from '../src/eval/EvalLoader';
import { EvalRunner } from '../src/eval/EvalRunner';
import { ModelPricing } from '@agent-os/providers';
import type { EvalResult } from '../src/eval/EvalTypes';

describe('Action 3.03: Eval Usage and Cost', () => {
  it('1. eval summary includes total and average cost when costs are known', () => {
    const results: EvalResult[] = [
      {
        taskId: 'task-1',
        passed: true,
        turns: 2,
        toolCalls: { edit_file: 1 },
        tokens: { input: 1000, output: 500 },
        wallTimeMs: 150,
        filesChanged: ['a.ts'],
        errors: [],
        estimatedCostUsd: 0.0075,
      },
      {
        taskId: 'task-2',
        passed: true,
        turns: 1,
        toolCalls: { edit_file: 1 },
        tokens: { input: 2000, output: 1000 },
        wallTimeMs: 200,
        filesChanged: ['b.ts'],
        errors: [],
        estimatedCostUsd: 0.015,
      },
    ];

    const markdown = EvalReporter.toMarkdownTable(results);
    expect(markdown).toContain('Total Cost');
    expect(markdown).toContain('Average Cost');
    expect(markdown).toContain('$0.022500');
    expect(markdown).toContain('$0.011250');
  });

  it('2. task evaluation assigns estimatedCostUsd for fake:scripted', async () => {
    const tasksRoot = EvalLoader.getDefaultTasksRoot();
    const task = await EvalLoader.loadTask('ts-off-by-one', tasksRoot);

    const result = await EvalRunner.runTask(task, {
      modelName: 'fake:scripted',
    });

    expect(result.estimatedCostUsd).toBe(0);
    expect(result.modelName).toBe('fake:scripted');
    expect(result.providerName).toBe('fake');
  });

  it('3. unknown price gives null cost and table renders null gracefully', () => {
    const pricing = ModelPricing.loadFromFile(
      path.resolve(process.cwd(), 'evals', 'model-prices.json')
    );
    const cost = pricing.calculateCost('mystery-model-99', 500, 200);
    expect(cost).toBeNull();

    const results: EvalResult[] = [
      {
        taskId: 'task-null-cost',
        passed: true,
        turns: 1,
        toolCalls: {},
        tokens: { input: 500, output: 200 },
        wallTimeMs: 100,
        filesChanged: [],
        errors: [],
        estimatedCostUsd: null,
      },
    ];

    const markdown = EvalReporter.toMarkdownTable(results);
    expect(markdown).toContain('null');
    expect(markdown).not.toContain('NaN');
  });
});
