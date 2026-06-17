import { describe, it, expect } from 'bun:test';
import { OpenAIProvider } from '../src/adapters/openai';
import { AnthropicProvider } from '../src/adapters/placeholders';

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

  it('should throw when executing a placeholder provider', async () => {
    const model = AnthropicProvider.getModel('claude-3-opus');
    expect(model.generate({ messages: [] })).rejects.toThrow(/placeholder and not implemented/);
  });
});
