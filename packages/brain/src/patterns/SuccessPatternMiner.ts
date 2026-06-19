import { LearnedPattern } from "../models/LearnedPattern";
import { SuccessMemory } from "../memory/SuccessMemory";

export class SuccessPatternMiner {
  constructor(private memory: SuccessMemory) {}

  public mine(): LearnedPattern[] {
    const records = this.memory.getAll();
    const pathFrequencies = new Map<string, { count: number; evidenceIds: string[] }>();

    for (const record of records) {
      const pathStr = record.executionPath.join(" -> ");
      if (!pathFrequencies.has(pathStr)) {
        pathFrequencies.set(pathStr, { count: 0, evidenceIds: [] });
      }
      const entry = pathFrequencies.get(pathStr)!;
      entry.count++;
      entry.evidenceIds.push(record.id);
    }

    const patterns: LearnedPattern[] = [];
    for (const [pathStr, data] of pathFrequencies.entries()) {
      if (data.count >= 2) { // Minimal threshold for demonstration
        patterns.push({
          id: `pat_succ_${Math.abs(hashString(pathStr))}`,
          category: "success",
          description: `Successful execution path: ${pathStr}`,
          occurrences: data.count,
          confidence: data.count / records.length, // relative frequency as confidence
          evidenceIds: data.evidenceIds
        });
      }
    }

    return patterns.sort((a, b) => b.occurrences - a.occurrences || a.description.localeCompare(b.description));
  }
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}
