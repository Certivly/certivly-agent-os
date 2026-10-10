import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ModelsCommand } from '../src/cli/commands/models';

describe('agentos models Command', () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentos-models-test-'));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (_e) {}
  });

  it('lists supported providers and their environment variable requirements', () => {
    const cmd = new ModelsCommand();
    const providers = cmd.getProviders();
    expect(providers.length).toBeGreaterThanOrEqual(6);
    const anthropic = providers.find(p => p.id === 'anthropic');
    expect(anthropic?.envVar).toBe('ANTHROPIC_API_KEY');
    const openai = providers.find(p => p.id === 'openai');
    expect(openai?.envVar).toBe('OPENAI_API_KEY');
  });

  it('lists catalog models and filters by provider', () => {
    const cmd = new ModelsCommand();
    const { models, activeModel } = cmd.listModels();
    expect(models.length).toBeGreaterThan(10);
    expect(activeModel).toBeDefined();

    const anthropicOnly = cmd.listModels('anthropic');
    expect(anthropicOnly.models.every(m => m.provider === 'anthropic')).toBe(true);
  });

  it('switches active model and writes to local configuration', () => {
    const cmd = new ModelsCommand();
    const res = cmd.setModel('claude-3-5-sonnet');
    expect(res.success).toBe(true);
    expect(res.activeModel).toBe('claude-3-5-sonnet');
    expect(res.activeProvider).toBe('anthropic');
  });

  it('tests fake and local models successfully without external API key', () => {
    const cmd = new ModelsCommand();
    const fakeTest = cmd.testModel('fake:scripted');
    expect(fakeTest.success).toBe(true);
    expect(fakeTest.message).toContain('Scripted Mock Model');

    const ollamaTest = cmd.testModel('qwen2.5-coder');
    expect(ollamaTest.success).toBe(true);
    expect(ollamaTest.message).toContain('Local provider');
  });
});
