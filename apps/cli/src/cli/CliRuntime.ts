import { AgentRuntime, type PermissionMode, type ApprovalHandler } from '@agent-os/agent-runtime';
import { commandPolicyEngine } from '@agent-os/tools';
import { SessionStateManager } from '../state/CliSessionState';

export interface CliRuntimeOptions {
  configPath: string;
  debug?: boolean;
  permissionMode?: PermissionMode;
  requestApproval?: ApprovalHandler;
}

export class CliRuntime {
  public readonly agentRuntime: AgentRuntime;
  public readonly stateManager: SessionStateManager;
  public readonly debug: boolean;

  constructor(options: CliRuntimeOptions, sessionId: string) {
    if (options.requestApproval) {
      commandPolicyEngine.setApprovalCallback(async (cmd: string) => {
        const res = await options.requestApproval!({
          sessionId,
          toolName: 'run_command',
          args: { command: cmd },
          reason: `Policy approval required to run: ${cmd}`,
          toolCallId: `cmd-policy-${Date.now()}`,
        });
        return res.approved;
      });
    }

    this.agentRuntime = new AgentRuntime({
      configPath: options.configPath,
      workspaceRoot: process.cwd(),
      permissionMode: options.permissionMode,
      requestApproval: options.requestApproval,
    }, sessionId);
    this.stateManager = new SessionStateManager(sessionId);
    this.debug = options.debug || false;
  }
}
