export interface SuccessRecord {
  id: string;
  goalId: string;
  planId: string;
  trustScore: number;
  taskGraphId: string;
  affectedFiles: string[];
  executionPath: string[]; // e.g. ["Search", "Patch", "Validate", "Test"]
  timestamp: number;
}
