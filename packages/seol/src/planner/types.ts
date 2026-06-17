import { OptimizationCandidateType } from '../analyzer/types';

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
