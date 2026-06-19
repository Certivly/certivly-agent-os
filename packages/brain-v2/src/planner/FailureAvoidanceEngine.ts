import { Strategy } from "../models/Strategy";

export class FailureAvoidanceEngine {
  public filter(strategies: Strategy[]): Strategy[] {
    return strategies.filter(strategy => {
      // Deterministic rule: Never select a strategy where failure rate > success rate
      if (strategy.failureRate > strategy.successRate && strategy.executions >= 3) {
        return false;
      }
      // Or explicitly failing > 50% of the time
      if (strategy.failureRate > 0.5) {
        return false;
      }
      return true;
    });
  }
}
