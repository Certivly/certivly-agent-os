import { FailureRecord } from '../models';

export class FailureMemory {
  private records: Map<string, FailureRecord> = new Map();

  public store(record: FailureRecord): void {
    this.records.set(record.id, record);
  }

  public getAll(): FailureRecord[] {
    return Array.from(this.records.values()).sort((a, b) => b.timestamp - a.timestamp);
  }

  public getByGoalId(goalId: string): FailureRecord[] {
    return this.getAll().filter(r => r.goalId === goalId);
  }
}
