import { LoggingEventBus } from "@agent-os/shared";

export class ExecutionEvents {
  constructor(private eventBus: LoggingEventBus) {}

  public emitExecutionStarted(executionId: string) {
    this.eventBus.publish("execution.started", {
      component: "execution-engine",
      severity: "info",
      message: `Execution started: ${executionId}`,
      meta: { executionId }
    });
  }

  public emitExecutionCompleted(executionId: string) {
    this.eventBus.publish("execution.completed", {
      component: "execution-engine",
      severity: "info",
      message: `Execution completed: ${executionId}`,
      meta: { executionId }
    });
  }

  public emitExecutionFailed(executionId: string, error: string) {
    this.eventBus.publish("execution.failed", {
      component: "execution-engine",
      severity: "error",
      message: `Execution failed: ${executionId}`,
      meta: { executionId, error }
    });
  }

  public emitTaskStarted(taskId: string) {
    this.eventBus.publish("task.started", {
      component: "execution-engine",
      severity: "info",
      message: `Task started: ${taskId}`,
      meta: { taskId }
    });
  }

  public emitTaskCompleted(taskId: string) {
    this.eventBus.publish("task.completed", {
      component: "execution-engine",
      severity: "info",
      message: `Task completed: ${taskId}`,
      meta: { taskId }
    });
  }

  public emitTaskFailed(taskId: string, error: string) {
    this.eventBus.publish("task.failed", {
      component: "execution-engine",
      severity: "error",
      message: `Task failed: ${taskId}`,
      meta: { taskId, error }
    });
  }

  public emitTaskRetried(taskId: string, attempt: number) {
    this.eventBus.publish("task.retried", {
      component: "execution-engine",
      severity: "warn",
      message: `Task retried: ${taskId} (attempt ${attempt})`,
      meta: { taskId, attempt }
    });
  }

  public emitValidationStarted(executionId: string) {
    this.eventBus.publish("validation.started", {
      component: "execution-engine",
      severity: "info",
      message: `Validation started: ${executionId}`,
      meta: { executionId }
    });
  }

  public emitValidationCompleted(executionId: string, passed: boolean) {
    this.eventBus.publish("validation.completed", {
      component: "execution-engine",
      severity: "info",
      message: `Validation completed: ${executionId} - ${passed}`,
      meta: { executionId, passed }
    });
  }

  public emitPatchGenerated(executionId: string) {
    this.eventBus.publish("patch.generated", {
      component: "execution-engine",
      severity: "info",
      message: `Patch generated: ${executionId}`,
      meta: { executionId }
    });
  }

  public emitApprovalGenerated(executionId: string) {
    this.eventBus.publish("approval.generated", {
      component: "execution-engine",
      severity: "info",
      message: `Approval package generated: ${executionId}`,
      meta: { executionId }
    });
  }
}
