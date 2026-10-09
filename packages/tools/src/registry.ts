import { Tool } from './interface';
import { ToolError } from '@agent-os/shared';
import type { WorkspaceTool, ToolSpec, ToolContext, ToolResult } from './types';
import type { McpClientManager } from './mcp/McpClientManager';

function adaptLegacyTool(legacy: Tool): WorkspaceTool {
  const readOnlyNames = new Set(['read_file', 'list_files', 'search_files']);
  return {
    spec: {
      name: legacy.name,
      description: legacy.description,
      parameters: {},
      readOnly: readOnlyNames.has(legacy.name),
    },
    requiresApproval: () => !readOnlyNames.has(legacy.name),
    execute: async (args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> => {
      try {
        const content = await legacy.execute(args as any);
        return { content, isError: false };
      } catch (e: any) {
        return { content: e?.message || String(e), isError: true };
      }
    },
  };
}

export class ToolRegistry {
  private tools: Map<string, WorkspaceTool> = new Map();

  public register(tool: WorkspaceTool | Tool): void {
    const wsTool: WorkspaceTool = 'spec' in tool ? tool : adaptLegacyTool(tool);
    if (this.tools.has(wsTool.spec.name)) {
      throw new ToolError(`Tool ${wsTool.spec.name} is already registered`);
    }
    this.tools.set(wsTool.spec.name, wsTool);
  }

  public get(name: string): WorkspaceTool | undefined {
    return this.tools.get(name);
  }

  public list(): WorkspaceTool[] {
    return Array.from(this.tools.values()).sort((a, b) =>
      a.spec.name.localeCompare(b.spec.name)
    );
  }

  public toProviderToolSpecs(): ToolSpec[] {
    return this.list().map(t => t.spec);
  }

  public async invoke(name: string, args: Record<string, unknown>, context?: ToolContext): Promise<string> {
    const tool = this.get(name);
    if (!tool) {
      throw new ToolError(`Tool ${name} not found`);
    }
    try {
      const result = await tool.execute(args, context ?? { workspaceRoot: process.cwd() });
      if (result.isError) {
        throw new Error(result.content);
      }
      return result.content;
    } catch (e: any) {
      throw new ToolError(`Tool execution failed for ${name}: ${e.message}`);
    }
  }

  public async registerMcpManager(manager: McpClientManager): Promise<number> {
    const bridged = await manager.registerToolsIntoRegistry(this);
    return bridged.length;
  }
}
