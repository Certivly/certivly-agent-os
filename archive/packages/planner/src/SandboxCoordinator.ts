import { SandboxManager } from "@agent-os/sandbox";

export class SandboxCoordinator {
  constructor(private manager: SandboxManager) {}

  public async acquireSandbox(planId: string, requirements: any): Promise<string> {
    // Determine which sandbox to spin up
    const sandbox = await this.manager.createSandbox(requirements.type || "local");
    return typeof sandbox === "string" ? sandbox : sandbox.id;
  }

  public async releaseSandbox(sandboxId: string): Promise<void> {
    await this.manager.destroySandbox(sandboxId);
  }

  public async executeInSandbox(sandboxId: string, command: string): Promise<any> {
    const sandbox = this.manager.getSandbox(sandboxId);
    if (!sandbox) {
      throw new Error(`Sandbox ${sandboxId} not found`);
    }
    if (typeof sandbox.execute === "function") {
      return sandbox.execute(command);
    }
    if (typeof (sandbox as any).executeCommand === "function") {
      return (sandbox as any).executeCommand(command);
    }
    throw new Error(`Sandbox ${sandboxId} cannot execute commands`);
  }
}
