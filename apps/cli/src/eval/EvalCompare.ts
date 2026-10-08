import * as fs from 'fs';
import { EvalReporter } from './EvalReporter';
import type { EvalResult } from './EvalTypes';

export interface EvalComparison {
  baselineCount: number;
  candidateCount: number;
  basePassRate: number;
  candidatePassRate: number;
  passRateDelta: number;
  perTaskRegressions: string[];
  perTaskImprovements: string[];
  missingTasks: string[];
  newTasks: string[];
  averageTurnsDelta: number;
  averageToolCallsDelta: number;
  averageWallTimeDeltaMs: number;
  tokensDelta: {
    input: number;
    output: number;
    total: number;
  };
  costDelta?: number;
  isRegression: boolean;
  reasons: string[];
}

export interface CompareOptions {
  allowRegression?: boolean;
  flakyTaskIds?: string[];
  smokeTaskIds?: string[];
}

export class EvalCompare {
  public static compare(
    baseline: EvalResult[],
    candidate: EvalResult[],
    options: CompareOptions = {}
  ): EvalComparison {
    const baseMap = new Map<string, EvalResult>();
    for (const b of baseline) {
      baseMap.set(b.taskId, b);
    }

    const candMap = new Map<string, EvalResult>();
    for (const c of candidate) {
      candMap.set(c.taskId, c);
    }

    const basePassed = baseline.filter((b) => b.passed).length;
    const candPassed = candidate.filter((c) => c.passed).length;

    const basePassRate = baseline.length > 0 ? (basePassed / baseline.length) * 100 : 0;
    const candidatePassRate = candidate.length > 0 ? (candPassed / candidate.length) * 100 : 0;
    const passRateDelta = candidatePassRate - basePassRate;

    const perTaskRegressions: string[] = [];
    const perTaskImprovements: string[] = [];
    const missingTasks: string[] = [];
    const newTasks: string[] = [];
    const reasons: string[] = [];

    const flakySet = new Set(options.flakyTaskIds || []);
    const smokeSet = new Set(options.smokeTaskIds || ['ts-off-by-one']);

    // Check baseline tasks against candidate
    for (const [taskId, baseResult] of baseMap.entries()) {
      const candResult = candMap.get(taskId);
      if (!candResult) {
        missingTasks.push(taskId);
        reasons.push(`Missing candidate result for baseline task: ${taskId}`);
        continue;
      }

      if (baseResult.passed && !candResult.passed) {
        if (!flakySet.has(taskId)) {
          perTaskRegressions.push(taskId);
          const isSmoke = smokeSet.has(taskId);
          reasons.push(
            `Task regressed: ${taskId} passed in baseline but failed in candidate${
              isSmoke ? ' (SMOKE TASK)' : ''
            }`
          );
        }
      } else if (!baseResult.passed && candResult.passed) {
        perTaskImprovements.push(taskId);
      }
    }

    // Check candidate for new tasks
    for (const taskId of candMap.keys()) {
      if (!baseMap.has(taskId)) {
        newTasks.push(taskId);
      }
    }

    // Compute averages
    const calcAvg = (
      arr: EvalResult[],
      fn: (r: EvalResult) => number
    ) => (arr.length > 0 ? arr.reduce((acc, r) => acc + fn(r), 0) / arr.length : 0);

    const baseAvgTurns = calcAvg(baseline, (r) => r.turns);
    const candAvgTurns = calcAvg(candidate, (r) => r.turns);
    const averageTurnsDelta = candAvgTurns - baseAvgTurns;

    const sumToolCalls = (r: EvalResult) =>
      Object.values(r.toolCalls || {}).reduce((a, b) => a + b, 0);
    const baseAvgToolCalls = calcAvg(baseline, sumToolCalls);
    const candAvgToolCalls = calcAvg(candidate, sumToolCalls);
    const averageToolCallsDelta = candAvgToolCalls - baseAvgToolCalls;

    const baseAvgWallTime = calcAvg(baseline, (r) => r.wallTimeMs);
    const candAvgWallTime = calcAvg(candidate, (r) => r.wallTimeMs);
    const averageWallTimeDeltaMs = candAvgWallTime - baseAvgWallTime;

    const sumTokens = (arr: EvalResult[], key: 'input' | 'output') =>
      arr.reduce((acc, r) => acc + (r.tokens?.[key] || 0), 0);
    const baseIn = sumTokens(baseline, 'input');
    const baseOut = sumTokens(baseline, 'output');
    const candIn = sumTokens(candidate, 'input');
    const candOut = sumTokens(candidate, 'output');

    const tokensDelta = {
      input: candIn - baseIn,
      output: candOut - baseOut,
      total: candIn + candOut - (baseIn + baseOut),
    };

    // Regression policy:
    // Any regression in non-flaky tasks or missing baseline task causes regression
    const isRegression = perTaskRegressions.length > 0 || missingTasks.length > 0;

    return {
      baselineCount: baseline.length,
      candidateCount: candidate.length,
      basePassRate,
      candidatePassRate,
      passRateDelta,
      perTaskRegressions,
      perTaskImprovements,
      missingTasks,
      newTasks,
      averageTurnsDelta,
      averageToolCallsDelta,
      averageWallTimeDeltaMs,
      tokensDelta,
      isRegression,
      reasons,
    };
  }

