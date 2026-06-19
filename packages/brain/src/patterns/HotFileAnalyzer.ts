import { SuccessMemory } from "../memory/SuccessMemory";
import { FailureMemory } from "../memory/FailureMemory";

export interface FileHeat {
  filePath: string;
  changeCount: number;
  failureCount: number;
  successCount: number;
}

export class HotFileAnalyzer {
  constructor(
    private successMemory: SuccessMemory,
    private failureMemory: FailureMemory
  ) {}

  public analyze(): FileHeat[] {
    const heatMap = new Map<string, FileHeat>();

    const getOrInit = (filePath: string) => {
      if (!heatMap.has(filePath)) {
        heatMap.set(filePath, { filePath, changeCount: 0, failureCount: 0, successCount: 0 });
      }
      return heatMap.get(filePath)!;
    };

    for (const record of this.successMemory.getAll()) {
      for (const file of record.affectedFiles) {
        const heat = getOrInit(file);
        heat.changeCount++;
        heat.successCount++;
      }
    }

    for (const record of this.failureMemory.getAll()) {
      for (const file of record.affectedFiles) {
        const heat = getOrInit(file);
        heat.changeCount++;
        heat.failureCount++;
      }
    }

    return Array.from(heatMap.values()).sort((a, b) => {
      if (b.changeCount !== a.changeCount) return b.changeCount - a.changeCount;
      return a.filePath.localeCompare(b.filePath);
    });
  }
}
