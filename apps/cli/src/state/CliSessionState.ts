export type CliMode = 'chat' | 'command';

export interface CliSessionState {
  sessionId: string;
  activeMode: CliMode;
  selectedTraceTarget: string | null;
  lastCommand: string | null;
}

export class SessionStateManager {
  private state: CliSessionState;

  constructor(sessionId: string) {
    this.state = {
      sessionId,
      activeMode: 'chat',
      selectedTraceTarget: null,
      lastCommand: null
    };
  }

  public get getState(): CliSessionState {
    return this.state;
  }

  public setMode(mode: CliMode) {
    this.state.activeMode = mode;
  }

  public setTraceTarget(target: string | null) {
    this.state.selectedTraceTarget = target;
  }

  public setLastCommand(command: string) {
    this.state.lastCommand = command;
  }
}
