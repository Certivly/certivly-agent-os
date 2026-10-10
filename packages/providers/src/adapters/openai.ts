import { Provider, Model, GenerationRequest, GenerationResponse } from '../interface';
import OpenAI from 'openai';

import { toOpenAIMessages } from '../serialize/openaiMessages';
import { fetchWithRetry, classifyError } from '../http/retry';

class OpenAIModel implements Model {
  id: string;
  private client: OpenAI;

  constructor(id: string, client: OpenAI) {
    this.id = id;
    this.client = client;
  }

  private getTokenLimitParams(request: GenerationRequest): Record<string, number> {
    if (!request.maxOutputTokens) return {};
    const isReasoning = this.id.startsWith('o1') || this.id.startsWith('o3');
    return isReasoning
      ? { max_completion_tokens: request.maxOutputTokens }
      : { max_tokens: request.maxOutputTokens };
  }

  async *stream(request: GenerationRequest): AsyncIterable<any> {
    try {
      const formattedMessages = toOpenAIMessages(request);

      const response = await this.client.chat.completions.create(
        {
          model: this.id,
          messages: formattedMessages as any,
          stream: true,
          stream_options: { include_usage: true },
          ...this.getTokenLimitParams(request),
          tools: request.tools?.length
            ? request.tools.map((t) => ({
                type: 'function' as const,
                function: {
                  name: t.name,
                  description: t.description,
                  parameters: t.parameters || { type: 'object', properties: {} },
                },
              }))
            : undefined,
        },
        request.signal ? { signal: request.signal } : undefined
      );

      const { parseOpenAIStream } = await import('../streaming/StreamParsers');
      yield* parseOpenAIStream(response as any);
    } catch (e: any) {
      throw classifyError(e, 'OpenAI');
    }
  }

  async *generateStream(request: GenerationRequest): AsyncIterableIterator<any> {
    for await (const event of this.stream(request)) {
      if (event.type === 'text_delta') {
        yield event.text;
      } else if (event.type === 'tool_call_start') {
        yield `\n[Tool requested: ${event.name}]\n`;
      }
    }
  }

  async generate(request: GenerationRequest): Promise<GenerationResponse> {
    try {
      const messages = toOpenAIMessages(request);

      const tools = request.tools?.map((t) => ({
        type: 'function' as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters || { type: 'object', properties: {} },
        },
      }));

      const startTime = Date.now();
      const response = await this.client.chat.completions.create(
        {
          model: this.id,
          messages: messages as any,
          ...this.getTokenLimitParams(request),
          tools: tools && tools.length > 0 ? tools : undefined,
        },
        request.signal ? { signal: request.signal } : undefined
      );
      const latencyMs = Date.now() - startTime;

      const message = response.choices[0].message;
      const usage = response.usage
        ? {
            inputTokens: response.usage.prompt_tokens,
            outputTokens: response.usage.completion_tokens,
            totalTokens: response.usage.total_tokens,
          }
        : undefined;

      return {
        text: message.content || '',
        toolCalls: message.tool_calls?.map(tc => ({
          id: tc.id,
          name: tc.function.name,
          args: tc.function.arguments
        })),
        usage,
        latencyMs,
      };
    } catch (e: any) {
      throw classifyError(e, 'OpenAI');
    }
  }
}

export class OpenAIProvider implements Provider {
  name: string = 'openai';
  private client: OpenAI;
  private baseUrl?: string;
  models: Model[];

  constructor(apiKey?: string, baseUrl?: string, defaultHeaders?: Record<string, string>, name: string = 'openai') {
    this.name = name;
    this.baseUrl = baseUrl;
    const key = apiKey || process.env.OPENAI_API_KEY;
    if (!key && !baseUrl) {
      console.warn(`Warning: API key is missing for provider ${this.name}. API calls may fail.`);
    }
    this.client = new OpenAI({
      apiKey: key || 'dummy-key',
      baseURL: baseUrl,
      defaultHeaders,
      maxRetries: 0,
      fetch: (url, init) =>
        fetchWithRetry(url, init || {}, {
          signal: init?.signal as AbortSignal,
          providerName: this.name,
        }),
    });
    this.models = [
      new OpenAIModel('gpt-4o', this.client),
      new OpenAIModel('gpt-4-turbo', this.client),
      new OpenAIModel('gpt-3.5-turbo', this.client),
    ];
  }

  getModel(id: string): Model {
    let model: Model | undefined = this.models.find(m => m.id === id);
    if (!model) {
      model = new OpenAIModel(id, this.client);
      this.models.push(model);
    }
    return model;
  }

  async checkHealth(): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.client.models.list();
      return { ok: true };
    } catch (e: any) {
      if (this.baseUrl && !this.baseUrl.includes('api.openai.com')) {
        const errMsg = `${e.message || ''} ${e.cause?.message || ''}`;
        if (
          e.status === 404 ||
          e.status === 405 ||
          e.status === 401 ||
          errMsg.includes('404') ||
          errMsg.includes('405') ||
          errMsg.includes('401')
        ) {
          return { ok: true };
        }
      }
      return { ok: false, error: `${this.name} unreachable: ${e.message}` };
    }
  }
}
