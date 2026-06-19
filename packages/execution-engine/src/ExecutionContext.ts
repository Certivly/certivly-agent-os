export interface ExecutionContext {
  executionId: string;
  sessionId: string;
  requestId: string;
  workspaceRoot: string;
  planId: string;
  sandboxId?: string;
  startedAt: number;
}
