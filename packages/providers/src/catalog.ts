export interface ModelSpec {
  id: string;
  provider: 'openai' | 'anthropic' | 'gemini' | 'deepseek' | 'lmstudio' | 'ollama' | 'fake';
  displayName: string;
  contextWindow: number;
  maxOutputTokens: number;
  supportsTools: boolean;
  supportsStreaming: boolean;
  recommendedTokensLimit?: number;
}

export class ModelCatalog {
  private static defaultSpecs: Record<string, ModelSpec> = {
    // OpenAI
    'gpt-4o': {
      id: 'gpt-4o',
      provider: 'openai',
      displayName: 'GPT-4o',
      contextWindow: 128_000,
      maxOutputTokens: 16_384,
      supportsTools: true,
      supportsStreaming: true,
    },
    'gpt-4o-mini': {
      id: 'gpt-4o-mini',
      provider: 'openai',
      displayName: 'GPT-4o Mini',
      contextWindow: 128_000,
      maxOutputTokens: 16_384,
      supportsTools: true,
      supportsStreaming: true,
    },
    'gpt-4.1': {
      id: 'gpt-4.1',
      provider: 'openai',
      displayName: 'GPT-4.1',
      contextWindow: 128_000,
      maxOutputTokens: 16_384,
      supportsTools: true,
      supportsStreaming: true,
    },
    'o1': {
      id: 'o1',
      provider: 'openai',
      displayName: 'o1',
      contextWindow: 200_000,
      maxOutputTokens: 100_000,
      supportsTools: true,
      supportsStreaming: true,
    },
    'o3-mini': {
      id: 'o3-mini',
      provider: 'openai',
      displayName: 'o3-mini',
      contextWindow: 200_000,
      maxOutputTokens: 100_000,
      supportsTools: true,
      supportsStreaming: true,
    },
    // Anthropic
    'claude-3-5-sonnet-20241022': {
      id: 'claude-3-5-sonnet-20241022',
      provider: 'anthropic',
      displayName: 'Claude 3.5 Sonnet',
      contextWindow: 200_000,
      maxOutputTokens: 8_192,
      supportsTools: true,
      supportsStreaming: true,
    },
    'claude-sonnet': {
      id: 'claude-sonnet',
      provider: 'anthropic',
      displayName: 'Claude 3.5 Sonnet',
      contextWindow: 200_000,
      maxOutputTokens: 8_192,
      supportsTools: true,
      supportsStreaming: true,
    },
    'claude-3-7-sonnet-20250219': {
      id: 'claude-3-7-sonnet-20250219',
      provider: 'anthropic',
      displayName: 'Claude 3.7 Sonnet',
      contextWindow: 200_000,
      maxOutputTokens: 16_384,
      supportsTools: true,
      supportsStreaming: true,
    },
    'claude-3-haiku-20240307': {
      id: 'claude-3-haiku-20240307',
      provider: 'anthropic',
      displayName: 'Claude 3 Haiku',
      contextWindow: 200_000,
      maxOutputTokens: 4_096,
      supportsTools: true,
      supportsStreaming: true,
    },
    'claude-3-5-haiku-20241022': {
      id: 'claude-3-5-haiku-20241022',
      provider: 'anthropic',
      displayName: 'Claude 3.5 Haiku',
      contextWindow: 200_000,
      maxOutputTokens: 8_192,
      supportsTools: true,
      supportsStreaming: true,
    },
    // Gemini
    'gemini-1.5-flash': {
      id: 'gemini-1.5-flash',
      provider: 'gemini',
      displayName: 'Gemini 1.5 Flash',
      contextWindow: 1_000_000,
      maxOutputTokens: 8_192,
      supportsTools: true,
      supportsStreaming: true,
    },
    'gemini-1.5-pro': {
      id: 'gemini-1.5-pro',
      provider: 'gemini',
      displayName: 'Gemini 1.5 Pro',
      contextWindow: 2_000_000,
      maxOutputTokens: 8_192,
      supportsTools: true,
      supportsStreaming: true,
    },
    'gemini-2.0-flash': {
      id: 'gemini-2.0-flash',
      provider: 'gemini',
      displayName: 'Gemini 2.0 Flash',
      contextWindow: 1_000_000,
      maxOutputTokens: 8_192,
      supportsTools: true,
      supportsStreaming: true,
    },
    // DeepSeek
    'deepseek-chat': {
      id: 'deepseek-chat',
      provider: 'deepseek',
      displayName: 'DeepSeek Chat (V3)',
      contextWindow: 64_000,
      maxOutputTokens: 8_192,
      supportsTools: true,
      supportsStreaming: true,
    },
    'deepseek-coder': {
      id: 'deepseek-coder',
      provider: 'deepseek',
      displayName: 'DeepSeek Coder',
      contextWindow: 64_000,
      maxOutputTokens: 8_192,
      supportsTools: true,
      supportsStreaming: true,
    },
    'deepseek-reasoner': {
      id: 'deepseek-reasoner',
      provider: 'deepseek',
      displayName: 'DeepSeek Reasoner (R1)',
      contextWindow: 64_000,
      maxOutputTokens: 8_192,
      supportsTools: true,
      supportsStreaming: true,
    },
    // LM Studio / Ollama Local
    'local-model': {
      id: 'local-model',
      provider: 'lmstudio',
      displayName: 'Local Model',
      contextWindow: 32_000,
      maxOutputTokens: 4_096,
      supportsTools: true,
      supportsStreaming: true,
    },
    'qwen2.5-coder': {
      id: 'qwen2.5-coder',
      provider: 'ollama',
      displayName: 'Qwen 2.5 Coder',
      contextWindow: 32_000,
      maxOutputTokens: 8_192,
      supportsTools: true,
      supportsStreaming: true,
    },
    // Fake
    'scripted': {
      id: 'scripted',
      provider: 'fake',
      displayName: 'Scripted Mock Model',
      contextWindow: 100_000,
      maxOutputTokens: 4_096,
      supportsTools: true,
      supportsStreaming: false,
    },
    'fake:scripted': {
      id: 'fake:scripted',
      provider: 'fake',
      displayName: 'Scripted Mock Model',
      contextWindow: 100_000,
      maxOutputTokens: 4_096,
      supportsTools: true,
      supportsStreaming: false,
    },
  };

  private specs: Record<string, ModelSpec>;

  constructor(customSpecs?: Record<string, ModelSpec>) {
    this.specs = { ...ModelCatalog.defaultSpecs, ...customSpecs };
  }

  public getModelSpec(modelId: string): ModelSpec | undefined {
    return this.specs[modelId];
  }

  public listModels(provider?: string): ModelSpec[] {
    const all = Object.values(this.specs);
    if (!provider) return all;
    return all.filter((m) => m.provider === provider);
  }

  public getContextWindow(modelId: string, fallback: number = 32_000): number {
    return this.specs[modelId]?.contextWindow ?? fallback;
  }
}
