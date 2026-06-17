import { OptimizationCandidate } from '../analyzer/types';
import { OptimizationPlan } from './types';

export class OptimizationPlanner {
  public createPlan(candidates: OptimizationCandidate[]): OptimizationPlan {
    const actions = candidates.map(c => ({
      type: c.type,
      targetSkillId: c.skillId,
      parameters: {}
    }));

    // Target skills are unique skillIds from candidates
    const targetSkills = Array.from(new Set(candidates.map(c => c.skillId))).sort();

    return {
      id: crypto.randomUUID(),
      targetSkills,
      actions,
      expectedSavings: {
        latencyMs: actions.some(a => a.type === 'WICER_MEMOIZATION') ? 25 : 0,
        graphReads: actions.some(a => a.type === 'GRAPH_REUSE') ? 5 : 0,
        wicerReads: actions.some(a => a.type === 'WICER_MEMOIZATION') ? 2 : 0
      }
    };
  }
}
