import { Patch, PatchOperation } from "../models/Patch";

export class PatchPlanner {
  public proposePatch(goalId: string, strategyId: string, operations: PatchOperation[], explanation: string): Patch {
    return {
      id: `patch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      goalId,
      strategyId,
      files: Array.from(new Set(operations.map(o => o.targetPath))).map(path => ({ path })),
      operations,
      explanation,
      createdAt: Date.now()
    };
  }
}
