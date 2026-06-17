export class AgentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AgentError';
  }
}

export class ProviderError extends AgentError {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderError';
  }
}

export class ToolError extends AgentError {
  constructor(message: string) {
    super(message);
    this.name = 'ToolError';
  }
}

export class SessionError extends AgentError {
  constructor(message: string) {
    super(message);
    this.name = 'SessionError';
  }
}

export class ConfigError extends AgentError {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export class RuntimeError extends AgentError {
  constructor(message: string) {
    super(message);
    this.name = 'RuntimeError';
  }
}
