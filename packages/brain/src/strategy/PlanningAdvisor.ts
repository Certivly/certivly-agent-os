import { PlanningAdvice } from '../models';
import { StrategyRanker } from './StrategyRanker';
import { StrategyQueryEngine } from './StrategyQueryEngine';
import { FailureAvoidanceEngine } from './FailureAvoidanceEngine';

export class PlanningAdvisor {
  constructor(
    private queryEngine: StrategyQueryEngine,
    private ranker: StrategyRanker,
    private avoidanceEngine: FailureAvoidanceEngine
  ) {}

  public advise(): PlanningAdvice {
    let strategies = this.queryEngine.getStrategies();
    strategies = this.avoidanceEngine.filter(strategies);

    if (strategies.length === 0) {
      return {
        recommendedStrategy: null,
        confidence: 0,
        reasoning: ['No safe strategies available from history yet.'],
        evidenceIds: []
      };
    }

    const ranked = this.ranker.rank(strategies);
    const top = ranked[0];
    const strategy = strategies.find(s => s.id === top.strategyId)!;

    return {
      recommendedStrategy: strategy.id,
      confidence: strategy.successRate,
      reasoning: [
        `${strategy.executions} execution(s) on record`,
        `${(strategy.successRate * 100).toFixed(0)}% success rate`,
        `Average trust score ${strategy.trustAverage.toFixed(0)}`,
        `Path: ${strategy.executionPath.join(' → ')}`
      ],
      evidenceIds: strategy.evidenceIds
    };
  }
}
