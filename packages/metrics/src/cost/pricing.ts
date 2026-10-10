export interface ModelPricingRate {
  inputPerMillion: number;
  outputPerMillion: number;
  cacheReadPerMillion?: number;
  cacheWritePerMillion?: number;
}

/**
 * Known model pricing rates per million tokens in USD.
 */
export const DEFAULT_MODEL_PRICING: Record<string, ModelPricingRate> = {
  // Anthropic Claude 3.5 & 3.7
  'claude-3-7-sonnet-20250219': {
    inputPerMillion: 3.0,
    outputPerMillion: 15.0,
    cacheReadPerMillion: 0.3,
    cacheWritePerMillion: 3.75,
  },
  'claude-3-5-sonnet-20241022': {
    inputPerMillion: 3.0,
    outputPerMillion: 15.0,
    cacheReadPerMillion: 0.3,
    cacheWritePerMillion: 3.75,
  },
  'claude-3-5-haiku-20241022': {
    inputPerMillion: 0.8,
    outputPerMillion: 4.0,
    cacheReadPerMillion: 0.08,
    cacheWritePerMillion: 1.0,
  },
  'claude-3-opus-20240229': {
    inputPerMillion: 15.0,
    outputPerMillion: 75.0,
    cacheReadPerMillion: 1.5,
    cacheWritePerMillion: 18.75,
  },

  // OpenAI
  'gpt-4o': {
    inputPerMillion: 2.5,
    outputPerMillion: 10.0,
    cacheReadPerMillion: 1.25,
  },
  'gpt-4o-mini': {
    inputPerMillion: 0.15,
    outputPerMillion: 0.6,
    cacheReadPerMillion: 0.075,
  },
  'o1': {
    inputPerMillion: 15.0,
    outputPerMillion: 60.0,
    cacheReadPerMillion: 7.5,
  },
  'o1-mini': {
    inputPerMillion: 1.1,
    outputPerMillion: 4.4,
    cacheReadPerMillion: 0.55,
  },
  'o3-mini': {
    inputPerMillion: 1.1,
    outputPerMillion: 4.4,
    cacheReadPerMillion: 0.55,
  },

  // DeepSeek
  'deepseek-chat': {
    inputPerMillion: 0.14,
    outputPerMillion: 0.28,
    cacheReadPerMillion: 0.014,
  },
  'deepseek-reasoner': {
    inputPerMillion: 0.55,
    outputPerMillion: 2.19,
    cacheReadPerMillion: 0.14,
  },

  // Google Gemini
  'gemini-2.0-flash': {
    inputPerMillion: 0.1,
    outputPerMillion: 0.4,
  },
  'gemini-1.5-pro': {
    inputPerMillion: 1.25,
    outputPerMillion: 5.0,
  },

  // Free / Local
  'ollama': {
    inputPerMillion: 0,
    outputPerMillion: 0,
  },
  'lmstudio': {
    inputPerMillion: 0,
    outputPerMillion: 0,
  },
};
