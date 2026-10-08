// ARCHIVED: Placeholder provider stubs moved from packages/providers/src/adapters/placeholders.ts
// Reason: Real adapters (Gemini, DeepSeek, Ollama) implemented in actions_5/04. Runtime throws RuntimeError directly for unimplemented providers.
// Date: 2026-10-02

import { Provider, Model, GenerationRequest, GenerationResponse } from '../interface';
import { ProviderError } from '@agent-os/shared';

class PlaceholderModel implements Model {
  id: string;
  providerName: string;
  
  constructor(id: string, providerName: string) {
    this.id = id;
    this.providerName = providerName;
  }
  
  async generate(request: GenerationRequest): Promise<GenerationResponse> {
    throw new ProviderError(`${this.providerName} adapter is a placeholder and not implemented yet.`);
  }
}

export function createPlaceholderProvider(name: string, modelIds: string[]): Provider {
  return {
    name,
    models: modelIds.map(id => new PlaceholderModel(id, name)),
    getModel(id: string): Model {
      const model = this.models.find(m => m.id === id);
      if (!model) throw new ProviderError(`Model ${id} not found in ${name} provider`);
      return model;
    },
    async checkHealth() {
      return { ok: false, error: `${name} provider is not configured` };
    }
  };
}

export const GeminiProvider = createPlaceholderProvider('gemini', ['gemini-1.5-pro', 'gemini-1.5-flash']);
export const DeepSeekProvider = createPlaceholderProvider('deepseek', ['deepseek-coder']);
export const OpenRouterProvider = createPlaceholderProvider('openrouter', ['auto']);
