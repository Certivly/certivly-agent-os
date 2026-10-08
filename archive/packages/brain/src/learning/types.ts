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

export interface OptimizationAction {
  type: OptimizationCandidateType;
  targetSkillId: string;
  parameters: Record<string, any>;
}

export interface OptimizationPlan {
  id: string;
  targetSkills: string[];
  actions: OptimizationAction[];
  expectedSavings: {
    latencyMs: number;
    graphReads: number;
    wicerReads: number;
  };
}

export const OptimizationEvents = {
  PROFILE_GENERATED:     'optimization.profile.generated',
  CANDIDATE_DETECTED:    'optimization.candidate.detected',
  PLAN_GENERATED:        'optimization.plan.generated',
  VALIDATION_STARTED:    'optimization.validation.started',
  VALIDATION_PASSED:     'optimization.validation.passed',
  VALIDATION_FAILED:     'optimization.validation.failed',
  OPTIMIZATION_ACTIVATED:'optimization.activated',
  OPTIMIZATION_REJECTED: 'optimization.rejected'
} as const;

export interface SkillContext {
  [key: string]: any;
}

export interface SkillResult {
  success: boolean;
  data?: any;
  error?: string;
  metadata?: Record<string, any>;
  events?: any[];
  graphReferences?: any[];
  wicerReferences?: any[];
}

export interface Skill {
  id: string;
  name: string;
  version: number;
  level?: any;
  inputSchema?: object;
  outputSchema?: object;
  requires?: any[];
  execute(input: any, context?: SkillContext): Promise<SkillResult>;
}
