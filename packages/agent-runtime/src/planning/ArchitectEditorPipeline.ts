import type { Model, GenerationRequest } from '@agent-os/providers';
import type { ToolRegistry } from '@agent-os/tools';
import type { LoggingEventBus } from '@agent-os/shared';

export interface ArchitectSpec {
  reasoning: string;
  filesToEdit: string[];
  proposedChanges: string;
}

export interface ArchitectEditorResult {
  success: boolean;
  architectSpec: ArchitectSpec;
  editorResponse: string;
  filesModified: string[];
  totalTurns: number;
}

export class ArchitectEditorPipeline {
  constructor(
    private architectModel: Model,
    private editorModel: Model,
    private toolRegistry: ToolRegistry,
    private eventBus?: LoggingEventBus
  ) {}

  public async runDualModel(
    goal: string,
    context?: {
      repoMap?: string;
      fileContents?: Record<string, string>;
      workspaceRoot?: string;
    }
  ): Promise<ArchitectEditorResult> {
    const wsRoot = context?.workspaceRoot || process.cwd();

    // 1. Architect Turn: High-reasoning model designs change
    const architectPrompt = `You are the Architect Model.
Your goal is to thoroughly design the solution for:
${goal}

[Repository Context]:
${context?.repoMap || 'No repository map provided.'}

Analyze the requirements, explain the design rationale, identify the exact files that must be modified, and describe the surgical code edits required.`;

    const architectReq: GenerationRequest = {
      systemPrompt: 'You are an elite Software Architect. Focus on deep reasoning, system design, and exact file specifications. Do not generate raw tool calls; provide clear architectural instructions.',
      messages: [{ role: 'user', content: architectPrompt }],
    };

    if (this.eventBus) {
      this.eventBus.publish('architect.design.started', { goal });
    }

    const architectResp = await this.architectModel.generate(architectReq);
    const architectText = architectResp.text || '';

    // Extract files to edit from architect response
    const fileMatches = Array.from(architectText.matchAll(/(?:file|path|modify|edit):\s*([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9]+)/gi));
    const extractedFiles = Array.from(new Set(fileMatches.map(m => m[1])));

    const architectSpec: ArchitectSpec = {
      reasoning: architectText,
      filesToEdit: extractedFiles,
      proposedChanges: architectText,
    };

    if (this.eventBus) {
      this.eventBus.publish('architect.design.completed', {
        filesToEdit: extractedFiles,
      });
    }

    // 2. Editor Turn: Fast model translates Architect instructions into edits
    const editorPrompt = `You are the Editor Model.
The Architect has designed the following solution:

${architectText}

Your task is to implement these exact changes using surgical code editing tools (edit_file / apply_patch / write_file).
Proceed to execute the required edits.`;

    const toolSpecs = this.toolRegistry.list().map(t => ({
      name: t.spec.name,
      description: t.spec.description,
      parameters: t.spec.parameters as any,
    }));

    const editorReq: GenerationRequest = {
      systemPrompt: 'You are a surgical Code Editor. Implement the Architect specifications accurately.',
      messages: [{ role: 'user', content: editorPrompt }],
      tools: toolSpecs.length > 0 ? toolSpecs : undefined,
    };

    const editorResp = await this.editorModel.generate(editorReq);
    const filesModified: string[] = [];

    if (editorResp.toolCalls) {
      for (const tc of editorResp.toolCalls) {
        let args: Record<string, unknown> = {};
        try {
          args = typeof tc.args === 'string' ? JSON.parse(tc.args || '{}') : (tc.args || {});
        } catch (err: unknown) {
          const _errStr = err instanceof Error ? err.message : String(err);
          args = {};
        }

        const candidate = (args.path || args.filePath || args.targetFile || args.file) as string | undefined;
        if (candidate && !filesModified.includes(candidate)) {
          filesModified.push(candidate);
        }

        const tool = this.toolRegistry.get(tc.name);
        if (tool) {
          try {
            await tool.execute(args, { workspaceRoot: wsRoot });
          } catch (err: unknown) {
            // Record tool error in event bus if available
            const errStr = err instanceof Error ? err.message : String(err);
            if (this.eventBus) {
              this.eventBus.publish('editor.tool.error', { toolName: tc.name, error: errStr });
            }
          }
        }
      }
    }

    return {
      success: true,
      architectSpec,
      editorResponse: editorResp.text || '',
      filesModified: filesModified.length > 0 ? filesModified : extractedFiles,
      totalTurns: 2,
    };
  }
}
