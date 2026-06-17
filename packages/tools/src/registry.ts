import { Tool } from './interface';
import { ToolError } from '@agent-os/shared';

export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();

  public register(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      throw new ToolError(`Tool ${tool.name} is already registered`);
    }
    this.tools.set(tool.name, tool);
  }

  public get(name: string): Tool {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new ToolError(`Tool ${name} not found`);
    }
    return tool;
  }

  public list(): Tool[] {
    return Array.from(this.tools.values());
  }

  public async invoke(name: string, args: Record<string, unknown>): Promise<string> {
    const tool = this.get(name);
    try {
      return await tool.execute(args);
    } catch (e: any) {
      throw new ToolError(`Tool execution failed for ${name}: ${e.message}`);
    }
  }
}
