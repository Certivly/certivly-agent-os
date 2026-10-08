import { describe, it, expect } from 'bun:test';
import { BenchRunner, DEFAULT_BUDGETS, type BenchMetrics } from '../src/bench/BenchRunner';

describe('Action 3.15: Performance Budgets And Bench Command', () => {
  const sampleMetrics: BenchMetrics = {
    cliStartupMs: 420.5,
    warmRepoIndexMs: 45.2,
    oneFileIndexUpdateMs: 28.1,
    fakeSmokeEvalMs: 1200.0,
    agentLoopOverheadMs: 12.4,
  };

  it('1. bench JSON includes all metrics', async () => {
    const report = await BenchRunner.runBenchmarks(process.cwd(), undefined, sampleMetrics);
    const jsonStr = BenchRunner.formatJson(report);
    const parsed = JSON.parse(jsonStr);

    expect(parsed.metrics).toBeDefined();
    expect(parsed.metrics.cliStartupMs).toBe(420.5);
    expect(parsed.metrics.warmRepoIndexMs).toBe(45.2);
    expect(parsed.metrics.oneFileIndexUpdateMs).toBe(28.1);
    expect(parsed.metrics.fakeSmokeEvalMs).toBe(1200.0);
    expect(parsed.metrics.agentLoopOverheadMs).toBe(12.4);

    expect(parsed.budgets).toBeDefined();
    expect(parsed.budgets.cliStartupMs).toBe(DEFAULT_BUDGETS.cliStartupMs);
    expect(parsed.budgets.warmRepoIndexMs).toBe(DEFAULT_BUDGETS.warmRepoIndexMs);
    expect(parsed.budgets.oneFileIndexUpdateMs).toBe(DEFAULT_BUDGETS.oneFileIndexUpdateMs);
    expect(parsed.budgets.fakeSmokeEvalMs).toBe(DEFAULT_BUDGETS.fakeSmokeEvalMs);
    expect(parsed.budgets.agentLoopOverheadMs).toBe(DEFAULT_BUDGETS.agentLoopOverheadMs);

    expect(parsed.results).toBeDefined();
    expect(Object.keys(parsed.results).length).toBe(5);
  });

  it('2. markdown summary renders', async () => {
    const report = await BenchRunner.runBenchmarks(process.cwd(), undefined, sampleMetrics);
    const markdown = BenchRunner.formatMarkdown(report);

    expect(markdown).toContain('# AgentOS Performance Benchmark Report');
    expect(markdown).toContain('| Metric | Measured | Budget | Status |');
    expect(markdown).toContain('CLI Startup');
    expect(markdown).toContain('Warm Repo Index');
    expect(markdown).toContain('One-File Index Update');
    expect(markdown).toContain('Fake Smoke Eval');
    expect(markdown).toContain('AgentLoop Overhead / Turn');
    expect(markdown).toContain('✓ **PASSED**');
  });

  it('3. check passes under loose injected budgets', async () => {
    const looseBudgets = {
      cliStartupMs: 5000,
      warmRepoIndexMs: 1000,
      oneFileIndexUpdateMs: 1000,
      fakeSmokeEvalMs: 100000,
      agentLoopOverheadMs: 500,
    };

    const report = await BenchRunner.runBenchmarks(process.cwd(), looseBudgets, sampleMetrics);
    expect(report.allPassed).toBe(true);
    expect(report.results.cliStartupMs.passed).toBe(true);
    expect(report.results.warmRepoIndexMs.passed).toBe(true);
    expect(report.results.oneFileIndexUpdateMs.passed).toBe(true);
    expect(report.results.fakeSmokeEvalMs.passed).toBe(true);
    expect(report.results.agentLoopOverheadMs.passed).toBe(true);
  });

  it('4. check fails when injected metric exceeds budget', async () => {
    const tightBudgets = {
      cliStartupMs: 100, // sample is 420.5 -> will fail
      warmRepoIndexMs: 300,
      oneFileIndexUpdateMs: 500,
      fakeSmokeEvalMs: 60000,
      agentLoopOverheadMs: 100,
    };

    const report = await BenchRunner.runBenchmarks(process.cwd(), tightBudgets, sampleMetrics);
    expect(report.allPassed).toBe(false);
    expect(report.results.cliStartupMs.passed).toBe(false);
    expect(report.results.warmRepoIndexMs.passed).toBe(true);

    const markdown = BenchRunner.formatMarkdown(report);
    expect(markdown).toContain('✗ **FAILED**');
    expect(markdown).toContain('✗ FAIL');
  });
});
