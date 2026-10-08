import * as fs from 'fs';
import type { ModelUsage } from './interface';

export interface ModelPrice {
  inputPerMillion: number;
  outputPerMillion: number;
}

export function mapOpenAIUsage(rawUsage: any): ModelUsage | null {
  if (!rawUsage || typeof rawUsage !== 'object') return null;
  const inputTokens = typeof rawUsage.prompt_tokens === 'number' ? rawUsage.prompt_tokens : 0;
  const outputTokens = typeof rawUsage.completion_tokens === 'number' ? rawUsage.completion_tokens : 0;
  return {
    inputTokens,
    outputTokens,
    totalTokens: typeof rawUsage.total_tokens === 'number' ? rawUsage.total_tokens : inputTokens + outputTokens,
  };
}

export function mapAnthropicUsage(rawUsage: any): ModelUsage | null {
  if (!rawUsage || typeof rawUsage !== 'object') return null;
  const inputTokens = typeof rawUsage.input_tokens === 'number' ? rawUsage.input_tokens : 0;
  const outputTokens = typeof rawUsage.output_tokens === 'number' ? rawUsage.output_tokens : 0;
  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
  };
}

export class ModelPricing {
  private static defaultPrices: Record<string, ModelPrice> = {
    'fake:scripted': { inputPerMillion: 0, outputPerMillion: 0 },
    'openai:gpt-4.1': { inputPerMillion: 2.50, outputPerMillion: 10.00 },
    'openai:gpt-4o': { inputPerMillion: 2.50, outputPerMillion: 10.00 },
    'openai:gpt-4o-mini': { inputPerMillion: 0.15, outputPerMillion: 0.60 },
    'anthropic:claude-sonnet': { inputPerMillion: 3.00, outputPerMillion: 15.00 },
    'anthropic:claude-3-5-sonnet-20241022': { inputPerMillion: 3.00, outputPerMillion: 15.00 },
    'anthropic:claude-3-haiku-20240307': { inputPerMillion: 0.25, outputPerMillion: 1.25 },
    'lmstudio:local': { inputPerMillion: 0, outputPerMillion: 0 },
    'ollama:local': { inputPerMillion: 0, outputPerMillion: 0 },
  };

  private prices: Record<string, ModelPrice>;

  constructor(customPrices?: Record<string, ModelPrice>) {
    this.prices = { ...ModelPricing.defaultPrices, ...customPrices };
  }

  public static loadFromFile(filePath: string): ModelPricing {
    if (fs.existsSync(filePath)) {
      try {
        const raw = fs.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(raw);
        return new ModelPricing(parsed);
      } catch (err) {
        // Fall back to defaults
      }
    }
    return new ModelPricing();
  }

  public getPrice(modelName: string): ModelPrice | null {
    if (this.prices[modelName]) {
      return this.prices[modelName];
    }
    // Also try matching without provider prefix, e.g. "gpt-4o"
    for (const [key, val] of Object.entries(this.prices)) {
      if (key === modelName || key.endsWith(':' + modelName) || modelName.endsWith(':' + key)) {
        return val;
      }
    }
    return null;
  }

  public calculateCost(
    modelName: string,
    inputTokens: number,
    outputTokens: number
  ): number | null {
    const price = this.getPrice(modelName);
    if (!price) {
      return null;
    }
    const inputCost = (inputTokens * price.inputPerMillion) / 1_000_000;
    const outputCost = (outputTokens * price.outputPerMillion) / 1_000_000;
    return Number((inputCost + outputCost).toFixed(6));
  }
}
