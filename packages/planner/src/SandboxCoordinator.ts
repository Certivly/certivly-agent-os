import { SandboxManager } from "@agent-os/sandbox";

export class SandboxCoordinator {
  constructor(private manager: SandboxManager) {}

  public async acquireSandbox(planId: string, requirements: any): Promise<string> {
    // Determine which sandbox to spin up
    const sandboxId = await this.manager.createSandbox(
      requirements.type || "local",
      { isolated: true }
    );
    return sandboxId;
  }

  public async releaseSandbox(sandboxId: string): Promise<void> {
    await this.manager.destroySandbox(sandboxId);
  }

  public async executeInSandbox(sandboxId: string, command: string): Promise<any> {
    const sandbox = this.manager.getSandbox(sandboxId);
    if (!sandbox) {
      throw new Error(`Sandbox ${sandboxId} not found`);
    }
    return sandbox.executeCommand(command);
  }
}
