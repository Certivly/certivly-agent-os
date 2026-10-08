import { Pattern, PatternSnapshot } from "./models";

export class PatternStore {
  private snapshots: PatternSnapshot[] = [];

  public saveSnapshot(snapshot: PatternSnapshot) {
    this.snapshots.push(snapshot);
  }

  public getLatestSnapshot(): PatternSnapshot | undefined {
    return this.snapshots[this.snapshots.length - 1];
  }
}
