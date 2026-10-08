import { describe, it, expect } from 'bun:test';
import { DeepSeekProvider } from '../src/adapters/deepseek';

describe('DeepSeekProvider Tests (Action 5-04)', () => {
  it('1. DeepSeekProvider.getModel() returns a Model instance without throwing', () => {
    const provider = new DeepSeekProvider('dummy-key');
    const model = provider.getModel();
    expect(model).toBeDefined();
    expect(model.id).toBe('deepseek-chat');

    const specificModel = provider.getModel('deepseek-reasoner');
    expect(specificModel).toBeDefined();
    expect(specificModel.id).toBe('deepseek-reasoner');
  });

  it('2. DeepSeekProvider constructs with correct base URL', () => {
    const provider = new DeepSeekProvider('dummy-key');
    expect(provider.baseUrl).toBe('https://api.deepseek.com');

    const customProvider = new DeepSeekProvider('dummy-key', 'https://custom.deepseek.proxy/v1');
    expect(customProvider.baseUrl).toBe('https://custom.deepseek.proxy/v1');
  });

  it('3. DeepSeekProvider.checkHealth() returns { ok: false } when API key is empty', async () => {
    const originalKey = process.env.DEEPSEEK_API_KEY;
    delete process.env.DEEPSEEK_API_KEY;
    try {
      const provider = new DeepSeekProvider('');
      const health = await provider.checkHealth();
      expect(health.ok).toBe(false);
      expect(health.error).toBeDefined();
      expect(health.error).toContain('missing');
    } finally {
      if (originalKey) process.env.DEEPSEEK_API_KEY = originalKey;
    }
  });
});
