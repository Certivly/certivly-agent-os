import type { Model, GenerationRequest, GenerationResponse } from '@agent-os/providers';

export interface ScriptedToolCall {
  id: string;
  name: string;
  args?: string | Record<string, unknown>;
  arguments?: string | Record<string, unknown>;
}

export interface ScriptedResponseItem {
  text: string;
  toolCalls?: ScriptedToolCall[];
}

export class ScriptedModel implements Model {
  public id: string = 'scripted-model';
  public requests: GenerationRequest[] = [];
  private responses: ScriptedResponseItem[];
  private currentIndex: number = 0;

  constructor(responses: ScriptedResponseItem[] = [], id: string = 'scripted-model') {
    this.responses = [...responses];
    this.id = id;
  }

  public get callCount(): number {
    return this.requests.length;
  }

  public get lastRequest(): GenerationRequest | undefined {
    return this.requests[this.requests.length - 1];
  }

  public async generate(request: GenerationRequest): Promise<GenerationResponse> {
    this.requests.push(request);

    if (this.currentIndex >= this.responses.length) {
      throw new Error(`ScriptedModel exhausted: no more responses configured (called ${this.requests.length} times)`);
    }

    const item = this.responses[this.currentIndex++];

    const toolCalls = item.toolCalls?.map(tc => {
      const rawArgs = tc.args ?? tc.arguments ?? {};
      const argsStr = typeof rawArgs === 'string' ? rawArgs : JSON.stringify(rawArgs);
      return {
        id: tc.id,
        name: tc.name,
        args: argsStr,
      };
    });

    return {
      text: item.text,
      ...(toolCalls && toolCalls.length > 0 ? { toolCalls } : {}),
    };
  }

  public async *generateStream(request: GenerationRequest): AsyncIterableIterator<string> {
    this.requests.push(request);

    if (this.currentIndex >= this.responses.length) {
      throw new Error(`ScriptedModel exhausted: no more responses configured (called ${this.requests.length} times)`);
    }

    const item = this.responses[this.currentIndex++];
    
    // Yield words/chunks of text
    const words = item.text.split(' ');
    for (let i = 0; i < words.length; i++) {
      yield (i === 0 ? '' : ' ') + words[i];
    }
  }
}
