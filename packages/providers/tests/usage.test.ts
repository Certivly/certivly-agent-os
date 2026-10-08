import { describe, it, expect } from 'bun:test';
import {
  mapOpenAIUsage,
  mapAnthropicUsage,
  ModelPricing,
} from '../src/pricing';

describe('Action 3.03: Provider Matrix, Usage, And Cost', () => {
  it('1. OpenAI-compatible usage maps correctly', () => {
    const raw = {
      prompt_tokens: 150,
      completion_tokens: 45,
      total_tokens: 195,
    };
    const usage = mapOpenAIUsage(raw);
    expect(usage).not.toBeNull();
    expect(usage?.inputTokens).toBe(150);
    expect(usage?.outputTokens).toBe(45);
    expect(usage?.totalTokens).toBe(195);
  });

  it('2. Anthropic usage maps correctly', () => {
    const raw = {
      input_tokens: 220,
      output_tokens: 60,
    };
    const usage = mapAnthropicUsage(raw);
    expect(usage).not.toBeNull();
    expect(usage?.inputTokens).toBe(220);
    expect(usage?.outputTokens).toBe(60);
    expect(usage?.totalTokens).toBe(280);
  });

  it('3. unknown usage becomes null/zero according to type', () => {
    expect(mapOpenAIUsage(null)).toBeNull();
    expect(mapOpenAIUsage(undefined)).toBeNull();
    expect(mapOpenAIUsage('invalid' as any)).toBeNull();

    expect(mapAnthropicUsage(null)).toBeNull();
    expect(mapAnthropicUsage({})).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    });
  });

  it('4. cost calculation works for known model', () => {
    const pricing = new ModelPricing();

    // fake:scripted is 0 cost
    const fakeCost = pricing.calculateCost('fake:scripted', 1000, 500);
    expect(fakeCost).toBe(0);

    // openai:gpt-4o is $2.50 / $10.00 per M
    // 1,000,000 in ($2.50) + 1,000,000 out ($10.00) = $12.50
    const gptCost = pricing.calculateCost('openai:gpt-4o', 1_000_000, 1_000_000);
    expect(gptCost).toBe(12.5);

    // 1000 in, 500 out for gpt-4o:
    // (1000 * 2.5 / 1M) + (500 * 10 / 1M) = 0.0025 + 0.0050 = 0.0075
    const smallCost = pricing.calculateCost('openai:gpt-4o', 1000, 500);
    expect(smallCost).toBe(0.0075);
  });

  it('5. unknown price gives null cost without error', () => {
    const pricing = new ModelPricing();
    const cost = pricing.calculateCost('custom:unknown-model-xyz', 1000, 500);
    expect(cost).toBeNull();
  });
});
