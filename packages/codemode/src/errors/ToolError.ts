export class ToolError extends Error {
  public readonly code: string;
  public readonly toolName?: string;
  public readonly details?: any;

  constructor(message: string, options: { code?: string; toolName?: string; details?: any } = {}) {
    super(message);
    this.name = 'ToolError';
    this.code = options.code ?? 'TOOL_ERROR';
    this.toolName = options.toolName;
    this.details = options.details;
  }

  public toJSON() {
    return {
      error: this.name,
      code: this.code,
      message: this.message,
      toolName: this.toolName,
      details: this.details,
    };
  }
}

export class ToolNotFoundError extends ToolError {
  constructor(toolName: string) {
    super(`Tool '${toolName}' not found in catalog`, {
      code: 'TOOL_NOT_FOUND',
      toolName,
    });
    this.name = 'ToolNotFoundError';
  }
}

export class ToolValidationError extends ToolError {
  constructor(toolName: string, validationIssues: string[]) {
    super(`Tool '${toolName}' validation failed: ${validationIssues.join('; ')}`, {
      code: 'TOOL_VALIDATION_ERROR',
      toolName,
      details: { issues: validationIssues },
    });
    this.name = 'ToolValidationError';
  }
}

export class ToolTimeoutError extends ToolError {
  constructor(toolName: string, timeoutMs: number) {
    super(`Tool '${toolName}' timed out after ${timeoutMs}ms`, {
      code: 'TOOL_TIMEOUT',
      toolName,
      details: { timeoutMs },
    });
    this.name = 'ToolTimeoutError';
  }
}

export class ToolExecutionError extends ToolError {
  constructor(toolName: string, message: string, cause?: any) {
    super(`Tool '${toolName}' execution failed: ${message}`, {
      code: 'TOOL_EXECUTION_ERROR',
      toolName,
      details: { cause: cause instanceof Error ? cause.message : cause },
    });
    this.name = 'ToolExecutionError';
  }
}
