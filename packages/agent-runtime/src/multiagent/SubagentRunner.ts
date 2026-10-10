import type { Model, GenerationRequest, ToolCallRef } from '@agent-os/providers';
import { ToolRegistry } from '@agent-os/tools';
import type { LoggingEventBus } from '@agent-os/shared';
import type { SubagentDefinition, SubagentExecutionOptions, SubagentExecutionResult } from './SubagentModel';

export class SubagentRunner {
  constructor(
    private model: Model,
    private baseToolRegistry: ToolRegistry,
    private eventBus?: LoggingEventBus,
    private options?: { workspaceRoot?: string; fastModel?: Model; reviewModel?: Model }
  ) {}

  public async runSubagent(
    definition: SubagentDefinition,
    task: string,
    execOptions?: SubagentExecutionOptions
  ): Promise<SubagentExecutionResult> {
    const startTime = Date.now();
    const sessionId = execOptions?.sessionId || `subagent-${definition.name}-${Date.now()}`;
    const maxTurns = execOptions?.maxTurns || definition.maxTurns || 10;
    const workspaceRoot = execOptions?.workspaceRoot || this.options?.workspaceRoot || process.cwd();

    // Select model role
    let activeModel = this.model;
    if (definition.modelRole === 'fast' && this.options?.fastModel) {
      activeModel = this.options.fastModel;
    } else if (definition.modelRole === 'review' && this.options?.reviewModel) {
      activeModel = this.options.reviewModel;
    }

    // Build scoped tool registry containing strictly allowed tools
    const scopedTools = this.baseToolRegistry.list().filter(t => definition.tools.includes(t.spec.name));
    const toolSpecs = scopedTools.map(t => ({
      name: t.spec.name,
      description: t.spec.description,
      parameters: t.spec.parameters as any,
    }));

    if (this.eventBus) {
      this.eventBus.publish('subagent.started', {
        sessionId,
        agentName: definition.name,
        role: definition.role,
        task,
      });
    }

    const toolsExecuted: string[] = [];
    const filesInspected = new Set<string>();
    const filesModified = new Set<string>();
    const errors: string[] = [];

    const messages: any[] = [
      {
        role: 'user',
        content: execOptions?.initialContext
          ? `[Task for ${definition.name} Subagent]\n${task}\n\n[Provided Context]:\n${JSON.stringify(execOptions.initialContext, null, 2)}`
          : `[Task for ${definition.name} Subagent]\n${task}`,
      },
    ];

    let turnsUsed = 0;
    let finalText = '';

    while (turnsUsed < maxTurns) {
      turnsUsed++;

      const req: GenerationRequest = {
        systemPrompt: definition.systemPrompt,
        messages,
        tools: toolSpecs.length > 0 ? toolSpecs : undefined,
        signal: execOptions?.abortSignal,
      };

      try {
        const resp = await activeModel.generate(req);
        if (resp.text) {
          finalText = resp.text;
        }

        const toolCalls = resp.toolCalls || [];
        if (toolCalls.length === 0) {
          // Subagent completed without requesting further tools
          break;
        }

        // Record assistant turn
        messages.push({
          role: 'assistant',
          content: resp.text || '',
          toolCalls: toolCalls.map(tc => ({ id: tc.id, name: tc.name, args: tc.args })),
        });

        // Execute scoped tools
        for (const tc of toolCalls) {
          toolsExecuted.push(tc.name);
          const tool = scopedTools.find(t => t.spec.name === tc.name);

          if (!tool) {
            messages.push({
              role: 'tool',
              name: tc.name,
              toolCallId: tc.id,
              content: `Error: Tool "${tc.name}" is not permitted for subagent "${definition.name}". Allowed tools: ${definition.tools.join(', ')}`,
              isError: true,
            });
            errors.push(`Tool ${tc.name} blocked by subagent policy`);
            continue;
          }

          let parsedArgs: Record<string, unknown> = {};
          try {
            if (typeof tc.args === 'string') {
              parsedArgs = JSON.parse(tc.args || '{}');
            } else if (tc.args && typeof tc.args === 'object') {
              parsedArgs = tc.args as Record<string, unknown>;
            }
          } catch (err: unknown) {
            parsedArgs = {};
            const parseErr = err instanceof Error ? err.message : String(err);
            errors.push(`Failed to parse arguments for tool ${tc.name}: ${parseErr}`);
          }

          const targetFile = (parsedArgs.path || parsedArgs.filePath || parsedArgs.targetFile || parsedArgs.file) as string | undefined;
          if (targetFile && typeof targetFile === 'string') {
            if (tc.name.includes('edit') || tc.name.includes('write') || tc.name.includes('patch') || tc.name.includes('delete')) {
              filesModified.add(targetFile);
            } else {
              filesInspected.add(targetFile);
            }
          }

          try {
            const result = await tool.execute(parsedArgs, { workspaceRoot });
            messages.push({
              role: 'tool',
              name: tc.name,
              toolCallId: tc.id,
              content: result.content,
              isError: result.isError,
            });
          } catch (err: unknown) {
            const errStr = err instanceof Error ? err.message : String(err);
            errors.push(errStr);
            messages.push({
              role: 'tool',
              name: tc.name,
              toolCallId: tc.id,
              content: `Tool Execution Error: ${errStr}`,
              isError: true,
            });
          }
        }
      } catch (err: unknown) {
        const errStr = err instanceof Error ? err.message : String(err);
        errors.push(errStr);
        break;
      }
    }

    const durationMs = Date.now() - startTime;
    const result: SubagentExecutionResult = {
      agentName: definition.name,
      task,
      success: errors.length === 0,
      finalText: finalText || (errors.length > 0 ? `Subagent finished with errors: ${errors.join('; ')}` : 'Subagent execution complete.'),
      turnsUsed,
      toolsExecuted,
      filesInspected: Array.from(filesInspected),
      filesModified: Array.from(filesModified),
      errors,
      durationMs,
    };

    if (this.eventBus) {
      this.eventBus.publish('subagent.completed', {
        sessionId,
        agentName: definition.name,
        success: result.success,
        turnsUsed,
        durationMs,
      });
    }

    return result;
  }
}
