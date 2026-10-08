export interface ExecutionState {
  executionId: string;
  status: "pending" | "running" | "completed" | "failed" | "aborted";
  currentTask?: string;
  completedTasks: string[];
  failedTasks: string[];
  validationStatus: "pending" | "passed" | "failed";
  approvalStatus: "pending" | "approved" | "rejected";
}
