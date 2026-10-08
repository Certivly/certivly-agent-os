import { Goal } from '../models/Goal';

export class CompletionChecker {
  public check(goal: Goal): { completed: boolean, reason: string } {
    const unsatisfied = goal.successCriteria.filter(c => !c.satisfied);

    if (unsatisfied.length === 0) {
      goal.status = "completed";
      return { completed: true, reason: "all criteria satisfied" };
    }

    return {
      completed: false,
      reason: `${unsatisfied.length} failing criteria remain`
    };
  }
}
