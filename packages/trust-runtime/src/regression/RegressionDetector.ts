import { BaselineManager } from "./BaselineManager";
import { DiffAnalyzer } from "./DiffAnalyzer";
import { Baseline, RegressionReport } from "./RegressionReport";

export class RegressionDetector {
  constructor(
    private baselineManager: BaselineManager,
    private diffAnalyzer: DiffAnalyzer
  ) {}

  public detect(goalId: string, currentState: Baseline): RegressionReport {
    const baseline = this.baselineManager.get(goalId);
    if (!baseline) {
      return { id: `reg_${Date.now()}`, regressions: [], hasCriticalRegressions: false };
    }

    const regressions = this.diffAnalyzer.analyze(baseline, currentState);
    return {
      id: `reg_${Date.now()}`,
      regressions,
      hasCriticalRegressions: regressions.length > 0
    };
  }
}
