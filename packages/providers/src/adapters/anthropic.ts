import { Provider, Model, GenerationRequest, GenerationResponse } from '../interface';
import { ProviderError } from '@agent-os/shared';

class AnthropicModel implements Model {
  id: string;
  private apiKey: string;

  constructor(id: string, apiKey: string) {
    this.id = id;
    this.apiKey = apiKey;
  }

  async generate(request: GenerationRequest): Promise<GenerationResponse> {
    try {
      const system = request.systemPrompt;
      const messages: any[] = [];

      // Map roles to Anthropic Messages API format
      for (const msg of request.messages) {
        if (msg.role === 'system') {
          // In Anthropic Messages API, system prompt is a top-level parameter
          continue;
        }

        if (msg.role === 'tool') {
          // Anthropic represents tool results as a user message with a tool_result block
          messages.push({
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: msg.name || '',
                content: msg.content
              }
            ]
          });
        } else if (msg.role === 'assistant' && msg.name) {
          // Assistant tool call
          messages.push({
            role: 'assistant',
            content: [
              {
                type: 'text',
                text: msg.content || ''
              },
              {
                type: 'tool_use',
                id: msg.name,
                name: msg.name, // Simplistic mapping
                input: {} // Inputs are usually in args, but if we're just restoring history
              }
            ]
          });
        } else {
          // Standard user or assistant message
          messages.push({
            role: msg.role === 'system' ? 'user' : msg.role,
            content: msg.content
          });
        }
      }

      // Map tools to Anthropic format
      const tools = request.tools?.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters || { type: 'object', properties: {} }
      }));

      const body: any = {
        model: this.id,
        messages,
        max_tokens: 4096
      };

      if (system) {
        body.system = system;
      }

      if (tools && tools.length > 0) {
        body.tools = tools;
      }

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json() as any;
      let text = '';
      const toolCalls: any[] = [];

      if (data.content && Array.isArray(data.content)) {
        for (const block of data.content) {
          if (block.type === 'text') {
            text += block.text;
          } else if (block.type === 'tool_use') {
            toolCalls.push({
              id: block.id,
              name: block.name,
              args: JSON.stringify(block.input)
            });
          }
        }
      }

      return {
        text,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined
      };
    } catch (e: any) {
      throw new ProviderError(`Anthropic generation failed: ${e.message}`);
    }
  }

  // Simplistic stream generator that yields text chunks
  async *generateStream?(request: GenerationRequest): AsyncIterableIterator<any> {
    const response = await this.generate(request);
    yield response.text;
  }
}

export class AnthropicProvider implements Provider {
  name = 'anthropic';
  models: Model[];
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.ANTHROPIC_API_KEY || 'dummy-key';
    if (!apiKey && !process.env.ANTHROPIC_API_KEY) {
      console.warn("Warning: ANTHROPIC_API_KEY is missing. Anthropic API calls will fail.");
    }
    this.models = [
      new AnthropicModel('claude-3-5-sonnet-20241022', this.apiKey),
      new AnthropicModel('claude-3-opus-20240229', this.apiKey),
      new AnthropicModel('claude-3-sonnet-20240229', this.apiKey),
      new AnthropicModel('claude-3-haiku-20240307', this.apiKey),
    ];
  }

  getModel(id: string): Model {
    let model = this.models.find(m => m.id === id);
    if (!model) {
      model = new AnthropicModel(id, this.apiKey);
      this.models.push(model);
    }
    return model;
  }

  async checkHealth(): Promise<{ ok: boolean; error?: string }> {
    if (!this.apiKey || this.apiKey === 'dummy-key') {
      return { ok: false, error: 'ANTHROPIC_API_KEY not configured' };
    }
    return { ok: true };
  }
}
