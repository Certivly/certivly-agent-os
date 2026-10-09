import { Provider, Model, GenerationRequest, GenerationResponse } from '../interface';
import OpenAI from 'openai';
import { toOpenAIMessages } from '../serialize/openaiMessages';
import { fetchWithRetry, classifyError } from '../http/retry';

export class OpenRouterModel implements Model {
  id: string;
  private client: OpenAI;

  constructor(id: string, client: OpenAI) {
    this.id = id;
    this.client = client;
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
      throw classifyError(e, 'OpenRouter');
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
          tools: tools && tools.length > 0 ? tools : undefined,
        },
        request.signal ? { signal: request.signal } : undefined
      );
      const latencyMs = Date.now() - startTime;

      const message = response.choices[0].message;
      const anyUsage = response.usage as any;
      const cached = anyUsage?.prompt_tokens_details?.cached_tokens ?? anyUsage?.cache_read_input_tokens;
      const created = anyUsage?.cache_creation_input_tokens;
      const usage = response.usage
        ? {
            inputTokens: response.usage.prompt_tokens,
            outputTokens: response.usage.completion_tokens,
            totalTokens: response.usage.total_tokens,
            ...(cached !== undefined ? { cacheReadInputTokens: cached } : {}),
            ...(created !== undefined ? { cacheCreationInputTokens: created } : {}),
          }
        : undefined;

      return {
        text: message.content || '',
        toolCalls: message.tool_calls?.map((tc) => ({
          id: tc.id,
          name: tc.function.name,
          args: tc.function.arguments,
        })),
        usage,
        latencyMs,
      };
    } catch (e: any) {
      throw classifyError(e, 'OpenRouter');
    }
  }
}

export class OpenRouterProvider implements Provider {
  name = 'openrouter';
  private client: OpenAI;
  public baseUrl: string;
  public defaultModel: string;
  models: Model[] = [];

  constructor(
    private apiKey?: string,
    baseUrl: string = 'https://openrouter.ai/api/v1',
    defaultModel: string = 'openrouter/auto'
  ) {
    this.baseUrl = baseUrl || 'https://openrouter.ai/api/v1';
    this.defaultModel = defaultModel || 'openrouter/auto';
    const key = this.apiKey || process.env.OPENROUTER_API_KEY || '';
    this.client = new OpenAI({
      apiKey: key || 'dummy-key',
      baseURL: this.baseUrl,
      maxRetries: 0,
      defaultHeaders: {
        'HTTP-Referer': 'https://agentos.dev',
        'X-Title': 'AgentOS',
      },
      fetch: (url, init) =>
        fetchWithRetry(url, init || {}, {
          signal: init?.signal as AbortSignal,
          providerName: 'OpenRouter',
        }),
    });
    this.models = [
      new OpenRouterModel('openrouter/auto', this.client),
      new OpenRouterModel('anthropic/claude-3.5-sonnet', this.client),
      new OpenRouterModel('deepseek/deepseek-chat', this.client),
      new OpenRouterModel('meta-llama/llama-3.3-70b-instruct', this.client),
    ];
  }

  getModel(id?: string): Model {
    const modelId = id || this.defaultModel;
    let model: Model | undefined = this.models.find((m) => m.id === modelId);
    if (!model) {
      model = new OpenRouterModel(modelId, this.client);
      this.models.push(model);
    }
    return model;
  }

  async checkHealth(): Promise<{ ok: boolean; error?: string }> {
    const key = this.apiKey || process.env.OPENROUTER_API_KEY;
    if (!key) {
      return { ok: false, error: 'OPENROUTER_API_KEY is missing' };
    }
    try {
      await this.client.models.list();
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: `OpenRouter unreachable: ${e.message}` };
    }
  }
}
