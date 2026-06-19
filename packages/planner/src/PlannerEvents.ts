import { LoggingEventBus } from "@agent-os/shared";

export class PlannerEvents {
  constructor(private eventBus: LoggingEventBus) {}

  public emitGoalReceived(goalId: string) {
    this.eventBus.publish("planner.goal.received", {
      component: "planner",
      severity: "info",
      message: `Goal received: ${goalId}`,
      meta: { goalId }
    });
  }

  public emitPlanCreated(planId: string, riskScore: number) {
    this.eventBus.publish("planner.plan.created", {
      component: "planner",
      severity: "info",
      message: `Plan created: ${planId}`,
      meta: { planId, riskScore }
    });
  }

  public emitPlanValidated(planId: string, valid: boolean) {
    this.eventBus.publish("planner.plan.validated", {
      component: "planner",
      severity: valid ? "info" : "error",
      message: `Plan validation: ${planId} - ${valid}`,
      meta: { planId, valid }
    });
  }

  public emitExecutionStarted(planId: string) {
    this.eventBus.publish("planner.execution.started", {
      component: "planner",
      severity: "info",
      message: `Execution started for plan: ${planId}`,
      meta: { planId }
    });
  }

  public emitTaskStarted(taskId: string) {
    this.eventBus.publish("planner.task.started", {
      component: "planner",
      severity: "info",
      message: `Task started: ${taskId}`,
      meta: { taskId }
    });
  }

  public emitTaskCompleted(taskId: string) {
    this.eventBus.publish("planner.task.completed", {
      component: "planner",
      severity: "info",
      message: `Task completed: ${taskId}`,
      meta: { taskId }
    });
  }

  public emitTaskFailed(taskId: string, error: string) {
    this.eventBus.publish("planner.task.failed", {
      component: "planner",
      severity: "error",
      message: `Task failed: ${taskId}`,
      meta: { taskId, error }
    });
  }

  public emitExecutionCompleted(planId: string) {
    this.eventBus.publish("planner.execution.completed", {
      component: "planner",
      severity: "info",
      message: `Execution completed: ${planId}`,
      meta: { planId }
    });
  }

  public emitExecutionFailed(planId: string, error: string) {
    this.eventBus.publish("planner.execution.failed", {
      component: "planner",
      severity: "error",
      message: `Execution failed: ${planId}`,
      meta: { planId, error }
    });
  }

  public emitApprovalGenerated(planId: string) {
    this.eventBus.publish("planner.approval.generated", {
      component: "planner",
      severity: "info",
      message: `Approval package generated: ${planId}`,
      meta: { planId }
    });
  }
}
