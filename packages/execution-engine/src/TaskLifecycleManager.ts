import { ExecutionState } from "./ExecutionState";
import { ExecutionEvents } from "./ExecutionEvents";

export class TaskLifecycleManager {
  constructor(
    private state: ExecutionState,
    private events: ExecutionEvents
  ) {}

  public transitionToRunning(taskId: string) {
    this.state.currentTask = taskId;
    this.events.emitTaskStarted(taskId);
  }

  public transitionToCompleted(taskId: string) {
    if (this.state.currentTask === taskId) {
      this.state.currentTask = undefined;
    }
    this.state.completedTasks.push(taskId);
    this.events.emitTaskCompleted(taskId);
  }

  public transitionToFailed(taskId: string, error: string) {
    if (this.state.currentTask === taskId) {
      this.state.currentTask = undefined;
    }
    this.state.failedTasks.push(taskId);
    this.events.emitTaskFailed(taskId, error);
  }

  public getState(): ExecutionState {
    return this.state;
  }
}
