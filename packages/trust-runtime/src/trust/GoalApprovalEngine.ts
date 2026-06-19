import { TrustEvaluation } from "./TrustModels";
import { Goal } from "@agent-os/adaptive-runtime/src/models/Goal";

export class GoalApprovalEngine {
  public approve(goal: Goal, evaluation: TrustEvaluation): { approved: boolean; reason: string } {
    // Check success criteria
    const unsatisfied = goal.successCriteria.filter(c => !c.satisfied);
    if (unsatisfied.length > 0) {
      return { approved: false, reason: `Failed: ${unsatisfied.length} success criteria unsatisfied.` };
    }

    if (evaluation.score.score < 90) {
      return { approved: false, reason: `Failed: Trust score ${evaluation.score.score} < 90. Reasons: ${evaluation.score.reasons.join(", ")}` };
    }

    if (evaluation.criticalContradictions > 0) {
      return { approved: false, reason: `Failed: ${evaluation.criticalContradictions} critical contradictions detected.` };
    }

    if (evaluation.criticalRegressions > 0) {
      return { approved: false, reason: `Failed: Critical regressions detected.` };
    }

    return { approved: true, reason: "Goal Approved: Trust Score >= 90 and all criteria met." };
  }
}
