import { JsonObject } from '@agent-os/shared';

export interface GenerationRequest {
  systemPrompt?: string;
  messages: { role: 'user' | 'assistant' | 'system' | 'tool'; content: string; name?: string }[];
  tools?: { name: string; description: string; parameters?: JsonObject }[];
}

export interface GenerationResponse {
  text: string;
  toolCalls?: { id: string; name: string; args: string }[];
}

export interface Model {
  id: string;
  generate(request: GenerationRequest): Promise<GenerationResponse>;
  generateStream?(request: GenerationRequest): AsyncIterableIterator<any>;
}

export interface Provider {
  name: string;
  models: Model[];
  getModel(id: string): Model;
}
