export type OptimizationCandidateType =
  | 'WICER_MEMOIZATION'
  | 'GRAPH_REUSE'
  | 'DEPENDENCY_COLLAPSE'
  | 'CONTEXT_REUSE'
  | 'ROUTER_SIMPLIFICATION';

export interface OptimizationCandidate {
  skillId: string;
  type: OptimizationCandidateType;
  confidence: number;
  reason: string;
}
