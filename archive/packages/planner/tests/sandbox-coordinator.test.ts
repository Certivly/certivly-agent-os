import { describe, it, expect, mock } from "bun:test";
import { SandboxCoordinator } from "../src/SandboxCoordinator";
import { SandboxManager } from "@agent-os/sandbox";

describe("SandboxCoordinator", () => {
  it("should acquire and release a sandbox securely", async () => {
    // Mock the SandboxManager
    const manager = {
      createSandbox: mock(async () => "sandbox-123"),
      destroySandbox: mock(async () => undefined),
      getSandbox: mock(() => ({
        executeCommand: mock(async () => "executed")
      }))
    } as unknown as SandboxManager;

    const coordinator = new SandboxCoordinator(manager);

    const sandboxId = await coordinator.acquireSandbox("plan-1", { type: "local" });
    expect(sandboxId).toBe("sandbox-123");

    const result = await coordinator.executeInSandbox(sandboxId, "echo 'hello'");
    expect(result).toBe("executed");

    await coordinator.releaseSandbox(sandboxId);
    expect(manager.destroySandbox).toHaveBeenCalledWith("sandbox-123");
  });
});
