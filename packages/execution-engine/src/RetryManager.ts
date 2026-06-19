import { FailureAnalyzer } from "./FailureAnalyzer";
import { RunnableTask, FailureCategory } from "./models";

export class RetryManager {
  private retryCounts: Map<string, number> = new Map();

  constructor(private analyzer: FailureAnalyzer) {}

  public handleFailure(task: RunnableTask, error: any): "RETRY" | "ABORT" | "REPLAN" {
    const category = this.analyzer.analyzeFailure(error, task.type);
    const currentRetries = this.retryCounts.get(task.id) || 0;

    switch (category) {
      case "SKILL_FAILURE":
        if (currentRetries < 2) {
          this.retryCounts.set(task.id, currentRetries + 1);
          return "RETRY";
        }
        return "ABORT";

      case "VALIDATION_FAILURE":
        return "REPLAN";

      case "SANDBOX_FAILURE":
        return "ABORT";

      case "PATCH_FAILURE":
        if (currentRetries < 1) {
          this.retryCounts.set(task.id, currentRetries + 1);
          return "RETRY";
        }
        return "ABORT";

      default:
        return "ABORT";
    }
  }

  public getRetryCount(taskId: string): number {
    return this.retryCounts.get(taskId) || 0;
  }
}
