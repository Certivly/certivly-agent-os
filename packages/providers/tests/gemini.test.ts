import { describe, it, expect } from 'bun:test';
import { GeminiProvider } from '../src/adapters/gemini';

describe('GeminiProvider Tests (Action 5-04)', () => {
  it('1. GeminiProvider.getModel() returns a Model instance without throwing', () => {
    const provider = new GeminiProvider('dummy-key');
    const model = provider.getModel();
    expect(model).toBeDefined();
    expect(model.id).toBe('gemini-2.0-flash');

    const specificModel = provider.getModel('gemini-1.5-pro');
    expect(specificModel).toBeDefined();
    expect(specificModel.id).toBe('gemini-1.5-pro');
  });

  it('2. GeminiProvider constructs with correct base URL', () => {
    const provider = new GeminiProvider('dummy-key');
    expect(provider.baseUrl).toBe('https://generativelanguage.googleapis.com/v1beta/openai');

    const customProvider = new GeminiProvider('dummy-key', 'https://custom.gemini.proxy/v1');
    expect(customProvider.baseUrl).toBe('https://custom.gemini.proxy/v1');
  });

  it('3. GeminiProvider.checkHealth() returns { ok: false } when API key is empty', async () => {
    const originalKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    try {
      const provider = new GeminiProvider('');
      const health = await provider.checkHealth();
      expect(health.ok).toBe(false);
      expect(health.error).toBeDefined();
      expect(health.error).toContain('missing');
    } finally {
      if (originalKey) process.env.GEMINI_API_KEY = originalKey;
    }
  });
});
