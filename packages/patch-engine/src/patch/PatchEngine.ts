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
    private lineage: PatchLineageTracker,
    private sandboxManager?: any // Inject SandboxManager dynamically
  ) {}

  public async generatePatch(context: any): Promise<Patch> {
    if (!this.sandboxManager || !context || !context.sandboxId) {
      return {
        id: crypto.randomUUID(),
        goalId: context?.planId || 'unknown',
        files: [],
        operations: [],
        explanation: 'No sandbox active to generate patch.',
        createdAt: Date.now()
      };
    }

    try {
      const sandbox = this.sandboxManager.getSandbox(context.sandboxId);
      const filePatches = await sandbox.generatePatch();

      const patch: Patch = {
        id: crypto.randomUUID(),
        goalId: context.planId || 'unknown',
        files: filePatches.map((fp: any) => ({
          path: fp.filePath,
          originalHash: fp.beforeHash,
          newHash: fp.afterHash
        })),
        operations: filePatches.map((fp: any) => ({
          type: fp.beforeHash ? (fp.afterHash ? "MODIFY_FILE" : "DELETE_FILE") : "CREATE_FILE",
          targetPath: fp.filePath,
          payload: fp.diff
        })),
        explanation: `Generated diff of ${filePatches.length} file changes from sandbox.`,
        createdAt: Date.now()
      };

      return patch;
    } catch (e: any) {
      console.error("[PatchEngine] Failed to generate patch from sandbox:", e.message);
      return {
        id: crypto.randomUUID(),
        goalId: context.planId || 'unknown',
        files: [],
        operations: [],
        explanation: `Failed to generate patch: ${e.message}`,
        createdAt: Date.now()
      };
    }
  }

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
