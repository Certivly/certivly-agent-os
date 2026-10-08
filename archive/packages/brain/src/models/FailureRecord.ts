export interface FailureRecord {
  id: string;
  goalId: string;
  reason: string;
  trustScore: number;
  failedNodeId: string;
  affectedFiles: string[];
  executionPath: string[];
  timestamp: number;
}
