import { AgentRuntime, type PermissionMode, type ApprovalHandler } from '@agent-os/agent-runtime';
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
    this.agentRuntime = new AgentRuntime({
      configPath: options.configPath,
      permissionMode: options.permissionMode,
      requestApproval: options.requestApproval,
    }, sessionId);
    this.stateManager = new SessionStateManager(sessionId);
    this.debug = options.debug || false;
  }
}
