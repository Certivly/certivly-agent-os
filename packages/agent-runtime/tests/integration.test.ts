import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { AgentRuntime } from '../src/runtime';
import { ConfigManager } from '@agent-os/config';
import { ProviderError } from '@agent-os/shared';

describe('AgentRuntime Integration', () => {
  const testConfigPath = path.join(__dirname, 'test-integration-config.json');
  const testSessionDir = path.join(__dirname, '.agentos/sessions');
  let testDbPath: string;

  beforeEach(() => {
    testDbPath = path.join(testSessionDir, `sessions-${crypto.randomUUID()}.db`);
    if (!fs.existsSync(testSessionDir)) {
      fs.mkdirSync(testSessionDir, { recursive: true });
    }
    const manager = new ConfigManager(testConfigPath);
    const config = manager.load();
    config.activeProvider = 'openai';
    config.activeModel = 'gpt-4o';
    config.runtime.sessionDir = path.relative(process.cwd(), testSessionDir);
    manager.save(config);
  });

  afterEach(() => {
    if (fs.existsSync(testConfigPath)) fs.unlinkSync(testConfigPath);
    // Ignore db deletion, just let it sit to avoid EBUSY locking issues on Windows
  });

  it('should create session and recover it', async () => {
    // Ensure the config is using the randomized test db path.
    const testDir = path.relative(process.cwd(), path.join(testSessionDir, crypto.randomUUID()));
    const manager = new ConfigManager(testConfigPath);
    const config = manager.load();
    config.runtime.sessionDir = testDir;
    manager.save(config);

    const runtime1 = new AgentRuntime({ configPath: testConfigPath });
    
    // Simulate some manual state change since we don't want to actually call OpenAI
    const sm = runtime1.getSessionManager();
    sm.createSession('test-session-id');
    sm.addMessage('test-session-id', { id: 'msg-1', role: 'user', content: 'hello' });
    
    // Recovery
    const runtime2 = new AgentRuntime({ configPath: testConfigPath });
    const sm2 = runtime2.getSessionManager();
    const session = sm2.getSession('test-session-id');
    const messages = sm2.getMessages('test-session-id');
    
    expect(session.id).toBe('test-session-id');
    expect(messages.length).toBe(1);
    expect(messages[0].content).toBe('hello');
  });

  it('should propagate provider errors correctly', async () => {
    const tempWs = path.join(testSessionDir, `ws-${crypto.randomUUID()}`);
    fs.mkdirSync(tempWs, { recursive: true });
    fs.writeFileSync(path.join(tempWs, 'app.ts'), 'console.log("test");');

    const manager = new ConfigManager(testConfigPath);
    const cfg = manager.load();
    cfg.repository = { rootPath: tempWs, ignorePatterns: [] };
    manager.save(cfg);

    const runtime = new AgentRuntime({ configPath: testConfigPath });
    
    // We will inject a dummy model to force a failure
    const config = runtime.getConfigManager().load();
    const dummyModel = {
      id: 'dummy',
      generate: async () => { throw new ProviderError('Provider timeout'); }
    };
    // @ts-ignore
    runtime.activeProvider = {
      name: 'dummy',
      models: [dummyModel],
      getModel: () => dummyModel,
      checkHealth: async () => ({ ok: true })
    };
    // @ts-ignore
    runtime.activeModel = dummyModel;

    let errorThrown = false;
    try {
      await runtime.handleRequest('test-session-id', 'test error propagation');
    } catch (e: any) {
      errorThrown = true;
      expect(e.message).toMatch(/(Provider timeout|OpenAI generation failed|provider)/i);
    }
    expect(errorThrown).toBe(true);
  }, 60000);
});
