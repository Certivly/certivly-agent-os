import { StrategyStore } from "../store/StrategyStore";
import { Strategy } from "../models/Strategy";

export class StrategyQueryEngine {
  constructor(private store: StrategyStore) {}

  public getStrategies(): Strategy[] {
    return this.store.getAll();
  }

  public getTopStrategy(): Strategy | null {
    const strategies = this.getStrategies();
    if (strategies.length === 0) return null;
    return strategies[0]; // Assumes ranker has sorted them or we'll sort them via ranker
  }

  public getStrategyHistory(strategyId: string): string[] {
    const strategy = this.store.get(strategyId);
    return strategy ? strategy.evidenceIds : [];
  }
}
