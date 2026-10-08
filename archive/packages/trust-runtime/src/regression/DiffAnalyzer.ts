import { Baseline } from "./RegressionReport";

export class DiffAnalyzer {
  public analyze(before: Baseline, after: Baseline): string[] {
    const regressions: string[] = [];

    if (after.coverage < before.coverage) {
      regressions.push(`Coverage dropped from ${before.coverage} to ${after.coverage}`);
    }

    if (after.testCount < before.testCount) {
      regressions.push(`Test count dropped from ${before.testCount} to ${after.testCount}`);
    }

    if (before.buildStatus === true && after.buildStatus === false) {
      regressions.push(`Build regressed to failing state`);
    }

    return regressions;
  }
}
