import { JsonObject } from '@agent-os/shared';

export interface ToolCallRef {
  id: string;
  name: string;
  args: string; // args = JSON string
}

export type ChatMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: ToolCallRef[] }
  | { role: 'tool'; content: string; toolCallId: string; name: string; isError?: boolean };

export interface GenerationRequest {
  systemPrompt?: string;
  messages: ChatMessage[];
  tools?: { name: string; description: string; parameters?: JsonObject }[];
  signal?: AbortSignal;
  maxOutputTokens?: number;
}

export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens?: number;
}

export interface GenerationResponse {
  text: string;
  toolCalls?: { id: string; name: string; args: string }[];
  usage?: ModelUsage;
  latencyMs?: number;
}

export type StreamEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'tool_call_start'; id: string; name: string }
  | { type: 'tool_call_args_delta'; id: string; delta: string }
  | { type: 'tool_call_end'; id: string; arguments: Record<string, unknown> }
  | { type: 'done'; usage?: ModelUsage }
  | { type: 'error'; error: any };

export interface Model {
  id: string;
  generate(request: GenerationRequest): Promise<GenerationResponse>;
  stream?(request: GenerationRequest): AsyncIterable<StreamEvent>;
  generateStream?(request: GenerationRequest): AsyncIterableIterator<any>;
}


export interface Provider {
  name: string;
  models: Model[];
  getModel(id: string): Model;
  checkHealth(): Promise<{ ok: boolean; error?: string }>;
}
