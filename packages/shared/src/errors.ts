export class AgentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AgentError';
  }
}

export class ProviderError extends AgentError {
  public readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'ProviderError';
    this.cause = cause;
  }
}

export class AuthError extends ProviderError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = 'AuthError';
  }
}

export class RateLimitError extends ProviderError {
  public readonly retryAfterMs?: number;

  constructor(message: string, retryAfterMs?: number, cause?: unknown) {
    super(message, cause);
    this.name = 'RateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

export class ContextLengthError extends ProviderError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = 'ContextLengthError';
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
