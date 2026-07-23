import { describe, it, expect } from 'bun:test';
import { OpenAIProvider } from '../src/adapters/openai';
import { AnthropicProvider } from '../src/adapters/anthropic';

describe('Providers', () => {
  it('should initialize OpenAI provider and find model', () => {
    const provider = new OpenAIProvider('fake-key');
    expect(provider.name).toBe('openai');
    const model = provider.getModel('gpt-4o');
    expect(model.id).toBe('gpt-4o');
  });

  it('should dynamically create unknown OpenAI models', () => {
    const provider = new OpenAIProvider('fake-key');
    const model = provider.getModel('unknown');
    expect(model.id).toBe('unknown');
  });

  it('should initialize Anthropic provider and find model', async () => {
    const provider = new AnthropicProvider('dummy-key');
    const model = provider.getModel('claude-3-opus-20240229');
    expect(model.id).toBe('claude-3-opus-20240229');
  });
});
