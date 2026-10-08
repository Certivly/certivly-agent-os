import { Provider, Model, GenerationRequest, GenerationResponse } from '../interface';
import { ProviderError } from '@agent-os/shared';
import { toAnthropicMessages } from '../serialize/anthropicMessages';

export class AnthropicModel implements Model {
  id: string;
  private apiKey: string;
  private baseUrl: string;

  constructor(id: string, apiKey: string, baseUrl: string = 'https://api.anthropic.com') {
    this.id = id;
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  async generate(request: GenerationRequest): Promise<GenerationResponse> {
    try {
      const system = request.systemPrompt;
      const messages = toAnthropicMessages(request.messages);

      const tools = request.tools?.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters || { type: 'object', properties: {} },
      }));

      const body: any = {
        model: this.id,
        messages,
        max_tokens: request.maxOutputTokens || 8192,
      };

      if (system) {
        body.system = system;
      }

      if (tools && tools.length > 0) {
        body.tools = tools;
      }

      const startTime = Date.now();
      const response = await fetch(`${this.baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: request.signal,
      });
      const latencyMs = Date.now() - startTime;

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = (await response.json()) as any;
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
              args: JSON.stringify(block.input),
            });
          }
        }
      }

      const usage = data.usage
        ? {
            inputTokens: data.usage.input_tokens ?? 0,
            outputTokens: data.usage.output_tokens ?? 0,
            totalTokens: (data.usage.input_tokens ?? 0) + (data.usage.output_tokens ?? 0),
          }
        : undefined;

      return {
        text,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        usage,
        latencyMs,
      };
    } catch (e: any) {
      throw new ProviderError(`Anthropic generation failed: ${e.message}`);
    }
  }

  async *stream(request: GenerationRequest): AsyncIterable<any> {
    const system = request.systemPrompt;
    const messages = toAnthropicMessages(request.messages);

    const tools = request.tools?.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters || { type: 'object', properties: {} },
    }));

    const body: any = {
      model: this.id,
      messages,
      max_tokens: request.maxOutputTokens || 8192,
      stream: true,
    };
    if (system) body.system = system;
    if (tools && tools.length > 0) body.tools = tools;

    const response = await fetch(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: request.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new ProviderError(`Anthropic streaming failed HTTP ${response.status}: ${errorText}`);
    }

    async function* responseToLines(res: Response): AsyncIterable<string> {
      const reader = res.body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          yield line;
        }
      }
      if (buffer) {
        yield buffer;
      }
    }

    const { parseAnthropicSSEStream } = await import('../streaming/StreamParsers');
    yield* parseAnthropicSSEStream(responseToLines(response));
  }

  async *generateStream?(request: GenerationRequest): AsyncIterableIterator<any> {
    for await (const event of this.stream(request)) {
      if (event.type === 'text_delta') {
        yield event.text;
      } else if (event.type === 'tool_call_start') {
        yield `\n[Tool requested: ${event.name}]\n`;
      }
    }
  }
}

export class AnthropicProvider implements Provider {
  name = 'anthropic';
  models: Model[];
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey?: string, baseUrl?: string) {
    this.apiKey = apiKey || process.env.ANTHROPIC_API_KEY || 'dummy-key';
    this.baseUrl = (baseUrl || 'https://api.anthropic.com').replace(/\/+$/, '');
    if (!apiKey && !process.env.ANTHROPIC_API_KEY) {
      console.warn('Warning: ANTHROPIC_API_KEY is missing. Anthropic API calls will fail.');
    }
    this.models = [
      new AnthropicModel('claude-3-5-sonnet-20241022', this.apiKey, this.baseUrl),
      new AnthropicModel('claude-3-opus-20240229', this.apiKey, this.baseUrl),
      new AnthropicModel('claude-3-sonnet-20240229', this.apiKey, this.baseUrl),
      new AnthropicModel('claude-3-haiku-20240307', this.apiKey, this.baseUrl),
    ];
  }

  getModel(id: string): Model {
    let model = this.models.find((m) => m.id === id);
    if (!model) {
      model = new AnthropicModel(id, this.apiKey, this.baseUrl);
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
