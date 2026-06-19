import { SuccessMemory } from "../../../brain/src/memory/SuccessMemory";
import { FailureMemory } from "../../../brain/src/memory/FailureMemory";
import { Strategy } from "../models/Strategy";

export class StrategyCompiler {
  constructor(
    private successMemory: SuccessMemory,
    private failureMemory: FailureMemory
  ) {}

  public compile(): Strategy[] {
    const pathStats = new Map<string, { 
      successes: number; 
      failures: number; 
      trustTotal: number; 
      evidenceIds: string[] 
    }>();

    // Process successes
    for (const record of this.successMemory.getAll()) {
      const pathStr = record.executionPath.join(" -> ");
      if (!pathStats.has(pathStr)) {
        pathStats.set(pathStr, { successes: 0, failures: 0, trustTotal: 0, evidenceIds: [] });
      }
      const stats = pathStats.get(pathStr)!;
      stats.successes++;
      stats.trustTotal += record.trustScore;
      stats.evidenceIds.push(record.id);
    }

    // Process failures
    for (const record of this.failureMemory.getAll()) {
      const pathStr = record.executionPath.join(" -> ");
      if (!pathStats.has(pathStr)) {
        pathStats.set(pathStr, { successes: 0, failures: 0, trustTotal: 0, evidenceIds: [] });
      }
      const stats = pathStats.get(pathStr)!;
      stats.failures++;
      stats.trustTotal += record.trustScore;
      stats.evidenceIds.push(record.id);
    }

    const strategies: Strategy[] = [];
    let idCounter = 1;

    for (const [pathStr, stats] of pathStats.entries()) {
      const executions = stats.successes + stats.failures;
      if (executions === 0) continue;

      strategies.push({
        id: `S-${idCounter.toString().padStart(4, "0")}`,
        name: `Strategy for ${pathStr}`,
        executionPath: pathStr.split(" -> "),
        successRate: stats.successes / executions,
        failureRate: stats.failures / executions,
        trustAverage: stats.trustTotal / executions,
        executions,
        evidenceIds: stats.evidenceIds
      });
      idCounter++;
    }

    // Sort deterministically by ID
    return strategies.sort((a, b) => a.id.localeCompare(b.id));
  }
}
