import { Provider, Model, GenerationRequest, GenerationResponse, StreamEvent, ProviderError } from '../interface';
import { fetchWithRetry, classifyError } from '../http/retry';

export class OllamaModel implements Model {
  id: string;
  baseUrl: string;

  constructor(id: string, baseUrl: string = 'http://localhost:11434') {
    this.id = id;
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  async checkToolSupport(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/show`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: this.id }),
      });
      if (!res.ok) return false;
      const data = (await res.json()) as any;
      if (data.template && (data.template.includes('.Tools') || data.template.includes('tools'))) {
        return true;
      }
      if (
        data.capabilities?.includes('tools') ||
        data.details?.family?.includes('qwen2.5') ||
        data.details?.family?.includes('llama3.1') ||
        data.details?.family?.includes('command-r')
      ) {
        return true;
      }
      return false;
    } catch (_err: unknown) {
      return false;
    }
  }

  async generate(request: GenerationRequest): Promise<GenerationResponse> {
    const messages: any[] = [];
    if (request.systemPrompt) {
      messages.push({ role: 'system', content: request.systemPrompt });
    }

    for (const msg of request.messages) {
      if (msg.role === 'tool') {
        messages.push({ role: 'tool', content: msg.content, tool_name: msg.name });
      } else if (msg.role === 'assistant') {
        const assistantMsg: any = { role: 'assistant', content: msg.content };
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          assistantMsg.tool_calls = msg.toolCalls.map((tc) => {
            let parsedArgs: unknown = {};
            try {
              parsedArgs = JSON.parse(tc.args || '{}');
            } catch (_err: unknown) {
              parsedArgs = {};
            }
            return {
              function: {
                name: tc.name,
                arguments: parsedArgs,
              },
            };
          });
        }
        messages.push(assistantMsg);
      } else {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    const tools = request.tools?.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters || { type: 'object', properties: {} },
      },
    }));

    const body: any = {
      model: this.id,
      messages,
      stream: false,
    };
    if (tools && tools.length > 0) {
      body.tools = tools;
    }

    const startTime = Date.now();
    let res: Response;
    try {
      res = await fetchWithRetry(
        `${this.baseUrl}/api/chat`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
        {
          signal: request.signal,
          providerName: 'Ollama',
        }
      );
    } catch (e: any) {
      if (
        e.name === 'APIConnectionError' ||
        e.code === 'ECONNREFUSED' ||
        e.message?.includes('Connection error') ||
        e.message?.includes('fetch failed') ||
        e.message?.includes('Unable to connect') ||
        e.message?.includes('ECONNREFUSED')
      ) {
        throw new ProviderError(`Ollama unreachable at ${this.baseUrl}: ${e.message}`);
      }
      throw classifyError(e, 'Ollama');
    }

    const latencyMs = Date.now() - startTime;

    if (!res.ok) {
      const errText = await res.text();
      if (
        errText.toLowerCase().includes('does not support tools') ||
        errText.toLowerCase().includes('tool') ||
        res.status === 400
      ) {
        if (request.tools && request.tools.length > 0) {
          throw new ProviderError(`Ollama model "${this.id}" does not support tool calling`);
        }
      }
      throw new ProviderError(`Ollama generation failed HTTP ${res.status}: ${errText}`);
    }

    const data = (await res.json()) as any;
    if (data.error) {
      if (data.error.toLowerCase().includes('does not support tools')) {
        throw new ProviderError(`Ollama model "${this.id}" does not support tool calling`);
      }
      throw new ProviderError(`Ollama error: ${data.error}`);
    }

    const msg = data.message;
    const text = msg?.content || '';
    const toolCalls = msg?.tool_calls?.map((tc: any, idx: number) => ({
      id: tc.id || `call_${idx}`,
      name: tc.function?.name || '',
      args: typeof tc.function?.arguments === 'string'
        ? tc.function.arguments
        : JSON.stringify(tc.function?.arguments || {}),
    }));

    const usage = data.prompt_eval_count !== undefined
      ? {
          inputTokens: data.prompt_eval_count ?? 0,
          outputTokens: data.eval_count ?? 0,
          totalTokens: (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0),
        }
      : undefined;

    return {
      text,
      toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
      usage,
      latencyMs,
    };
  }

  async *stream(request: GenerationRequest): AsyncIterable<StreamEvent> {
    const res = await this.generate(request);
    if (res.text) {
      yield { type: 'text_delta', text: res.text };
    }
    if (res.toolCalls) {
      for (const tc of res.toolCalls) {
        yield { type: 'tool_call_start', id: tc.id, name: tc.name };
        let argsObj: Record<string, unknown> = {};
        try {
          argsObj = JSON.parse(tc.args);
        } catch (_err) {
          // best-effort: fallback to empty args object if tool call args are not valid JSON
        }
        yield { type: 'tool_call_end', id: tc.id, arguments: argsObj };
      }
    }
    yield { type: 'done', usage: res.usage };
  }
}

export class OllamaProvider implements Provider {
  name = 'ollama';
  baseUrl: string;
  models: Model[] = [];

  constructor(apiKeyOrBaseUrl?: string, baseUrl?: string) {
    if (baseUrl) {
      this.baseUrl = baseUrl;
    } else if (apiKeyOrBaseUrl && apiKeyOrBaseUrl.startsWith('http')) {
      this.baseUrl = apiKeyOrBaseUrl;
    } else {
      this.baseUrl = 'http://localhost:11434';
    }
  }

  getModel(id: string): Model {
    let model = this.models.find((m) => m.id === id);
    if (!model) {
      model = new OllamaModel(id, this.baseUrl);
      this.models.push(model);
    }
    return model;
  }

  async checkHealth(): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch(`${this.baseUrl.replace(/\/+$/, '')}/api/tags`);
      if (!res.ok) {
        return { ok: false, error: `Ollama returned HTTP ${res.status}` };
      }
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: `Ollama unreachable at ${this.baseUrl}: ${e.message}` };
    }
  }
}
