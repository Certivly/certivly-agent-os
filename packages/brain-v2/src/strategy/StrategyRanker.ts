import { Strategy } from "../models/Strategy";
import { StrategyScoreCalculator } from "../scoring/StrategyScoreCalculator";

export class StrategyRanker {
  constructor(private calculator: StrategyScoreCalculator) {}

  public rank(strategies: Strategy[]): { strategyId: string; score: number }[] {
    const scored = strategies.map(s => ({
      strategyId: s.id,
      score: this.calculator.calculate(s)
    }));

    return scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      // Stable ordering on equal scores
      return a.strategyId.localeCompare(b.strategyId);
    });
  }
}
