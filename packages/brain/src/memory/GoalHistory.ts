import { SuccessMemory } from "./SuccessMemory";
import { FailureMemory } from "./FailureMemory";

export class GoalHistory {
  constructor(
    private successMemory: SuccessMemory,
    private failureMemory: FailureMemory
  ) {}

  public getGoalOutcomes(goalId: string) {
    const successes = this.successMemory.getByGoalId(goalId);
    const failures = this.failureMemory.getByGoalId(goalId);
    return {
      successes,
      failures,
      totalAttempts: successes.length + failures.length
    };
  }
}
