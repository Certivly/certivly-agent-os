import { AgentRuntime } from '@agent-os/agent-runtime';
import { SessionStateManager } from '../state/CliSessionState';

export interface CliRuntimeOptions {
  configPath: string;
  debug?: boolean;
}

export class CliRuntime {
  public readonly agentRuntime: AgentRuntime;
  public readonly stateManager: SessionStateManager;
  public readonly debug: boolean;

  constructor(options: CliRuntimeOptions, sessionId: string) {
    this.agentRuntime = new AgentRuntime({ configPath: options.configPath }, sessionId);
    this.stateManager = new SessionStateManager(sessionId);
    this.debug = options.debug || false;
  }
}
