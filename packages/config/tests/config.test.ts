import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { ConfigManager } from '../src/manager';
import * as fs from 'fs';
import * as path from 'path';

describe('ConfigManager', () => {
  const testConfigPath = path.join(__dirname, 'test-config.json');

  beforeEach(() => {
    if (fs.existsSync(testConfigPath)) {
      fs.unlinkSync(testConfigPath);
    }
  });

  afterEach(() => {
    if (fs.existsSync(testConfigPath)) {
      fs.unlinkSync(testConfigPath);
    }
  });

  it('should return default config if file does not exist', () => {
    const manager = new ConfigManager(testConfigPath);
    const config = manager.load();
    expect(config.activeProvider).toBe('lmstudio');
    expect(config.activeModel).toBe('local-model');
  });

  it('should save and load config correctly', () => {
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
});
