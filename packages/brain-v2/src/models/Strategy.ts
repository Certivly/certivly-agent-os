export interface Strategy {
  id: string;
  name: string;
  executionPath: string[];
  successRate: number;
  failureRate: number;
  trustAverage: number;
  executions: number;
  evidenceIds: string[];
}
