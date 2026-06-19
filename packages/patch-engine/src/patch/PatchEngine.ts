import { Patch } from "../models/Patch";
import { PatchValidator } from "./PatchValidator";
import { PatchExecutor } from "./PatchExecutor";
import { PatchRollback } from "./PatchRollback";
import { PatchStore } from "../store/PatchStore";
import { WorkspaceSnapshot } from "../workspace/WorkspaceSnapshot";
import { PatchLineageTracker } from "../lineage/PatchLineage";

export class PatchEngine {
  constructor(
    private validator: PatchValidator,
    private executor: PatchExecutor,
    private rollbackEngine: PatchRollback,
    private store: PatchStore,
    private lineage: PatchLineageTracker
  ) {}

  public async apply(patch: Patch): Promise<{ success: boolean; reason?: string }> {
    // 1. Validate
    const validation = this.validator.validate(patch);
    if (!validation.valid) {
      return { success: false, reason: validation.reason };
    }

    // 2. Snapshot
    const preSnapshot = new WorkspaceSnapshot("v1");
    await preSnapshot.captureFull();
    this.rollbackEngine.registerSnapshot(patch.id, preSnapshot);
    const affectedFiles = patch.files.map(f => f.path);

    // 3. Execute
    try {
      this.executor.execute(patch);
    } catch (e: any) {
      await this.rollbackEngine.rollback(patch.id);
      return { success: false, reason: `Execution failed: ${e.message}` };
    }

    // 4. Lineage and Storage
    this.lineage.record({
      patchId: patch.id,
      goalId: patch.goalId,
      strategyId: patch.strategyId,
      fileIds: affectedFiles
    });
    await this.store.save(patch);

    return { success: true };
  }

  public async rollback(patchId: string): Promise<boolean> {
    return this.rollbackEngine.rollback(patchId);
  }
}
