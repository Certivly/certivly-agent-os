import { ExecutionPlan } from "@agent-os/planner";
import { ExecutionContext } from "./ExecutionContext";
import { ExecutionState } from "./ExecutionState";
import { TaskScheduler } from "./TaskScheduler";
import { TaskDispatcher } from "./TaskDispatcher";
import { TaskLifecycleManager } from "./TaskLifecycleManager";
import { ExecutionEvents } from "./ExecutionEvents";
import { ExecutionMetrics } from "./ExecutionMetrics";
import { ApprovalPackage } from "./models";
import { ContextStack } from "@agent-os/context";

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
    // Create a sliding-window context buffer for this execution
    context.contextStack = new ContextStack({ maxEntries: 100 });

    try {
      while (!scheduler.isComplete()) {
        const readyTasks = scheduler.getReadyTasks();

        if (readyTasks.length === 0 && !scheduler.isComplete()) {
          throw new Error("Execution deadlocked: no runnable tasks remain in the plan");
        }

        // Execute in parallel if applicable
        const taskPromises = readyTasks.map(async (task) => {
          scheduler.markTaskRunning(task.id);
          lifecycleManager.transitionToRunning(task.id);

          try {
            const result = await this.dispatcher.dispatch(task, context);
            if (result && result.success === false) {
              throw new Error(result.error || result.message || `Task ${task.id} reported failure`);
            }
            scheduler.markTaskCompleted(task.id);
            lifecycleManager.transitionToCompleted(task.id);
            this.metrics.recordTaskCompleted();
            // Record task completion into context stack for downstream observers
            context.contextStack?.push({
              id: crypto.randomUUID(),
              type: 'TaskContext',
              content: `Task ${task.id} (${task.type}) completed`,
              timestamp: new Date().toISOString(),
              sourceEventIds: [],
              sourceRequestIds: [context.requestId],
              sourceSessionIds: [context.sessionId],
              metadata: { taskId: task.id, taskType: task.type }
            });
            return result;
          } catch (error: any) {
            console.error(`[PlanExecutor] Task ${task.id} (${task.type}) failed:`, error.stack || error.message || error);
            scheduler.markTaskFailed(task.id);
            lifecycleManager.transitionToFailed(task.id, error.message);
            this.metrics.recordTaskFailed();
            
            const action = this.retryManager.handleFailure(task, error);
            if (action === "ABORT") {
              throw new Error(`Execution aborted due to task failure: ${task.id}`);
            } else if (action === "RETRY") {
              this.events.emitTaskRetried(task.id, 1);
            } else {
              throw new Error(`Execution requires replanning after task failure: ${task.id}`);
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

      if (context.sandbox && typeof context.sandbox.destroy === 'function') await context.sandbox.destroy();

      return approvalPackage;

    } catch (err: any) {
      state.status = "failed";
      this.events?.emitExecutionFailed?.(context.executionId, err.message);
      this.metrics?.recordExecutionFailed?.();
      if (context.sandbox && typeof context.sandbox.destroy === 'function') {
        await context.sandbox.destroy();
      }
      throw err;
    }
  }
}
