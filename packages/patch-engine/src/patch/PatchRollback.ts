import { WorkspaceSnapshot } from "../workspace/WorkspaceSnapshot";

export class PatchRollback {
  constructor(private snapshots: Map<string, WorkspaceSnapshot>) {}

  public registerSnapshot(patchId: string, snapshot: WorkspaceSnapshot): void {
    this.snapshots.set(patchId, snapshot);
  }

  public async rollback(patchId: string): Promise<boolean> {
    const snapshot = this.snapshots.get(patchId);
    if (!snapshot) return false;

    await snapshot.restore();
    return true;
  }
}
