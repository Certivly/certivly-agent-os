import { GoalApprovalEngine } from "../trust/GoalApprovalEngine";
import { TrustEngine } from "../trust/TrustEngine";
import { Goal } from "@agent-os/adaptive-runtime/src/models/Goal";
import { Claim } from "../claims/ClaimModels";
import { Evidence } from "../evidence/EvidenceTypes";
import { RegressionReport } from "../regression/RegressionReport";

export class AdaptiveRuntimeBridge {
  constructor(
    private trustEngine: TrustEngine,
    private approvalEngine: GoalApprovalEngine
  ) {}

  public evaluateGoalCompletion(
    goal: Goal,
    claims: Claim[],
    evidence: Evidence[],
    regressionReport: RegressionReport
  ): { approved: boolean; reason: string } {
    const evaluation = this.trustEngine.evaluate(goal.id, claims, evidence, regressionReport);
    return this.approvalEngine.approve(goal, evaluation);
  }
}
