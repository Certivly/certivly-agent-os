import { SuccessRecord } from "../models/SuccessRecord";

export class SuccessMemory {
  private records: Map<string, SuccessRecord> = new Map();

  public store(record: SuccessRecord): void {
    // Only accept trustScore >= 90
    if (record.trustScore >= 90) {
      this.records.set(record.id, record);
    }
  }

  public getAll(): SuccessRecord[] {
    return Array.from(this.records.values()).sort((a, b) => b.timestamp - a.timestamp); // newest first
  }

  public getByGoalId(goalId: string): SuccessRecord[] {
    return this.getAll().filter(r => r.goalId === goalId);
  }
}
