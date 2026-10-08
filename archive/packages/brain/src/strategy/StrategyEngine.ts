import { Strategy, PlanningAdvice } from '../models';
import { StrategyCompiler } from './StrategyCompiler';
import { StrategyStore } from './StrategyStore';
import { StrategyRanker } from './StrategyRanker';
import { StrategyQueryEngine } from './StrategyQueryEngine';
import { FailureAvoidanceEngine } from './FailureAvoidanceEngine';
import { PlanningAdvisor } from './PlanningAdvisor';
import { SuccessMemory } from '../memory/SuccessMemory';
import { FailureMemory } from '../memory/FailureMemory';

/**
 * Top-level entry point for the strategy/pattern learning half of the brain.
 * Compiles execution history into Strategies and advises on the best next path.
 */
export class StrategyEngine {
  private compiler: StrategyCompiler;
  private store: StrategyStore;
  private advisor: PlanningAdvisor;

  constructor(
    public readonly successMemory: SuccessMemory,
    public readonly failureMemory: FailureMemory,
    storeDir?: string
  ) {
    this.store = new StrategyStore(storeDir);
    this.compiler = new StrategyCompiler(successMemory, failureMemory);
    const queryEngine = new StrategyQueryEngine(this.store);
    this.advisor = new PlanningAdvisor(queryEngine, new StrategyRanker(), new FailureAvoidanceEngine());
  }

  /**
   * Re-compile all strategies from current memory, then return them.
   * Call this after each execution so the advisor has fresh data.
   */
  public compile(): Strategy[] {
    const strategies = this.compiler.compile();
    this.store = new StrategyStore();
    for (const s of strategies) this.store.save(s);
    // Refresh advisor with new store
    const queryEngine = new StrategyQueryEngine(this.store);
    this.advisor = new PlanningAdvisor(queryEngine, new StrategyRanker(), new FailureAvoidanceEngine());
    return strategies;
  }

  /**
   * Get a PlanningAdvice recommendation based on current compiled strategies.
   */
  public advise(): PlanningAdvice {
    return this.advisor.advise();
  }
}
