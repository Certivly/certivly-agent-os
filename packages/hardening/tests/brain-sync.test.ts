import { expect, test, describe } from "bun:test";
import { WorkspaceVersionManager } from "../../daemon/src/repositories/WorkspaceVersionManager";

describe("Brain Sync", () => {
  test("commits atomic updates and validates sync correctly", () => {
    const manager = new WorkspaceVersionManager();
    
    expect(manager.validateSync()).toBe(true);
    
    manager.commitUpdate();
    
    const v = manager.getVersion();
    expect(v.graphVersion).toBe(1);
    expect(v.brainVersion).toBe(1);
    expect(manager.validateSync()).toBe(true);

    // Manually force mismatch to simulate partial update
    (manager as any).version.brainVersion = 0;
    expect(manager.validateSync()).toBe(false);
  });
});
