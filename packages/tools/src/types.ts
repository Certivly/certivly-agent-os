export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  readOnly: boolean;
}

export interface ToolContext {
  workspaceRoot: string;
  cwd?: string;
  signal?: AbortSignal;
  approved?: boolean;
}

export interface ToolResult {
  content: string;
  metadata?: Record<string, unknown>;
  isError?: boolean;
  success?: boolean;
  data?: any;
}

export interface WorkspaceTool {
  spec: ToolSpec;
  requiresApproval(args: Record<string, unknown>, context?: ToolContext): boolean | Promise<boolean>;
  execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult>;
}
