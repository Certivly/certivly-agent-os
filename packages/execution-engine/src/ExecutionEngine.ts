import { ExecutionPlan } from "@agent-os/planner";
import { ExecutionContext } from "./ExecutionContext";
import { PlanExecutor } from "./PlanExecutor";
import { ApprovalPackage } from "./models";
import { v4 as uuidv4 } from "uuid";

export class ExecutionEngine {
  constructor(private planExecutor: PlanExecutor) {}

  public async executePlan(
    sessionId: string,
    requestId: string,
    workspaceRoot: string,
    plan: ExecutionPlan
  ): Promise<ApprovalPackage> {
    const context: ExecutionContext = {
      executionId: uuidv4(),
      sessionId,
      requestId,
      workspaceRoot,
      planId: plan.id,
      startedAt: Date.now()
    };

    return await this.planExecutor.execute(context, plan);
  }
}
