import type { WorkspaceTool, ToolSpec, ToolContext, ToolResult } from '../types';
import type { McpServerConnection } from './McpServerConnection';
import type { McpToolDefinition } from './types';

export class McpToolBridge implements WorkspaceTool {
  public spec: ToolSpec;

  constructor(
    public readonly serverName: string,
    public readonly rawTool: McpToolDefinition,
    private connection: McpServerConnection
  ) {
    const isReadOnly = this.inferReadOnly(rawTool.name, rawTool.description);
    const namespacedName = `mcp__${serverName}__${rawTool.name}`;

    this.spec = {
      name: namespacedName,
      description: `[MCP Server: ${serverName}] ${rawTool.description || rawTool.name}`,
      parameters: (rawTool.inputSchema as Record<string, unknown>) || { type: 'object', properties: {} },
      readOnly: isReadOnly,
    };
  }

  public requiresApproval(): boolean {
    return !this.spec.readOnly;
  }

  public async execute(args: Record<string, unknown>, _context: ToolContext): Promise<ToolResult> {
    try {
      const rawResult = await this.connection.callTool(this.rawTool.name, args);

      const textParts: string[] = [];
      for (const block of rawResult.content || []) {
        if (block.type === 'text' && block.text) {
          textParts.push(block.text);
        } else if (block.type === 'image') {
          textParts.push(`[Image attachment: ${block.mimeType || 'unknown'}]`);
        } else if (block.type === 'resource' && block.text) {
          textParts.push(block.text);
        }
      }

      const content = textParts.join('\n').trim() || (rawResult.isError ? 'Tool returned error' : 'Success');
      return {
        content,
        isError: !!rawResult.isError,
      };
    } catch (err: any) {
      return {
        content: `MCP tool execution failed: ${err instanceof Error ? err.message : String(err)}`,
        isError: true,
      };
    }
  }

  private inferReadOnly(name: string, description?: string): boolean {
    const text = `${name} ${description || ''}`.toLowerCase();
    if (text.includes('read-only') || text.includes('readonly')) {
      return true;
    }
    const mutatingRegex = /\b(create|update|delete|drop|write|post|put|patch|modify|remove|insert|destroy|kill|alter|apply)\b/;
    return !mutatingRegex.test(text);
  }
}
