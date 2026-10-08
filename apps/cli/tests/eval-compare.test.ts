import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { EvalCompare } from '../src/eval/EvalCompare';
import { EvalReporter } from '../src/eval/EvalReporter';
import type { EvalResult } from '../src/eval/EvalTypes';

describe('Action 3.01: Eval Baseline And Regression Policy', () => {
  const tempDir = path.join(process.cwd(), 'temp-test-compare-' + Date.now());
  const baseJsonl = path.join(tempDir, 'baseline.jsonl');
  const candJsonl = path.join(tempDir, 'candidate.jsonl');

  const sampleBase: EvalResult[] = [
    {
      taskId: 'task-1',
      passed: true,
      turns: 2,
      toolCalls: { edit_file: 1 },
      tokens: { input: 100, output: 20 },
      wallTimeMs: 150,
      filesChanged: ['a.ts'],
      errors: [],
    },
    {
      taskId: 'task-2',
      passed: false,
      turns: 3,
      toolCalls: { edit_file: 2 },
      tokens: { input: 200, output: 40 },
      wallTimeMs: 250,
      filesChanged: ['b.ts'],
      errors: ['Failed to verify'],
    },
    {
      taskId: 'ts-off-by-one',
      passed: true,
      turns: 2,
      toolCalls: { edit_file: 1 },
      tokens: { input: 120, output: 30 },
      wallTimeMs: 100,
      filesChanged: ['c.ts'],
      errors: [],
    },
  ];

  beforeEach(() => {
    fs.mkdirSync(tempDir, { recursive: true });
    EvalReporter.writeJsonl(baseJsonl, sampleBase);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('1. identical candidate passes', () => {
    EvalReporter.writeJsonl(candJsonl, sampleBase);
    const comparison = EvalCompare.compareFiles(baseJsonl, candJsonl);

    expect(comparison.isRegression).toBe(false);
    expect(comparison.passRateDelta).toBe(0);
    expect(comparison.perTaskRegressions.length).toBe(0);
    expect(comparison.perTaskImprovements.length).toBe(0);
    expect(comparison.missingTasks.length).toBe(0);
    expect(comparison.newTasks.length).toBe(0);
  });

  it('2. one new failure is reported as regression', () => {
    const candidate: EvalResult[] = [
      { ...sampleBase[0], passed: false }, // task-1 regressed
      sampleBase[1],
      sampleBase[2],
    ];
    EvalReporter.writeJsonl(candJsonl, candidate);
    const comparison = EvalCompare.compareFiles(baseJsonl, candJsonl);

    expect(comparison.isRegression).toBe(true);
    expect(comparison.perTaskRegressions).toContain('task-1');
    expect(comparison.passRateDelta).toBeLessThan(0);
    expect(comparison.reasons.some((r) => r.includes('task-1'))).toBe(true);
  });

  it('3. one improvement is reported', () => {
    const candidate: EvalResult[] = [
      sampleBase[0],
      { ...sampleBase[1], passed: true }, // task-2 improved!
      sampleBase[2],
    ];
    EvalReporter.writeJsonl(candJsonl, candidate);
    const comparison = EvalCompare.compareFiles(baseJsonl, candJsonl);

    expect(comparison.isRegression).toBe(false);
    expect(comparison.perTaskImprovements).toContain('task-2');
    expect(comparison.passRateDelta).toBeGreaterThan(0);
  });

  it('4. missing task is a regression', () => {
    const candidate: EvalResult[] = [
      sampleBase[0],
      sampleBase[1],
      // task 'ts-off-by-one' is missing!
    ];
    EvalReporter.writeJsonl(candJsonl, candidate);
    const comparison = EvalCompare.compareFiles(baseJsonl, candJsonl);

    expect(comparison.isRegression).toBe(true);
    expect(comparison.missingTasks).toContain('ts-off-by-one');
    expect(comparison.reasons.some((r) => r.includes('ts-off-by-one'))).toBe(true);
  });

  it('5. extra task is informational', () => {
    const candidate: EvalResult[] = [
      ...sampleBase,
      {
        taskId: 'new-extra-task',
        passed: true,
        turns: 1,
        toolCalls: { edit_file: 1 },
        tokens: { input: 50, output: 10 },
        wallTimeMs: 50,
        filesChanged: ['extra.ts'],
        errors: [],
      },
    ];
    EvalReporter.writeJsonl(candJsonl, candidate);
    const comparison = EvalCompare.compareFiles(baseJsonl, candJsonl);

    expect(comparison.isRegression).toBe(false);
    expect(comparison.newTasks).toContain('new-extra-task');
  });

  it('6. --allow-regression changes exit behavior but still reports the regression', () => {
    const candidate: EvalResult[] = [
      { ...sampleBase[0], passed: false }, // regressed
      sampleBase[1],
      sampleBase[2],
    ];
    EvalReporter.writeJsonl(candJsonl, candidate);

    const comparison = EvalCompare.compareFiles(baseJsonl, candJsonl, {
      allowRegression: true,
    });

    // Comparison still correctly identifies the regression
    expect(comparison.isRegression).toBe(true);
    expect(comparison.perTaskRegressions).toContain('task-1');

    // Report format indicates it was allowed
    const report = EvalCompare.formatReport(comparison, { allowRegression: true });
    expect(report).toContain('REGRESSION DETECTED (allowed via --allow-regression)');

    // Without flag, report indicates failure
    const strictReport = EvalCompare.formatReport(comparison, { allowRegression: false });
    expect(strictReport).toContain('FAILED DUE TO REGRESSION');
  });
});
