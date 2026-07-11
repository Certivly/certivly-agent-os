import { ExecutionPlan } from "@agent-os/planner";
import { ExecutionContext } from "./ExecutionContext";
import { ExecutionState } from "./ExecutionState";
import { TaskScheduler } from "./TaskScheduler";
import { TaskDispatcher } from "./TaskDispatcher";
import { TaskLifecycleManager } from "./TaskLifecycleManager";
import { ExecutionEvents } from "./ExecutionEvents";
import { ExecutionMetrics } from "./ExecutionMetrics";
import { ApprovalPackage } from "./models";

export class PlanExecutor {
  constructor(
    private dispatcher: TaskDispatcher,
    private events: ExecutionEvents,
    private metrics: ExecutionMetrics,
    private retryManager: any,
    private validationCoordinator: any,
    private approvalCoordinator: any,
    private sandboxManager: any
  ) {}

  public async execute(context: ExecutionContext, plan: ExecutionPlan): Promise<ApprovalPackage> {
    const startTime = Date.now();
    this.events.emitExecutionStarted(context.executionId);
    this.metrics.recordExecutionStarted();

    const state: ExecutionState = {
      executionId: context.executionId,
      status: "running",
      completedTasks: [],
      failedTasks: [],
      validationStatus: "pending",
      approvalStatus: "pending"
    };

    const lifecycleManager = new TaskLifecycleManager(state, this.events);
    const scheduler = new TaskScheduler(plan);

    context.sandbox = await this.sandboxManager.createSandbox('local');

    try {
      while (!scheduler.isComplete()) {
        const readyTasks = scheduler.getReadyTasks();

        if (readyTasks.length === 0 && state.running && !scheduler.isComplete()) {
          // Could be a deadlock or waiting for parallel tasks to finish
          // Assuming sequential/awaited for this simplified async loop
        }

        // Execute in parallel if applicable
        const taskPromises = readyTasks.map(async (task) => {
          scheduler.markTaskRunning(task.id);
          lifecycleManager.transitionToRunning(task.id);

          try {
            const result = await this.dispatcher.dispatch(task, context);
            scheduler.markTaskCompleted(task.id);
            lifecycleManager.transitionToCompleted(task.id);
            this.metrics.recordTaskCompleted();
            return result;
          } catch (error: any) {
            require('fs').appendFileSync('d:/Work/Personal/agent-os/error.log', `[PlanExecutor] Task ${task.id} (${task.type}) failed:\n${error.stack || error.message || error}\n\n`);
            console.error(`[PlanExecutor] Task ${task.id} (${task.type}) failed:`, error.stack || error.message || error);
            scheduler.markTaskFailed(task.id);
            lifecycleManager.transitionToFailed(task.id, error.message);
            this.metrics.recordTaskFailed();
            
            const action = this.retryManager.handleFailure(task, error);
            if (action === "ABORT") {
              throw new Error(`Execution aborted due to task failure: ${task.id}`);
            } else if (action === "RETRY") {
              // Retries would be enqueued back or handled synchronously
              this.events.emitTaskRetried(task.id, 1);
            }
          }
        });

        await Promise.all(taskPromises);
      }

      this.events.emitValidationStarted(context.executionId);
      const validationResult = await this.validationCoordinator.validate(context);
      this.events.emitValidationCompleted(context.executionId, validationResult.passed);

      if (validationResult.passed) {
        this.metrics.recordValidationSuccess();
      }

      const approvalPackage = await this.approvalCoordinator.generateApprovalPackage(context, validationResult);
      this.events.emitApprovalGenerated(context.executionId);

      state.status = "completed";
      this.events.emitExecutionCompleted(context.executionId);
      this.metrics.recordExecutionCompleted();
      this.metrics.recordExecutionDuration(Date.now() - startTime);

      if (context.sandbox) await context.sandbox.destroy();

      return approvalPackage;

    } catch (err: any) {
      state.status = "failed";
      this.events.emitExecutionFailed(context.executionId, err.message);
      this.metrics.recordExecutionFailed();
      if (context.sandbox) {
        await context.sandbox.destroy();
      }
      throw err;
    }
  }
}
