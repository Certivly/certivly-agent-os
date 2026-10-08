import { Provider, Model, GenerationRequest, GenerationResponse, ProviderError } from '../interface';
import OpenAI from 'openai';

import { toOpenAIMessages } from '../serialize/openaiMessages';
import { fetchWithRetry, classifyError } from '../http/retry';

export class LMStudioModel implements Model {
  id: string;
  baseUrl: string;
  private client: OpenAI;

  constructor(id: string, client: OpenAI, baseUrl: string = 'http://localhost:1234/v1') {
    this.id = id;
    this.client = client;
    this.baseUrl = baseUrl;
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
      throw classifyError(e, 'LM Studio');
    }
  }

  async *generateStream(request: GenerationRequest): AsyncIterableIterator<any> {
    for await (const event of this.stream(request)) {
      if (event.type === 'text_delta') {
        yield event.text;
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
      if (
        e.name === 'APIConnectionError' ||
        e.code === 'ECONNREFUSED' ||
        e.message?.includes('Connection error') ||
        e.message?.includes('fetch failed') ||
        e.message?.includes('ECONNREFUSED')
      ) {
        throw new ProviderError(`LM Studio unreachable at ${this.baseUrl}: ${e.message}`);
      }
      throw classifyError(e, 'LM Studio');
    }
  }
}

export class LMStudioProvider implements Provider {
  name = 'lmstudio';
  baseUrl: string;
  private client: OpenAI;
  models: Model[] = [];

  constructor(apiKey?: string, baseUrl?: string) {
    const key = apiKey || 'lm-studio';
    this.baseUrl = baseUrl || 'http://localhost:1234/v1';
    this.client = new OpenAI({
      apiKey: key,
      baseURL: this.baseUrl,
      maxRetries: 0,
      fetch: (url, init) =>
        fetchWithRetry(url, init || {}, {
          signal: init?.signal as AbortSignal,
          providerName: 'LM Studio',
        }),
    });
  }

  getModel(id: string): Model {
    let model: Model | undefined = this.models.find(m => m.id === id);
    if (!model) {
      model = new LMStudioModel(id, this.client, this.baseUrl);
      this.models.push(model);
    }
    return model;
  }

  async checkHealth(): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.client.models.list();
      return { ok: true };
    } catch (e: any) {
      return {
        ok: false,
        error: `LM Studio unreachable at ${this.baseUrl}: ${e.message}`
      };
    }
  }
}
