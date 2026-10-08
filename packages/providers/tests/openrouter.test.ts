import { describe, it, expect } from 'bun:test';
import { OpenRouterProvider } from '../src/adapters/openrouter';
import { ModelCatalog } from '../src/catalog';

describe('OpenRouterProvider Tests', () => {
  it('1. OpenRouterProvider.getModel() returns a Model instance without throwing', () => {
    const provider = new OpenRouterProvider('dummy-key');
    const model = provider.getModel();
    expect(model).toBeDefined();
    expect(model.id).toBe('openrouter/auto');

    const specificModel = provider.getModel('anthropic/claude-3.5-sonnet');
    expect(specificModel).toBeDefined();
    expect(specificModel.id).toBe('anthropic/claude-3.5-sonnet');
  });

  it('2. OpenRouterProvider constructs with correct base URL', () => {
    const provider = new OpenRouterProvider('dummy-key');
    expect(provider.baseUrl).toBe('https://openrouter.ai/api/v1');

    const customProvider = new OpenRouterProvider('dummy-key', 'https://custom.openrouter.proxy/v1');
    expect(customProvider.baseUrl).toBe('https://custom.openrouter.proxy/v1');
  });

  it('3. OpenRouterProvider.checkHealth() returns { ok: false } when API key is empty', async () => {
    const originalKey = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    try {
      const provider = new OpenRouterProvider('');
      const health = await provider.checkHealth();
      expect(health.ok).toBe(false);
      expect(health.error).toBeDefined();
      expect(health.error).toContain('missing');
    } finally {
      if (originalKey) process.env.OPENROUTER_API_KEY = originalKey;
    }
  });

  it('4. ModelCatalog lists OpenRouter models correctly', () => {
    const catalog = new ModelCatalog();
    const openrouterModels = catalog.listModels('openrouter');
    expect(openrouterModels.length).toBeGreaterThanOrEqual(4);

    const autoModel = catalog.getModelSpec('openrouter/auto');
    expect(autoModel).toBeDefined();
    expect(autoModel?.provider).toBe('openrouter');
    expect(autoModel?.supportsTools).toBe(true);

    const claudeModel = catalog.getModelSpec('anthropic/claude-3.5-sonnet');
    expect(claudeModel).toBeDefined();
    expect(claudeModel?.provider).toBe('openrouter');
  });
});
