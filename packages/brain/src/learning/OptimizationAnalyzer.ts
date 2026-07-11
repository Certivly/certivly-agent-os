import { ExecutionProfile, OptimizationCandidate } from './types';

/** Analyzes execution profiles to produce optimization candidates. Moved from @agent-os/seol. */
export class OptimizationAnalyzer {
  public analyze(profiles: ExecutionProfile[]): OptimizationCandidate[] {
    const candidates: OptimizationCandidate[] = [];

    for (const profile of profiles) {
      if (profile.wicerReads > 1 || profile.avgDurationMs > 50) {
        candidates.push({
          skillId: profile.skillId,
          type: 'WICER_MEMOIZATION',
          confidence: 0.9,
          reason: `High latency (${profile.avgDurationMs}ms) or repeated WiCER reads detected.`
        });
      }
      if (profile.graphReads > 5) {
        candidates.push({
          skillId: profile.skillId,
          type: 'GRAPH_REUSE',
          confidence: 0.8,
          reason: `High graph read count (${profile.graphReads}) detected.`
        });
      }
    }

    return candidates.sort((a, b) => {
      const cmp = a.skillId.localeCompare(b.skillId);
      return cmp !== 0 ? cmp : a.type.localeCompare(b.type);
    });
  }
}
