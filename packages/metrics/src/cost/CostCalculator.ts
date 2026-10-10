import { DEFAULT_MODEL_PRICING, ModelPricingRate } from './pricing';
import { TokenUsage } from '../tokens/TokenTracker';

export interface CalculatedCost {
  model: string;
  inputCost: number;
  outputCost: number;
  cacheReadCost: number;
  cacheWriteCost: number;
  totalCost: number;
  currency: string;
}

export class CostCalculator {
  private customRates: Map<string, ModelPricingRate> = new Map();

  public registerRate(model: string, rate: ModelPricingRate): void {
    this.customRates.set(model.toLowerCase(), rate);
  }

  public getRate(model: string): ModelPricingRate {
    const key = model.toLowerCase();
    
    // Exact match in custom rates
    if (this.customRates.has(key)) {
      return this.customRates.get(key)!;
    }

    // Exact match in defaults
    if (DEFAULT_MODEL_PRICING[key]) {
      return DEFAULT_MODEL_PRICING[key];
    }

    // Substring / fuzzy match
    for (const [pattern, rate] of Object.entries(DEFAULT_MODEL_PRICING)) {
      if (key.includes(pattern) || pattern.includes(key)) {
        return rate;
      }
    }

    // Heuristic fallbacks by model name
    if (key.includes('haiku')) return DEFAULT_MODEL_PRICING['claude-3-5-haiku-20241022'];
    if (key.includes('sonnet')) return DEFAULT_MODEL_PRICING['claude-3-5-sonnet-20241022'];
    if (key.includes('opus')) return DEFAULT_MODEL_PRICING['claude-3-opus-20240229'];
    if (key.includes('mini')) return DEFAULT_MODEL_PRICING['gpt-4o-mini'];
    if (key.includes('gpt-4')) return DEFAULT_MODEL_PRICING['gpt-4o'];
    if (key.includes('deepseek')) return DEFAULT_MODEL_PRICING['deepseek-chat'];
    if (key.includes('gemini')) return DEFAULT_MODEL_PRICING['gemini-2.0-flash'];
    if (key.includes('ollama') || key.includes('local') || key.includes('qwen')) {
      return { inputPerMillion: 0, outputPerMillion: 0 };
    }

    // Default safe fallback (standard tier $2 / $8)
    return { inputPerMillion: 2.0, outputPerMillion: 8.0 };
  }

  public calculate(model: string, usage: TokenUsage): CalculatedCost {
    const rate = this.getRate(model);

    const promptTokens = usage.promptTokens;
    // Total output includes reasoning tokens if any
    const outputTokens = usage.completionTokens + (usage.reasoningTokens ?? 0);
    const cacheReadTokens = usage.cacheReadTokens ?? 0;
    const cacheWriteTokens = usage.cacheWriteTokens ?? 0;

    const inputCost = (promptTokens / 1_000_000) * rate.inputPerMillion;
    const outputCost = (outputTokens / 1_000_000) * rate.outputPerMillion;
    const cacheReadCost = rate.cacheReadPerMillion ? (cacheReadTokens / 1_000_000) * rate.cacheReadPerMillion : 0;
    const cacheWriteCost = rate.cacheWritePerMillion ? (cacheWriteTokens / 1_000_000) * rate.cacheWritePerMillion : 0;

    const totalCost = inputCost + outputCost + cacheReadCost + cacheWriteCost;

    return {
      model,
      inputCost: Number(inputCost.toFixed(6)),
      outputCost: Number(outputCost.toFixed(6)),
      cacheReadCost: Number(cacheReadCost.toFixed(6)),
      cacheWriteCost: Number(cacheWriteCost.toFixed(6)),
      totalCost: Number(totalCost.toFixed(6)),
      currency: 'USD',
    };
  }
}

export const costCalculator = new CostCalculator();
