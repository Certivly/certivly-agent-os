import { AgentError } from '@agent-os/shared';

export class SandboxError extends AgentError {
  constructor(message: string, code: string = 'SANDBOX_ERROR') {
    super(message, code);
  }
}

export class SandboxCreationError extends SandboxError {
  constructor(message: string) {
    super(message, 'SANDBOX_CREATION_ERROR');
  }
}

export class SandboxExecutionError extends SandboxError {
  constructor(message: string) {
    super(message, 'SANDBOX_EXECUTION_ERROR');
  }
}

export class SandboxTimeoutError extends SandboxError {
  constructor(message: string = 'Sandbox Execution Timeout Exceeded') {
    super(message, 'SANDBOX_TIMEOUT_ERROR');
  }
}

export class SandboxValidationError extends SandboxError {
  constructor(message: string) {
    super(message, 'SANDBOX_VALIDATION_ERROR');
  }
}

export class SandboxPatchError extends SandboxError {
  constructor(message: string) {
    super(message, 'SANDBOX_PATCH_ERROR');
  }
}
