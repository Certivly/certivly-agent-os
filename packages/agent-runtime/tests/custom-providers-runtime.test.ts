import { describe, it, expect } from 'bun:test';
import { AgentRuntime } from '../src/runtime';
import { ConfigManager } from '@agent-os/config';
import * as path from 'path';
import * as fs from 'fs';

describe('AgentRuntime Custom Provider Resolution and Hot-Switching', () => {
  it('resolves custom OpenAI and Anthropic compatible providers from config', () => {
    const configPath = path.join(__dirname, `custom-prov-${crypto.randomUUID()}.json`);
    const manager = new ConfigManager({ configPath, enableCascading: false });
    const config = manager.load();

    config.activeProvider = 'custom-vllm';
    config.activeModel = 'custom-vllm/qwen2.5-coder-32b';
    config.providers = {
      ...config.providers,
      'custom-vllm': {
        type: 'openai',
        baseUrl: 'http://127.0.0.1:8000/v1',
        apiKey: 'token-abc',
        headers: { 'X-Tenant': 'engineering' },
      },
      'custom-claude': {
        type: 'anthropic',
        baseUrl: 'http://127.0.0.1:9000/anthropic',
        apiKey: 'claude-secret',
        headers: { 'X-Custom-Route': 'private-vpc' },
      },
    };
    manager.save(config);

    try {
      const runtime = new AgentRuntime({ configPath });

      // 1. Initial resolution matches configured activeProvider & activeModel
      expect(runtime.getActiveProvider().name).toBe('custom-vllm');
      expect(runtime.getActiveModel().id).toBe('qwen2.5-coder-32b');

      // 2. Resolve model from custom Anthropic gateway
      const claudeModel = runtime.resolveModel('custom-claude/claude-3-7-sonnet');
      expect(claudeModel).toBeDefined();
      expect(claudeModel?.id).toBe('claude-3-7-sonnet');

      // 3. Hot-switch model to custom Claude provider
      runtime.setActiveModel('custom-claude/claude-3-7-sonnet');
      expect(runtime.getActiveModel().id).toBe('claude-3-7-sonnet');
      expect(runtime.getActiveProvider().name).toBe('custom-claude');

      // 4. Hot-switch back to custom OpenAI proxy
      runtime.setActiveModel('custom-vllm/deepseek-r1');
      expect(runtime.getActiveModel().id).toBe('deepseek-r1');
      expect(runtime.getActiveProvider().name).toBe('custom-vllm');

      // 5. Direct URL fallback resolution
      const directUrlModel = runtime.resolveModel('http://127.0.0.1:11434/v1/llama-3.2');
      expect(directUrlModel).toBeDefined();
      expect(directUrlModel?.id).toBe('llama-3.2');
    } finally {
      if (fs.existsSync(configPath)) {
        fs.unlinkSync(configPath);
      }
    }
  });

  it('allows setActiveProvider to switch active provider', () => {
    const configPath = path.join(__dirname, `prov-switch-${crypto.randomUUID()}.json`);
    const manager = new ConfigManager({ configPath, enableCascading: false });
    const config = manager.load();

    config.providers = {
      ...config.providers,
      'my-openai-proxy': {
        type: 'openai',
        baseUrl: 'http://localhost:5000/v1',
        apiKey: 'proxy-key',
      },
      'my-claude-proxy': {
        type: 'anthropic',
        baseUrl: 'http://localhost:6000/v1',
        apiKey: 'anthropic-key',
      },
    };
    config.activeProvider = 'my-openai-proxy';
    config.activeModel = 'gpt-4o';
    manager.save(config);

    try {
      const runtime = new AgentRuntime({ configPath });
      expect(runtime.getActiveProvider().name).toBe('my-openai-proxy');

      runtime.setActiveProvider('my-claude-proxy');
      expect(runtime.getActiveProvider().name).toBe('my-claude-proxy');
    } finally {
      if (fs.existsSync(configPath)) {
        fs.unlinkSync(configPath);
      }
    }
  });
});
