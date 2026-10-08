import * as fs from 'fs';
import * as path from 'path';
import type { EvalResult } from './EvalTypes';

export class EvalReporter {
  public static appendJsonl(filePath: string, result: EvalResult): void {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const line = JSON.stringify(result) + '\n';
    fs.appendFileSync(filePath, line, 'utf8');
  }

  public static writeJsonl(filePath: string, results: EvalResult[]): void {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const content = results.map((r) => JSON.stringify(r)).join('\n') + '\n';
    fs.writeFileSync(filePath, content, 'utf8');
  }

  public static readJsonl(filePath: string): EvalResult[] {
    if (!fs.existsSync(filePath)) {
      return [];
    }
    const lines = fs
      .readFileSync(filePath, 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    return lines.map((l) => JSON.parse(l));
  }

  public static toMarkdownTable(
    results: EvalResult[],
    baselineResults?: EvalResult[]
  ): string {
    const baselineMap = new Map<string, EvalResult>();
    if (baselineResults) {
      for (const b of baselineResults) {
        baselineMap.set(b.taskId, b);
      }
    }

    const rows: string[] = [];
    rows.push('| Task ID | Status | Turns | Tool Calls | Tokens (In/Out) | Cost | Wall Time | Files Changed |');
    rows.push('| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- |');

    let passedCount = 0;
    let totalTokensIn = 0;
    let totalTokensOut = 0;
    let totalWallTime = 0;
    let totalCost: number | null = null;
    let validCostCount = 0;

    for (const r of results) {
      if (r.passed) passedCount++;
      totalTokensIn += r.tokens.input;
      totalTokensOut += r.tokens.output;
      totalWallTime += r.wallTimeMs;

      if (typeof r.estimatedCostUsd === 'number') {
        totalCost = (totalCost || 0) + r.estimatedCostUsd;
        validCostCount++;
      }

      let status = r.passed ? 'PASS' : 'FAIL';
      if (r.skipped) {
        status = '[SKIP]';
      } else {
        const baseline = baselineMap.get(r.taskId);
        if (baseline) {
          if (r.passed && !baseline.passed) {
            status = 'PASS (+fixed)';
          } else if (!r.passed && baseline.passed) {
            status = 'FAIL (-regressed)';
          }
        }
      }

      const toolCallsSummary = Object.entries(r.toolCalls)
        .map(([k, v]) => `${k}:${v}`)
        .join(', ') || 'none';

      const files = r.filesChanged.join(', ') || 'none';
      const costStr = typeof r.estimatedCostUsd === 'number' ? `$${r.estimatedCostUsd.toFixed(4)}` : 'null';

      rows.push(
        `| ${r.taskId} | ${status} | ${r.turns} | ${toolCallsSummary} | ${r.tokens.input}/${r.tokens.output} | ${costStr} | ${(r.wallTimeMs / 1000).toFixed(1)}s | ${files} |`
      );
    }

    const passRate = results.length > 0 ? ((passedCount / results.length) * 100).toFixed(1) : '0';
    const summaryLines = [
      `### Evaluation Summary`,
      ``,
      `- **Passed**: ${passedCount} / ${results.length} (${passRate}%)`,
      `- **Total Wall Time**: ${(totalWallTime / 1000).toFixed(2)}s`,
      `- **Total Tokens**: ${totalTokensIn} in / ${totalTokensOut} out (${totalTokensIn + totalTokensOut} total)`,
    ];

    if (validCostCount > 0 && totalCost !== null) {
      summaryLines.push(`- **Total Cost**: $${totalCost.toFixed(6)}`);
      summaryLines.push(`- **Average Cost**: $${(totalCost / results.length).toFixed(6)}`);
    }

    summaryLines.push(``, rows.join('\n'));

    return summaryLines.join('\n');
  }
}
