import { Strategy } from '../models';

export class FailureAvoidanceEngine {
  public filter(strategies: Strategy[]): Strategy[] {
    return strategies.filter(s => {
      if (s.failureRate > s.successRate && s.executions >= 3) return false;
      if (s.failureRate > 0.5) return false;
      return true;
    });
  }
}
