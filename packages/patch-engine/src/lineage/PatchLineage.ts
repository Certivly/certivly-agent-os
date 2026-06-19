export interface LineageRecord {
  patchId: string;
  goalId: string;
  strategyId?: string;
  planId?: string;
  fileIds: string[]; // Paths of files mutated
}

export class PatchLineageTracker {
  private records: Map<string, LineageRecord> = new Map();

  public record(lineage: LineageRecord): void {
    this.records.set(lineage.patchId, lineage);
  }

  public trace(patchId: string): LineageRecord | undefined {
    return this.records.get(patchId);
  }

  public getAllByGoal(goalId: string): LineageRecord[] {
    return Array.from(this.records.values()).filter(r => r.goalId === goalId);
  }
}
