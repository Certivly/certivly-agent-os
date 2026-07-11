import { FailureMemory } from '../memory/FailureMemory';
import { AvoidanceRule } from '../models';

export class ExecutionPathAnalyzer {
  public analyzeDangerousPaths(failureMemory: FailureMemory): AvoidanceRule[] {
    const pathFailures = new Map<string, number>();
    for (const record of failureMemory.getAll()) {
      const pathStr = record.executionPath.join(' -> ');
      pathFailures.set(pathStr, (pathFailures.get(pathStr) || 0) + 1);
    }

    const rules: AvoidanceRule[] = [];
    for (const [pathStr, count] of pathFailures.entries()) {
      if (count >= 3) {
        rules.push({
          strategyIdToAvoid: null,
          path: pathStr.split(' -> '),
          failureRate: 1.0,
          reason: `Path historically failed ${count} times.`
        });
      }
    }
    return rules.sort((a, b) => a.path.join().localeCompare(b.path.join()));
  }
}
