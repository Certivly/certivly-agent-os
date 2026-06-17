export interface ExecutionProfile {
  skillId: string;
  executionCount: number;
  avgDurationMs: number;
  avgMemoryUsage: number;
  graphReads: number;
  wicerReads: number;
  cacheHitRate: number;
  dependencyDepth: number;
}
