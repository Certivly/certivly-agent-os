import { Strategy } from "../models/Strategy";

export class StrategyScoreCalculator {
  public calculate(strategy: Strategy): number {
    // Formula:
    // score = (successRate * 0.50) + (trustAverage * 0.30) + (executionCountWeight * 0.20)
    
    // Normalize execution count to 0-100 (cap at 10 executions for 100 max weight)
    const executionCountWeight = Math.min(strategy.executions * 10, 100);

    const score = (strategy.successRate * 100 * 0.50) + 
                  (strategy.trustAverage * 0.30) + 
                  (executionCountWeight * 0.20);
                  
    return score;
  }
}
