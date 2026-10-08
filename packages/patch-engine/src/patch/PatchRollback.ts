import { WorkspaceSnapshot } from "../workspace/WorkspaceSnapshot";
import { ChangeSetApplier } from "./ChangeSetApplier";

export class PatchRollback {
  private applier = new ChangeSetApplier();

  constructor(private snapshots: Map<string, WorkspaceSnapshot> = new Map()) {}

  public registerSnapshot(patchId: string, snapshot: WorkspaceSnapshot): void {
    this.snapshots.set(patchId, snapshot);
  }

  public async rollback(patchId: string): Promise<boolean> {
    const snapshot = this.snapshots.get(patchId);
    if (!snapshot) return false;

    await snapshot.restore();
    return true;
  }

  public async rollbackChangeSet(workspaceRoot: string, backupId: string): Promise<boolean> {
    return this.applier.rollback(workspaceRoot, backupId);
  }
}
