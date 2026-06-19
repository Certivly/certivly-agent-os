import { FailureMemory } from "../../../brain/src/memory/FailureMemory";

export interface AvoidanceRule {
  strategyIdToAvoid: string | null;
  path: string[];
  failureRate: number;
  reason: string;
}

export class ExecutionPathAnalyzer {
  public analyzeDangerousPaths(failureMemory: FailureMemory): AvoidanceRule[] {
    const rules: AvoidanceRule[] = [];
    
    // Simplistic deterministic grouping of failed paths
    const pathFailures = new Map<string, number>();
    for (const record of failureMemory.getAll()) {
      const pathStr = record.executionPath.join(" -> ");
      pathFailures.set(pathStr, (pathFailures.get(pathStr) || 0) + 1);
    }

    for (const [pathStr, count] of pathFailures.entries()) {
      if (count >= 3) {
        rules.push({
          strategyIdToAvoid: null, // Mapped later by the Engine
          path: pathStr.split(" -> "),
          failureRate: 1.0, // Historical context assumes 100% fail here unless cross-ref'd
          reason: `Path historically failed ${count} times.`
        });
      }
    }

    return rules.sort((a, b) => a.path.join().localeCompare(b.path.join()));
  }
}