  public static compareFiles(
    basePath: string,
    candidatePath: string,
    options: CompareOptions = {}
  ): EvalComparison {
    const baseResults = EvalReporter.readJsonl(basePath);
    const candResults = EvalReporter.readJsonl(candidatePath);
    return this.compare(baseResults, candResults, options);
  }

  public static formatReport(comparison: EvalComparison, options: CompareOptions = {}): string {
    const lines: string[] = [];
    lines.push('### Evaluation Comparison Report');
    lines.push('');
    lines.push(
      `- **Baseline Pass Rate**: ${comparison.basePassRate.toFixed(1)}% (${comparison.baselineCount} tasks)`
    );
    lines.push(
      `- **Candidate Pass Rate**: ${comparison.candidatePassRate.toFixed(1)}% (${comparison.candidateCount} tasks)`
    );
    const deltaSign = comparison.passRateDelta >= 0 ? '+' : '';
    lines.push(`- **Pass Rate Delta**: ${deltaSign}${comparison.passRateDelta.toFixed(1)}%`);
    lines.push('');
    lines.push('#### Metric Deltas');
    lines.push(
      `- **Avg Turns Delta**: ${comparison.averageTurnsDelta >= 0 ? '+' : ''}${comparison.averageTurnsDelta.toFixed(2)}`
    );
    lines.push(
      `- **Avg Tool Calls Delta**: ${comparison.averageToolCallsDelta >= 0 ? '+' : ''}${comparison.averageToolCallsDelta.toFixed(2)}`
    );
    lines.push(
      `- **Avg Wall Time Delta**: ${comparison.averageWallTimeDeltaMs >= 0 ? '+' : ''}${(comparison.averageWallTimeDeltaMs / 1000).toFixed(2)}s`
    );
    lines.push(
      `- **Tokens Delta**: In: ${comparison.tokensDelta.input >= 0 ? '+' : ''}${comparison.tokensDelta.input}, Out: ${comparison.tokensDelta.output >= 0 ? '+' : ''}${comparison.tokensDelta.output}, Total: ${comparison.tokensDelta.total >= 0 ? '+' : ''}${comparison.tokensDelta.total}`
    );
    lines.push('');

    if (comparison.perTaskImprovements.length > 0) {
      lines.push(`#### Improvements (${comparison.perTaskImprovements.length})`);
      for (const t of comparison.perTaskImprovements) {
        lines.push(`- [FIXED] ${t}`);
      }
      lines.push('');
    }

    if (comparison.perTaskRegressions.length > 0) {
      lines.push(`#### Regressions (${comparison.perTaskRegressions.length})`);
      for (const t of comparison.perTaskRegressions) {
        lines.push(`- [REGRESSED] ${t}`);
      }
      lines.push('');
    }

    if (comparison.missingTasks.length > 0) {
      lines.push(`#### Missing Tasks (${comparison.missingTasks.length})`);
      for (const t of comparison.missingTasks) {
        lines.push(`- [MISSING] ${t}`);
      }
      lines.push('');
    }

    if (comparison.newTasks.length > 0) {
      lines.push(`#### New Tasks (${comparison.newTasks.length})`);
      for (const t of comparison.newTasks) {
        lines.push(`- [NEW] ${t}`);
      }
      lines.push('');
    }

    if (comparison.isRegression) {
      lines.push(
        options.allowRegression
          ? '**Result**: REGRESSION DETECTED (allowed via --allow-regression)'
          : '**Result**: FAILED DUE TO REGRESSION'
      );
    } else {
      lines.push('**Result**: PASSED (No regressions)');
    }

    return lines.join('\n');
  }
}
