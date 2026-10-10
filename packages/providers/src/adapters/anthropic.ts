import { Provider, Model, GenerationRequest, GenerationResponse } from '../interface';
import { toAnthropicMessages } from '../serialize/anthropicMessages';
import { fetchWithRetry, classifyError } from '../http/retry';

export class AnthropicModel implements Model {
  id: string;
  private apiKey: string;
  private baseUrl: string;
  private customHeaders?: Record<string, string>;
  private providerName: string;

  constructor(
    id: string,
    apiKey: string,
    baseUrl: string | URL = 'https://api.anthropic.com',
    customHeaders?: Record<string, string>,
    providerName: string = 'Anthropic'
  ) {
    this.id = id;
    this.apiKey = apiKey;
    this.baseUrl = String(baseUrl || 'https://api.anthropic.com').replace(/\/+$/, '');
    this.customHeaders = customHeaders;
    this.providerName = providerName;
  }

  private getEndpoint(): string {
    const clean = this.baseUrl.replace(/\/+$/, '');
    if (clean.endsWith('/messages')) return clean;
    if (clean.endsWith('/v1')) return `${clean}/messages`;
    return `${clean}/v1/messages`;
  }

  async generate(request: GenerationRequest): Promise<GenerationResponse> {
    try {
      const system = request.systemPrompt;
      const messages = toAnthropicMessages(request.messages);

      const tools = request.tools?.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters || { type: 'object', properties: {} },
        ...(t.cacheControl ? { cache_control: t.cacheControl } : {}),
      }));

      const body: any = {
        model: this.id,
        messages,
        max_tokens: request.maxOutputTokens || 8192,
      };

      if (system) {
        if (request.systemPromptCacheControl) {
          const systemBlocks: any[] = [
            {
              type: 'text',
              text: system,
              cache_control: request.systemPromptCacheControl,
            },
          ];
          if (request.dynamicSystemPrompt && request.dynamicSystemPrompt.trim()) {
            systemBlocks.push({
              type: 'text',
              text: request.dynamicSystemPrompt,
            });
          }
          body.system = systemBlocks;
        } else {
          body.system = request.dynamicSystemPrompt && request.dynamicSystemPrompt.trim()
            ? `${system}\n\n${request.dynamicSystemPrompt}`
            : system;
        }
      } else if (request.dynamicSystemPrompt && request.dynamicSystemPrompt.trim()) {
        body.system = request.dynamicSystemPrompt;
      }

      if (tools && tools.length > 0) {
        body.tools = tools;
      }

      const startTime = Date.now();
      const response = await fetchWithRetry(
        this.getEndpoint(),
        {
          method: 'POST',
          headers: {
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
            ...(this.customHeaders || {}),
          },
          body: JSON.stringify(body),
        },
        {
          signal: request.signal,
          providerName: this.providerName,
        }
      );
      const latencyMs = Date.now() - startTime;

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
            ...(data.usage.cache_read_input_tokens !== undefined
              ? { cacheReadInputTokens: data.usage.cache_read_input_tokens }
              : {}),
            ...(data.usage.cache_creation_input_tokens !== undefined
              ? { cacheCreationInputTokens: data.usage.cache_creation_input_tokens }
              : {}),
          }
        : undefined;

      return {
        text,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        usage,
        latencyMs,
      };
    } catch (e: any) {
      throw classifyError(e, this.providerName);
    }
  }

  async *stream(request: GenerationRequest): AsyncIterable<any> {
    const system = request.systemPrompt;
    const messages = toAnthropicMessages(request.messages);

    const tools = request.tools?.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters || { type: 'object', properties: {} },
      ...(t.cacheControl ? { cache_control: t.cacheControl } : {}),
    }));

    const body: any = {
      model: this.id,
      messages,
      max_tokens: request.maxOutputTokens || 8192,
      stream: true,
    };
    if (system) {
      if (request.systemPromptCacheControl) {
        body.system = [
          {
            type: 'text',
            text: system,
            cache_control: request.systemPromptCacheControl,
          },
        ];
      } else {
        body.system = system;
      }
    }
    if (tools && tools.length > 0) body.tools = tools;

    let response: Response;
    try {
      response = await fetchWithRetry(
        this.getEndpoint(),
        {
          method: 'POST',
          headers: {
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
            ...(this.customHeaders || {}),
          },
          body: JSON.stringify(body),
        },
        {
          signal: request.signal,
          providerName: this.providerName,
        }
      );
    } catch (err: any) {
      throw classifyError(err, this.providerName);
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
  name: string = 'anthropic';
  models: Model[];
  private apiKey: string;
  private baseUrl: string;
  private customHeaders?: Record<string, string>;

  constructor(apiKey?: string, baseUrl?: string | URL, customHeaders?: Record<string, string>, name: string = 'anthropic') {
    this.name = name;
    this.apiKey = apiKey || process.env.ANTHROPIC_API_KEY || 'dummy-key';
    this.baseUrl = String(baseUrl || 'https://api.anthropic.com').replace(/\/+$/, '');
    this.customHeaders = customHeaders;
    if (!apiKey && !process.env.ANTHROPIC_API_KEY && !baseUrl) {
      console.warn(`Warning: API key is missing for provider ${this.name}. Anthropic API calls may fail.`);
    }
    this.models = [
      new AnthropicModel('claude-3-5-sonnet-20241022', this.apiKey, this.baseUrl, this.customHeaders, this.name),
      new AnthropicModel('claude-3-opus-20240229', this.apiKey, this.baseUrl, this.customHeaders, this.name),
      new AnthropicModel('claude-3-sonnet-20240229', this.apiKey, this.baseUrl, this.customHeaders, this.name),
      new AnthropicModel('claude-3-haiku-20240307', this.apiKey, this.baseUrl, this.customHeaders, this.name),
    ];
  }

  getModel(id: string): Model {
    let model = this.models.find((m) => m.id === id);
    if (!model) {
      model = new AnthropicModel(id, this.apiKey, this.baseUrl, this.customHeaders, this.name);
      this.models.push(model);
    }
    return model;
  }

  async checkHealth(): Promise<{ ok: boolean; error?: string }> {
    if (!this.apiKey || this.apiKey === 'dummy-key') {
      if (this.baseUrl && !this.baseUrl.includes('api.anthropic.com')) {
        return { ok: true };
      }
      return { ok: false, error: `${this.name} API key not configured` };
    }
    return { ok: true };
  }
}
