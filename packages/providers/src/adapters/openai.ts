import { Provider, Model, GenerationRequest, GenerationResponse } from '../interface';
import { ProviderError } from '@agent-os/shared';
import OpenAI from 'openai';

import { toOpenAIMessages } from '../serialize/openaiMessages';

class OpenAIModel implements Model {
  id: string;
  private client: OpenAI;

  constructor(id: string, client: OpenAI) {
    this.id = id;
    this.client = client;
  }

  async *stream(request: GenerationRequest): AsyncIterable<any> {
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
      throw new ProviderError(`OpenAI generation failed: ${e.message}`);
    }
  }
}

export class OpenAIProvider implements Provider {
  name = 'openai';
  private client: OpenAI;
  models: Model[];

  constructor(apiKey?: string, baseUrl?: string) {
    const key = apiKey || process.env.OPENAI_API_KEY;
    if (!key) {
      console.warn("Warning: OPENAI_API_KEY is missing. API calls will fail.");
    }
    this.client = new OpenAI({ apiKey: key || 'dummy-key', baseURL: baseUrl });
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
      return { ok: false, error: `OpenAI unreachable: ${e.message}` };
    }
  }
}
