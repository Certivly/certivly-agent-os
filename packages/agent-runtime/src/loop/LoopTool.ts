import type { Tool, WorkspaceTool, ToolContext, ToolResult } from '@agent-os/tools';

export interface LoopToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  readOnly: boolean;
}

export interface ToolExecutionResult {
  toolCallId: string;
  name: string;
  content: string;
  isError: boolean;
  metadata?: Record<string, unknown>;
  data?: any;
}

export interface LoopTool {
  spec: LoopToolSpec;
  requiresApproval(args: Record<string, unknown>): Promise<boolean> | boolean;
  execute(args: Record<string, unknown>, signal?: AbortSignal, toolCallId?: string): Promise<ToolExecutionResult>;
}

export function validateToolArguments(spec: LoopToolSpec, args: Record<string, unknown>): string[] {
  const errors: string[] = [];
  const params = spec.parameters || {};

  // Check required fields
  const required = Array.isArray(params.required) ? (params.required as string[]) : [];
  for (const field of required) {
    if (args[field] === undefined || args[field] === null) {
      errors.push(`Missing required argument: '${field}'`);
    }
  }

  // Check additionalProperties: false
  if (params.additionalProperties === false) {
    const properties = (params.properties && typeof params.properties === 'object')
      ? Object.keys(params.properties as Record<string, unknown>)
      : [];
    for (const key of Object.keys(args)) {
      if (!properties.includes(key)) {
        errors.push(`Unknown argument '${key}' not allowed by schema`);
      }
    }
  }

  return errors;
}

export class AdaptedLoopTool implements LoopTool {
  public spec: LoopToolSpec;
  private approvalPredicate?: (args: Record<string, unknown>) => boolean | Promise<boolean>;
  private workspaceTool?: WorkspaceTool;
  private legacyTool?: Tool;
  private workspaceRoot: string;

  constructor(
    tool: WorkspaceTool | Tool,
    options:
      | {
          readOnly?: boolean;
          parameters?: Record<string, unknown>;
          requiresApproval?: (args: Record<string, unknown>) => boolean | Promise<boolean>;
          workspaceRoot?: string;
        }
      | string = {}
  ) {
    const opts = typeof options === 'string' ? { workspaceRoot: options } : options || {};
    this.workspaceRoot = opts.workspaceRoot || process.cwd();
    if ('spec' in tool) {
      this.workspaceTool = tool;
      this.spec = {
        name: tool.spec.name,
        description: tool.spec.description,
        parameters: opts.parameters ?? tool.spec.parameters ?? { type: 'object', properties: {} },
        readOnly: opts.readOnly ?? tool.spec.readOnly ?? false,
      };
    } else {
      this.legacyTool = tool;
      this.spec = {
        name: tool.name,
        description: tool.description,
        parameters: opts.parameters ?? { type: 'object', properties: {} },
        readOnly: opts.readOnly ?? false,
      };
    }
    this.approvalPredicate = opts.requiresApproval;
  }

  public requiresApproval(args: Record<string, unknown>): boolean | Promise<boolean> {
    if (this.approvalPredicate) {
      return this.approvalPredicate(args);
    }
    if (this.workspaceTool) {
      return this.workspaceTool.requiresApproval(args, {
        workspaceRoot: this.workspaceRoot,
      });
    }
    return !this.spec.readOnly;
  }

  public async execute(
    args: Record<string, unknown>,
    signal?: AbortSignal,
    toolCallId: string = crypto.randomUUID()
  ): Promise<ToolExecutionResult> {
    if (signal?.aborted) {
      return {
        toolCallId,
        name: this.spec.name,
        content: 'Execution aborted',
        isError: true,
      };
    }

    try {
      if (this.workspaceTool) {
        const res = await this.workspaceTool.execute(args, {
          workspaceRoot: this.workspaceRoot,
          signal,
        });
        return {
          toolCallId,
          name: this.spec.name,
          content: res.content,
          isError: Boolean(res.isError),
          metadata: res.metadata,
          data: res.data,
        };
      }

      if (this.legacyTool) {
        const content = await this.legacyTool.execute(args as any);
        return {
          toolCallId,
          name: this.spec.name,
          content: typeof content === 'string' ? content : JSON.stringify(content),
          isError: false,
        };
      }

      throw new Error(`Tool ${this.spec.name} has no backing implementation`);
    } catch (err: any) {
      return {
        toolCallId,
        name: this.spec.name,
        content: err?.message ?? String(err),
        isError: true,
      };
    }
  }
}
