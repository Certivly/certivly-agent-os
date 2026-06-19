import { StrategyRanker } from "../strategy/StrategyRanker";
import { StrategyQueryEngine } from "../query/StrategyQueryEngine";
import { FailureAvoidanceEngine } from "./FailureAvoidanceEngine";

export interface PlanningAdvice {
  recommendedStrategy: string | null;
  confidence: number;
  reasoning: string[];
  evidenceIds: string[];
}

export class PlanningAdvisor {
  constructor(
    private queryEngine: StrategyQueryEngine,
    private ranker: StrategyRanker,
    private avoidanceEngine: FailureAvoidanceEngine
  ) {}

  public advise(): PlanningAdvice {
    let strategies = this.queryEngine.getStrategies();
    
    // Filter out dangerous paths
    strategies = this.avoidanceEngine.filter(strategies);

    if (strategies.length === 0) {
      return {
        recommendedStrategy: null,
        confidence: 0,
        reasoning: ["No safe strategies available."],
        evidenceIds: []
      };
    }

    // Rank safely
    const ranked = this.ranker.rank(strategies);
    const top = ranked[0];

    const strategy = strategies.find(s => s.id === top.strategyId)!;

    return {
      recommendedStrategy: strategy.id,
      confidence: strategy.successRate,
      reasoning: [
        `${strategy.executions} executions`,
        `${(strategy.successRate * 100).toFixed(0)}% success rate`,
        `average trust score ${strategy.trustAverage.toFixed(0)}`
      ],
      evidenceIds: strategy.evidenceIds
    };
  }
}
