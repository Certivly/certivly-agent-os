import { CommandPolicyEngine } from '@agent-os/tools';
import { SandboxExecutionError } from './SandboxErrors';
import { Sandbox, ExecutionOptions, ExecutionResult } from './models';

export class CommandExecutor {
  constructor(
    private sandbox: Sandbox,
    private policyEngine: CommandPolicyEngine
  ) {}

  /**
   * Executes a command within the sandbox after checking the policy engine.
   */
  public async executeSafe(command: string, options?: ExecutionOptions): Promise<ExecutionResult> {
    const decision = await this.policyEngine.evaluate(command);
    if (!decision.allowed) {
      throw new SandboxExecutionError(`Command rejected by policy: ${decision.reason || 'Unknown reason'}`);
    }

    return this.sandbox.execute(command, options);
  }
}
