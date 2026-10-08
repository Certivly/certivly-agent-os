import type { Model, GenerationRequest, ChatMessage } from '@agent-os/providers';
import { ToolRegistry } from '@agent-os/tools';

export interface ReviewSubagentResult {
  approved: boolean;
  issues: string[];
  summary: string;
  turnsUsed: number;
}

export class ReviewSubagent {
  private readonly MAX_TURNS = 3;
  private readonly ALLOWED_TOOLS = ['read_file'];

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

  async review(diff: string, verificationResult?: unknown): Promise<ReviewSubagentResult> {
    const readOnlyRegistry = this.getReadOnlyRegistry();

    const toolSpecs = readOnlyRegistry.toProviderToolSpecs().map((spec) => ({
      name: spec.name,
      description: spec.description,
      parameters: (spec.parameters as any) || { type: 'object', properties: {} },
    }));

    const systemPrompt = `You are an expert code reviewer. Return APPROVE or REQUEST_CHANGES with exact reason.
Inspect the diff and verification outcome.
Check for bugs, syntax errors, accidental deletions, missing tests, and security risks.
You have access only to read_file to inspect surrounding code if needed.
Do NOT attempt to edit files or run commands.
Respond with a JSON object:
{
  "approved": boolean,
  "issues": ["issue 1", "issue 2"],
  "summary": "Brief explanation of approval or required changes"
}`;

    const userMessageContent = `Review this pending changeset:\n\n--- Diff ---\n${diff}\n\n--- Verification ---\n${JSON.stringify(verificationResult || {})}`;

    const messages: ChatMessage[] = [
      {
        role: 'user',
        content: userMessageContent,
      },
    ];

    let turnsUsed = 0;
    let finalAnswer = '';

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
        break;
      }

      messages.push({
        role: 'assistant',
        content: response.text || '',
        toolCalls: modelToolCalls.map((tc) => ({
          id: tc.id,
          name: tc.name,
          args: typeof tc.args === 'string' ? tc.args : JSON.stringify(tc.args || {}),
        })),
      });

      for (const tc of modelToolCalls) {
        if (!this.ALLOWED_TOOLS.includes(tc.name)) {
          messages.push({
            role: 'tool',
            name: tc.name,
            toolCallId: tc.id,
            content: '[ReviewSubagent] Tool not permitted in review mode.',
          });
          continue;
        }

        try {
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

          let args: Record<string, unknown> = {};
          if (typeof tc.args === 'string') {
            try {
              args = JSON.parse(tc.args);
            } catch (parseErr) {
              args = {};
            }
          } else if (tc.args && typeof tc.args === 'object') {
            args = tc.args as Record<string, unknown>;
          }

          const result = await tool.execute(args, { workspaceRoot: this.workspaceRoot });
          const content = result.content || (result.isError ? 'failed' : 'success');

          messages.push({
            role: 'tool',
            name: tc.name,
            toolCallId: tc.id,
            content: typeof content === 'string' ? content : JSON.stringify(content),
          });
        } catch (err) {
          messages.push({
            role: 'tool',
            name: tc.name,
            toolCallId: tc.id,
            content: `Tool execution error: ${err instanceof Error ? err.message : String(err)}`,
          });
        }
      }
    }

    return this.parseReviewResult(finalAnswer, turnsUsed);
  }

  private parseReviewResult(rawText: string, turnsUsed: number): ReviewSubagentResult {
    // Try to extract JSON from rawText
    const jsonMatch = rawText.match(/\{[\s\S]*"approved"[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          approved: Boolean(parsed.approved),
          issues: Array.isArray(parsed.issues) ? parsed.issues.map(String) : [],
          summary: String(parsed.summary || (parsed.approved ? 'Approved' : 'Changes requested')),
          turnsUsed,
        };
      } catch (parseErr) {
        // Fall back to text parsing if JSON parse fails
      }
    }

    const isApproved = /APPROVE/i.test(rawText) && !/REQUEST_CHANGES/i.test(rawText);
    const issues: string[] = [];
    if (!isApproved) {
      issues.push(rawText.trim() || 'Review failed with unspecified issues');
    }

    return {
      approved: isApproved,
      issues,
      summary: rawText.trim() || (isApproved ? 'Approved' : 'Changes requested'),
      turnsUsed,
    };
  }
}
