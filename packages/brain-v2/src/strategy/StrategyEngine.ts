import { StrategyCompiler } from "./StrategyCompiler";
import { StrategyStore } from "../store/StrategyStore";
import { Strategy } from "../models/Strategy";

export class StrategyEngine {
  constructor(
    private compiler: StrategyCompiler,
    private store: StrategyStore
  ) {}

  public executePipeline(): Strategy[] {
    const strategies = this.compiler.compile();
    
    for (const strategy of strategies) {
      this.store.save(strategy);
    }

    return strategies;
  }
}
