/**
 * Execution outcome history and risk/success-rate analytics.
 * Moved from @agent-os/seol.
 */
export interface ExecutionOutcome {
  id: string;
  goal: string;
  category: string;
  success: boolean;
  tasksCompleted: number;
  tasksFailed: number;
  riskScore: number;
  durationMs: number;
  timestamp: string;
}

export interface LearningInsight {
  averageSuccessRate: number;
  totalExecutions: number;
  topFailurePatterns: string[];
  suggestedRiskAdjustment: number;
}

export class LearningEngine {
  private outcomes: ExecutionOutcome[] = [];
  private readonly maxHistory = 1000;

  /** Record the result of a completed pipeline execution. */
  public recordOutcome(outcome: ExecutionOutcome): void {
    this.outcomes.push(outcome);
    if (this.outcomes.length > this.maxHistory) {
      this.outcomes = this.outcomes.slice(-this.maxHistory);
    }
  }

  /** Overall success rate across all recorded executions. */
  public getSuccessRate(): number {
    if (this.outcomes.length === 0) return 1;
    return this.outcomes.filter(o => o.success).length / this.outcomes.length;
  }

  /** Find past outcomes with similar goals (keyword match). */
  public getSimilarOutcomes(goal: string, limit = 3): ExecutionOutcome[] {
    const words = goal.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    if (words.length === 0) return this.outcomes.slice(-limit);
    return this.outcomes
      .filter(o => words.some(w => o.goal.toLowerCase().includes(w)))
      .slice(-limit);
  }

  /** Historical average risk score for a goal category — used by planner to adjust estimate. */
  public getHistoricalRiskForCategory(category: string): number {
    const matching = this.outcomes.filter(o => o.category.toLowerCase() === category.toLowerCase());
    if (matching.length === 0) return 10;
    return matching.reduce((sum, o) => sum + o.riskScore, 0) / matching.length;
  }

  /** High-level summary of learning state. */
  public getInsight(): LearningInsight {
    const successRate = this.getSuccessRate();
    const failureGoals = this.outcomes.filter(o => !o.success).map(o => o.goal.slice(0, 40)).slice(-5);
    const avgRisk = this.outcomes.length > 0
      ? this.outcomes.reduce((sum, o) => sum + o.riskScore, 0) / this.outcomes.length
      : 0;
    return {
      averageSuccessRate: successRate,
      totalExecutions: this.outcomes.length,
      topFailurePatterns: failureGoals,
      suggestedRiskAdjustment: successRate < 0.5 ? 10 : 0
    };
  }
}
