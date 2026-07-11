import { Strategy } from '../models';

export class StrategyRanker {
  public rank(strategies: Strategy[]): Array<{ strategyId: string; score: number }> {
    return strategies
      .map(s => ({
        strategyId: s.id,
        score: s.successRate * s.trustAverage
      }))
      .sort((a, b) => b.score - a.score);
  }
}
