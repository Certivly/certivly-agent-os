import { Provider, Model, GenerationRequest, GenerationResponse } from '../interface';
import { ProviderError } from '@agent-os/shared';
import OpenAI from 'openai';

class OpenAIModel implements Model {
  id: string;
  private client: OpenAI;

  constructor(id: string, client: OpenAI) {
    this.id = id;
    this.client = client;
  }

  async *generateStream(options: { messages: any[], tools?: any[] }): AsyncIterable<string> {
    const formattedMessages = options.messages.map(m => {
      // Map back to OpenAI roles
      if (m.role === 'tool') {
        return { role: 'tool', tool_call_id: m.toolCallId, content: m.content };
      }
      return { role: m.role, content: m.content };
    });

    const response = await this.client.chat.completions.create({
      model: this.id,
      messages: formattedMessages as any,
      stream: true,
      // For phase 1.1 we don't stream tools to simplify, so we omit tools here unless requested.
      // OpenAI streaming with tools is complex because chunks contain partial JSON.
      // But we will pass tools if present.
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
      if (delta?.tool_calls) {
        // We will just yield a string indicating a tool call since parsing tool stream chunks is out of scope for Phase 1.1 simplistic stream.
        // Actually, returning raw JSON could be fine, but the pipeline expects string for text stream.
        // For Phase 1.1, we will yield a stringified tool call notification.
        yield `\n[Tool requested: ${delta.tool_calls[0].function?.name}]\n`;
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
    let model = this.models.find(m => m.id === id);
    if (!model) {
      model = new OpenAIModel(id, this.client);
      this.models.push(model);
    }
    return model;
  }
}
