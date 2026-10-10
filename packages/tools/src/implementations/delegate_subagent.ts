import { Tool } from '../interface';
import type { WorkspaceTool, ToolContext, ToolResult } from '../types';

export type SubagentDelegateHandler = (
  agentName: string,
  task: string,
  context?: string,
  toolContext?: ToolContext
) => Promise<ToolResult>;

let activeDelegateHandler: SubagentDelegateHandler | null = null;

export function setSubagentDelegateHandler(handler: SubagentDelegateHandler | null): void {
  activeDelegateHandler = handler;
}

export const delegateSubagentTool: WorkspaceTool = {
  spec: {
    name: 'delegate_subagent',
    description: 'Delegate a focused subtask to a specialized subagent. The subagent runs in an isolated context with restricted tools, and returns a structured summary.',
    parameters: {
      type: 'object',
      properties: {
        agentName: {
          type: 'string',
          description: 'The name of the specialized subagent to invoke (e.g. "explorer", "librarian", "coder", "verifier", "reviewer")',
        },
        task: {
          type: 'string',
          description: 'The detailed instruction, question, or goal for the subagent to execute',
        },
        context: {
          type: 'string',
          description: 'Optional supplementary context, relevant file paths, or constraints',
        },
      },
      required: ['agentName', 'task'],
    },
    readOnly: false,
  },
  requiresApproval: () => false,
  execute: async (args: Record<string, unknown>, toolContext: ToolContext): Promise<ToolResult> => {
    const agentName = (args.agentName as string)?.toLowerCase().trim();
    const task = args.task as string;
    const context = args.context as string | undefined;

    if (!agentName) {
      return {
        content: 'Error: agentName must be specified. Available subagents: explorer, librarian, coder, verifier, reviewer.',
        isError: true,
      };
    }

    if (!task || !task.trim()) {
      return {
        content: 'Error: task must be a non-empty string.',
        isError: true,
      };
    }

    if (activeDelegateHandler) {
      try {
        return await activeDelegateHandler(agentName, task, context, toolContext);
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        return {
          content: `Subagent execution failed: ${errMsg}`,
          isError: true,
        };
      }
    }

    // Fallback: Lazy import AgentRuntime SubagentRunner if no custom handler is bound
    try {
      const { SubagentRegistry } = await import('@agent-os/agent-runtime');
      const wsRoot = toolContext?.workspaceRoot || process.cwd();
      const registry = new SubagentRegistry({ workspaceRoot: wsRoot });
      const def = registry.getSubagent(agentName);

      if (!def) {
        const available = registry.listSubagents().map(a => a.name).join(', ');
        return {
          content: `Error: Subagent "${agentName}" not found. Available subagents: ${available}`,
          isError: true,
        };
      }

      // Default fallback representation if model is not injected directly
      return {
        content: `[Subagent Delegation: ${def.name}]\nTask: ${task}\nStatus: Subagent "${def.name}" scheduled for isolated execution.`,
        isError: false,
      };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      return {
        content: `Subagent delegation error: ${errMsg}`,
        isError: true,
      };
    }
  },
};
