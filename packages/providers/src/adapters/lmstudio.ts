import { Provider, Model, GenerationRequest, GenerationResponse } from '../interface';
import { ProviderError } from '@agent-os/shared';
import OpenAI from 'openai';

class LMStudioModel implements Model {
  id: string;
  private client: OpenAI;

  constructor(id: string, client: OpenAI) {
    this.id = id;
    this.client = client;
  }

  async *generateStream(options: { messages: any[], tools?: any[] }): AsyncIterable<string> {
    const formattedMessages = options.messages.map(m => {
      if (m.role === 'tool') {
        return { role: 'tool', tool_call_id: m.toolCallId, content: m.content };
      }
      return { role: m.role, content: m.content };
    });

    const response = await this.client.chat.completions.create({
      model: this.id,
      messages: formattedMessages as any,
      stream: true,
      // Many local models don't support tools, but we pass them if present
      tools: options.tools?.length ? options.tools.map(t => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters
        }
      })) : undefined,
    });

    for await (const chunk of response) {
      const delta = chunk.choices[0]?.delta;
      if (delta?.content) {
        yield delta.content;
      }
    }
  }

  async generate(request: GenerationRequest): Promise<GenerationResponse> {
    try {
      const messages: any[] = [];
      if (request.systemPrompt) {
        messages.push({ role: 'system', content: request.systemPrompt });
      }
      
      for (const msg of request.messages) {
        if (msg.role === 'tool') {
          messages.push({ role: 'tool', content: msg.content, tool_call_id: msg.name || '' });
        } else {
          messages.push({ role: msg.role, content: msg.content });
        }
      }

      const tools = request.tools?.map(t => ({
        type: 'function' as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters || { type: 'object', properties: {} }
        }
      }));

      const response = await this.client.chat.completions.create({
        model: this.id,
        messages,
        tools: tools && tools.length > 0 ? tools : undefined,
      });

      const message = response.choices[0].message;
      return {
        text: message.content || '',
        toolCalls: message.tool_calls?.map(tc => ({
          id: tc.id,
          name: tc.function.name,
          args: tc.function.arguments
        }))
      };
    } catch (e: any) {
      throw new ProviderError(`LM Studio generation failed: ${e.message}`);
    }
  }
}

export class LMStudioProvider implements Provider {
  name = 'lmstudio';
  private client: OpenAI;
  models: Model[] = [];

  constructor(apiKey?: string, baseUrl?: string) {
    const key = apiKey || 'lm-studio';
    const url = baseUrl || 'http://localhost:1234/v1';
    this.client = new OpenAI({ apiKey: key, baseURL: url });
  }

  getModel(id: string): Model {
    let model = this.models.find(m => m.id === id);
    if (!model) {
      model = new LMStudioModel(id, this.client);
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
        error: `LM Studio unreachable at ${(this.client as any).baseURL || 'http://localhost:1234/v1'}: ${e.message}`
      };
    }
  }
}
