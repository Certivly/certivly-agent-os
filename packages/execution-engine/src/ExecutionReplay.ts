import { ExecutionState } from "./ExecutionState";

export class ExecutionReplay {
  constructor(private eventStore: any) {}

  public async replay(executionId: string): Promise<ExecutionState> {
    const events = await this.eventStore.query({ executionId });

    const state: ExecutionState = {
      executionId,
      status: "pending",
      completedTasks: [],
      failedTasks: [],
      validationStatus: "pending",
      approvalStatus: "pending"
    };

    const orderedEvents = events.sort((a: any, b: any) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    for (const event of orderedEvents) {
      if (event.type === "execution.started") {
        state.status = "running";
      } else if (event.type === "execution.completed") {
        state.status = "completed";
      } else if (event.type === "execution.failed") {
        state.status = "failed";
      } else if (event.type === "task.started") {
        state.currentTask = event.payload.meta.taskId;
      } else if (event.type === "task.completed") {
        if (state.currentTask === event.payload.meta.taskId) {
          state.currentTask = undefined;
        }
        state.completedTasks.push(event.payload.meta.taskId);
      } else if (event.type === "task.failed") {
        if (state.currentTask === event.payload.meta.taskId) {
          state.currentTask = undefined;
        }
        state.failedTasks.push(event.payload.meta.taskId);
      } else if (event.type === "validation.completed") {
        state.validationStatus = event.payload.meta.passed ? "passed" : "failed";
      } else if (event.type === "approval.generated") {
        state.approvalStatus = "approved"; // Assuming generated means approved in this context
      }
    }

    return state;
  }
}
