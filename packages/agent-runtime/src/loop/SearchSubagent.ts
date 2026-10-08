import * as path from 'path';
import type { Model, GenerationRequest } from '@agent-os/providers';
import { ToolRegistry } from '@agent-os/tools';

export interface SearchSubagentResult {
  rankedFiles: string[];   // paths ranked by relevance
  reason: string;          // why these files were selected
  turnsUsed: number;
}

export class SearchSubagent {
  private readonly MAX_TURNS = 5;
  private readonly ALLOWED_TOOLS = ['repo_map', 'read_file', 'grep', 'list_dir'];

  constructor(
    private model: Model,
    private toolRegistry: ToolRegistry,
    private workspaceRoot: string
  ) {}

  public getReadOnlyRegistry(): ToolRegistry {
    const readOnlyRegistry = new ToolRegistry();
    for (const tool of this.toolRegistry.list()) {
      if (this.ALLOWED_TOOLS.includes(tool.spec.name)) {
        readOnlyRegistry.register(tool);
      }
    }
    return readOnlyRegistry;
  }

  async search(query: string): Promise<SearchSubagentResult> {
    const readOnlyRegistry = this.getReadOnlyRegistry();

    const toolSpecs = readOnlyRegistry.toProviderToolSpecs().map((spec) => ({
      name: spec.name,
      description: spec.description,
      parameters: (spec.parameters as any) || { type: 'object', properties: {} },
    }));

    const systemPrompt = `You are a read-only code explorer. Find the files most relevant to: ${query}.
You have access only to read-only exploration tools (repo_map, read_file, grep, list_dir).
Do NOT attempt to write, edit, patch, or execute arbitrary commands.
When you identify the relevant files, respond with a JSON object:
{
  "rankedFiles": ["path/to/file1.ts", "path/to/file2.ts"],
  "reason": "explanation of why these files were selected"
}`;

    const messages: Array<{
      role: 'user' | 'assistant' | 'system' | 'tool';
      content: string;
      name?: string;
      toolCallId?: string;
    }> = [
      {
        role: 'user',
        content: `Find all files relevant to: ${query}`,
      },
    ];

    let turnsUsed = 0;
    let finalAnswer = '';
    const collectedFiles: string[] = [];
    let blockedCallNotice = '';

    while (turnsUsed < this.MAX_TURNS) {
      turnsUsed++;

      const req: GenerationRequest = {
        systemPrompt,
        messages,
        ...(toolSpecs.length > 0 ? { tools: toolSpecs } : {}),
      };

      const response = await this.model.generate(req);
      finalAnswer = response.text || '';

      const modelToolCalls = response.toolCalls;

      if (!modelToolCalls || modelToolCalls.length === 0) {
        // No tool calls - final response
        break;
      }

      // Add assistant message with tool calls to message history
      messages.push({
        role: 'assistant',
        content: response.text || '',
        name: undefined,
      });

      // Execute each tool call
      for (const tc of modelToolCalls) {
        if (!this.ALLOWED_TOOLS.includes(tc.name)) {
          const advisory = '[SearchSubagent] Tool not permitted in read-only mode.';
          blockedCallNotice = advisory;
          messages.push({
            role: 'tool',
            name: tc.name,
            toolCallId: tc.id,
            content: advisory,
          });
          continue;
        }

        const tool = readOnlyRegistry.get(tc.name);
        if (!tool) {
          messages.push({
            role: 'tool',
            name: tc.name,
            toolCallId: tc.id,
            content: `Tool ${tc.name} not found`,
          });
          continue;
        }

        let parsedArgs: Record<string, unknown> = {};
        if (typeof tc.args === 'string') {
          try {
            parsedArgs = JSON.parse(tc.args);
          } catch {
            parsedArgs = {};
          }
        } else if (tc.args && typeof tc.args === 'object') {
          parsedArgs = tc.args;
        }

        try {
          const result = await tool.execute(parsedArgs, { workspaceRoot: this.workspaceRoot });
          messages.push({
            role: 'tool',
            name: tc.name,
            toolCallId: tc.id,
            content: result.content,
          });
        } catch (err: any) {
          messages.push({
            role: 'tool',
            name: tc.name,
            toolCallId: tc.id,
            content: `Tool execution failed: ${err.message || String(err)}`,
          });
        }
      }
    }

    // Try parsing final JSON response
    const parsed = this.parseJsonResult(finalAnswer);
    if (parsed) {
      return {
        rankedFiles: parsed.rankedFiles,
        reason: parsed.reason,
        turnsUsed,
      };
    }

    const fallbackReason = blockedCallNotice || (finalAnswer ? finalAnswer.slice(0, 300) : 'Search completed with partial results');

    return {
      rankedFiles: collectedFiles,
      reason: fallbackReason,
      turnsUsed,
    };
  }

  private parseJsonResult(text: string): { rankedFiles: string[]; reason: string } | null {
    if (!text) return null;

    // Direct JSON parse
    try {
      const parsed = JSON.parse(text);
      if (parsed && Array.isArray(parsed.rankedFiles)) {
        return {
          rankedFiles: parsed.rankedFiles.map(String),
          reason: typeof parsed.reason === 'string' ? parsed.reason : 'Extracted from search result',
        };
      }
    } catch {}

    // Markdown block extract ```json ... ```
    const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (match) {
      try {
        const parsed = JSON.parse(match[1]);
        if (parsed && Array.isArray(parsed.rankedFiles)) {
          return {
            rankedFiles: parsed.rankedFiles.map(String),
            reason: typeof parsed.reason === 'string' ? parsed.reason : 'Extracted from markdown block',
          };
        }
      } catch {}
    }

    // Object regex extract \{[\s\S]*"rankedFiles"[\s\S]*\}
    const objMatch = text.match(/\{[\s\S]*"rankedFiles"[\s\S]*\}/);
    if (objMatch) {
      try {
        const parsed = JSON.parse(objMatch[0]);
        if (parsed && Array.isArray(parsed.rankedFiles)) {
          return {
            rankedFiles: parsed.rankedFiles.map(String),
            reason: typeof parsed.reason === 'string' ? parsed.reason : 'Extracted from object match',
          };
        }
      } catch {}
    }

    return null;
  }
}
