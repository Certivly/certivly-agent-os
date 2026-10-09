import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { ConfigManager, deepMergeConfig } from '../src/manager';
import * as fs from 'fs';
import * as path from 'path';

describe('ConfigManager', () => {
  const testConfigPath = path.join(__dirname, 'test-config.json');
  const mockUserConfigPath = path.join(__dirname, 'mock-user-config.json');
  const mockProjectConfigPath = path.join(__dirname, 'mock-project-config.json');

  beforeEach(() => {
    for (const p of [testConfigPath, mockUserConfigPath, mockProjectConfigPath]) {
      if (fs.existsSync(p)) {
        fs.unlinkSync(p);
      }
    }
  });

  afterEach(() => {
    for (const p of [testConfigPath, mockUserConfigPath, mockProjectConfigPath]) {
      if (fs.existsSync(p)) {
        fs.unlinkSync(p);
      }
    }
  });

  it('should return default config if file does not exist', () => {
    const manager = new ConfigManager(testConfigPath);
    const config = manager.load();
    expect(config.activeProvider).toBe('lmstudio');
    expect(config.activeModel).toBe('local-model');
  });

  it('should save and load config correctly in single file mode', () => {
    const manager = new ConfigManager(testConfigPath);
    const config = manager.load();
    config.activeProvider = 'anthropic';
    
    manager.save(config);
    
    const newManager = new ConfigManager(testConfigPath);
    const loaded = newManager.load();
    
    expect(loaded.activeProvider).toBe('anthropic');
  });

  it('should throw ConfigError on invalid config save', () => {
    const manager = new ConfigManager(testConfigPath);
    const config = manager.load();
    // Force invalid type (ts-ignore to bypass compile error)
    // @ts-ignore
    config.runtime.logLevel = 'invalid-level';
    
    expect(() => manager.save(config)).toThrow();
  });

  it('should expose static user config path helpers', () => {
    const userDir = ConfigManager.getUserConfigDir();
    const userPath = ConfigManager.getUserConfigPath();
    expect(userDir).toContain('.agentos');
    expect(userPath).toContain('config.json');
  });

  it('should deep merge user and project configs preserving user credentials', () => {
    const userConfig = {
      activeProvider: 'anthropic',
      activeModel: 'claude-3-7-sonnet',
      evalModels: [{ name: 'fake:scripted', enabled: true }],
      runtime: { logLevel: 'info' as const, sessionDir: '.agentos/sessions' },
      agent: { maxTurns: 40, planningMode: 'auto' as const },
      providers: {
        anthropic: {
          apiKey: 'sk-ant-user-secret-key-12345',
          baseUrl: 'https://api.anthropic.com',
        },
        lmstudio: {
          baseUrl: 'http://localhost:1234/v1',
        },
      },
    };

    const projectConfig = {
      activeModel: 'claude-3-5-haiku',
      agent: {
        maxTurns: 80,
        planningMode: 'always' as const,
      },
      providers: {
        anthropic: {
          model: 'claude-3-5-haiku',
        },
      },
    };

    // Deep merge project over user
    const merged = deepMergeConfig(userConfig as any, projectConfig as any);

    expect(merged.activeProvider).toBe('anthropic');
    expect(merged.activeModel).toBe('claude-3-5-haiku');
    expect(merged.agent.maxTurns).toBe(80);
    expect(merged.agent.planningMode).toBe('always');
    // User credentials must be preserved!
    expect(merged.providers.anthropic.apiKey).toBe('sk-ant-user-secret-key-12345');
    expect(merged.providers.anthropic.baseUrl).toBe('https://api.anthropic.com');
    expect(merged.providers.anthropic.model).toBe('claude-3-5-haiku');
    // Other providers from user config must not be erased
    expect(merged.providers.lmstudio.baseUrl).toBe('http://localhost:1234/v1');
  });

  it('should load cascaded user and project configuration from disk', () => {
    // Write user config with credentials
    fs.writeFileSync(mockUserConfigPath, JSON.stringify({
      activeProvider: 'openai',
      activeModel: 'gpt-4o',
      providers: {
        openai: {
          apiKey: 'sk-user-openai-key-abc',
        },
      },
    }, null, 2));

    // Write project config with overrides
    fs.writeFileSync(mockProjectConfigPath, JSON.stringify({
      agent: {
        maxTurns: 100,
      },
      providers: {
        openai: {
          model: 'gpt-4o-mini',
        },
      },
    }, null, 2));

    const manager = new ConfigManager({
      userConfigPath: mockUserConfigPath,
      projectConfigPath: mockProjectConfigPath,
      enableCascading: true,
    });

    const config = manager.load();
    expect(config.activeProvider).toBe('openai');
    expect(config.agent.maxTurns).toBe(100);
    expect(config.providers.openai.apiKey).toBe('sk-user-openai-key-abc');
    expect(config.providers.openai.model).toBe('gpt-4o-mini');
  });

  it('should support saving directly to user target or project target', () => {
    const manager = new ConfigManager({
      userConfigPath: mockUserConfigPath,
      projectConfigPath: mockProjectConfigPath,
      enableCascading: true,
    });

    const config = manager.load();
    config.activeProvider = 'gemini';
    manager.save(config, 'user');

    expect(fs.existsSync(mockUserConfigPath)).toBe(true);
    const userSaved = JSON.parse(fs.readFileSync(mockUserConfigPath, 'utf8'));
    expect(userSaved.activeProvider).toBe('gemini');

    config.agent.maxTurns = 55;
    manager.save(config, 'project');
    expect(fs.existsSync(mockProjectConfigPath)).toBe(true);
    const projSaved = JSON.parse(fs.readFileSync(mockProjectConfigPath, 'utf8'));
    expect(projSaved.agent.maxTurns).toBe(55);
  });
});
