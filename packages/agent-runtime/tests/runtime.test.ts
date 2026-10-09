import { describe, it, expect } from 'bun:test';
import { AgentRuntime } from '../src/runtime';
import { ConfigManager } from '@agent-os/config';
import { ScriptedModel } from './helpers/ScriptedModel';
import * as path from 'path';
import * as fs from 'fs';

describe('AgentRuntime', () => {
  it('should initialize successfully', () => {
    process.env.OPENAI_API_KEY = 'test-key';
    const configPath = path.join(__dirname, 'test-config.json');
    const runtime = new AgentRuntime({ configPath });
    
    expect(runtime.getConfigManager()).toBeDefined();
    expect(runtime.getSessionManager()).toBeDefined();
  });

  it('fails fast for providers that are unsupported or placeholders', () => {
    const configPath = path.join(__dirname, `placeholder-${crypto.randomUUID()}.json`);
    const manager = new ConfigManager(configPath);
    const config = manager.load();
    config.activeProvider = 'unsupported_provider';
    config.activeModel = 'auto';
    manager.save(config);

    try {
      expect(() => new AgentRuntime({ configPath })).toThrow(/unsupported provider: unsupported_provider/i);
    } finally {
      if (fs.existsSync(configPath)) fs.unlinkSync(configPath);
    }
  });

  it('initializes openrouter provider successfully', () => {
    const configPath = path.join(__dirname, `openrouter-${crypto.randomUUID()}.json`);
    const manager = new ConfigManager(configPath);
    const config = manager.load();
    config.activeProvider = 'openrouter';
    config.activeModel = 'openrouter/auto';
    manager.save(config);

    try {
      const runtime = new AgentRuntime({ configPath });
      expect(runtime).toBeDefined();
    } finally {
      if (fs.existsSync(configPath)) fs.unlinkSync(configPath);
    }
  });

  it('handleRequest calls AgentLoop.run and returns plain model final answer as text', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    const configPath = path.join(__dirname, `test-run-${crypto.randomUUID()}.json`);
    const manager = new ConfigManager(configPath);
    const config = manager.load();
    config.activeProvider = 'openai';
    config.activeModel = 'gpt-4o';
    manager.save(config);

    try {
      const runtime = new AgentRuntime({ configPath });
      const scriptedModel = new ScriptedModel([
        { text: 'I have analyzed the request and solved the issue.' },
      ]);
      // Inject fake model
      // @ts-ignore
      runtime.activeModel = scriptedModel;
      // @ts-ignore
      runtime.activeProvider = {
        name: 'scripted',
        models: [scriptedModel],
        getModel: () => scriptedModel,
        checkHealth: async () => ({ ok: true }),
      };

      const response = await runtime.handleRequest('test-session', 'Fix the bug in code');
      expect(typeof response).toBe('string');
      expect(response).toBe('I have analyzed the request and solved the issue.');

      const summary = runtime.getLastRunSummary();
      expect(summary).toBeDefined();
      expect(summary?.success).toBe(true);
      expect(summary?.finalText).toBe('I have analyzed the request and solved the issue.');
    } finally {
      if (fs.existsSync(configPath)) fs.unlinkSync(configPath);
    }
  });

  it('handleRequest returns a clear error message on loop failure without claiming success', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    const configPath = path.join(__dirname, `test-run-fail-${crypto.randomUUID()}.json`);
    const manager = new ConfigManager(configPath);
    const config = manager.load();
    config.activeProvider = 'openai';
    config.activeModel = 'gpt-4o';
    config.agent = { ...config.agent, maxTurns: 10, antiLoopMonitoring: false };
    manager.save(config);

    try {
      const runtime = new AgentRuntime({ configPath });
      // Model asks for tools forever with maxTurns exceeded
      const model = new ScriptedModel(
        Array.from({ length: 15 }, (_, i) => ({
          text: 'Need tool',
          toolCalls: [{ id: `tc-${i}`, name: 'nonexistent_tool', args: JSON.stringify({ attempt: i }) }],
        }))
      );
      // @ts-ignore
      runtime.activeModel = model;
      // @ts-ignore
      runtime.activeProvider = {
        name: 'scripted',
        models: [model],
        getModel: () => model,
        checkHealth: async () => ({ ok: true }),
      };

      const response = await runtime.handleRequest('test-session-fail', 'Trigger max turns');
      expect(typeof response).toBe('string');
      expect(response).toContain('Error');
      expect(response).toContain('Maximum turns');

      const summary = runtime.getLastRunSummary();
      expect(summary?.success).toBe(false);
    } finally {
      if (fs.existsSync(configPath)) fs.unlinkSync(configPath);
    }
  });
});
