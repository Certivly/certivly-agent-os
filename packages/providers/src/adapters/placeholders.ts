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
    }
  };
}

export const AnthropicProvider = createPlaceholderProvider('anthropic', ['claude-3-opus', 'claude-3-sonnet']);
export const GeminiProvider = createPlaceholderProvider('gemini', ['gemini-1.5-pro', 'gemini-1.5-flash']);
export const DeepSeekProvider = createPlaceholderProvider('deepseek', ['deepseek-coder']);
export const OpenRouterProvider = createPlaceholderProvider('openrouter', ['auto']);
export const OllamaProvider = createPlaceholderProvider('ollama', ['llama3', 'mistral']);
