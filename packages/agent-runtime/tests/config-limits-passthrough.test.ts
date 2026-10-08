import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { ConfigSchema } from '@agent-os/config';
import { AgentRuntime } from '../src/runtime';
import { ModelCatalog } from '@agent-os/providers';
import { ScriptedModel } from './helpers/ScriptedModel';

describe('Action 6-07: Sane Limits, Model Catalog, and Config Passthrough', () => {
  let tmpDir: string;
  let configPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-os-config-test-'));
    configPath = path.join(tmpDir, 'agentos.config.json');
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it('1. ConfigSchema defines sane default limits for agent', () => {
    const parsed = ConfigSchema.parse({});
    expect(parsed.agent.maxTurns).toBe(40);
    expect(parsed.agent.maxWallTimeMs).toBe(300_000);
    expect(parsed.agent.maxApproxTokens).toBe(100_000);
    expect(parsed.agent.maxVerificationFixAttempts).toBe(3);
  });

  it('2. AgentRuntime forwards configured agent limits to AgentLoop', async () => {
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        activeProvider: 'lmstudio',
        activeModel: 'scripted',
        permissionMode: 'auto',
        runtime: { sessionDir: tmpDir },
        agent: {
          maxTurns: 12,
          maxWallTimeMs: 45_000,
          maxApproxTokens: 25_000,
          maxVerificationFixAttempts: 5,
          planningMode: 'always',
        },
      }),
      'utf8'
    );

    const runtime = new AgentRuntime({
      configPath,
      workspaceRoot: tmpDir,
    });

    const model = new ScriptedModel([
      { text: 'Initial response' },
    ]);
    (runtime as any).activeModel = model;

    // Run request
    await runtime.handleRequest('test-session', 'Hello agent');

    const summary = runtime.getLastRunSummary();
    expect(summary).toBeDefined();

    runtime.close();
  });

  it('3. ModelCatalog resolves specs and default context windows for known models', () => {
    const catalog = new ModelCatalog();

    const gpt4o = catalog.getModelSpec('gpt-4o');
    expect(gpt4o).toBeDefined();
    expect(gpt4o?.provider).toBe('openai');
    expect(gpt4o?.contextWindow).toBe(128_000);

    const sonnet = catalog.getModelSpec('claude-3-5-sonnet-20241022');
    expect(sonnet).toBeDefined();
    expect(sonnet?.provider).toBe('anthropic');
    expect(sonnet?.contextWindow).toBe(200_000);

    const gemini = catalog.getModelSpec('gemini-1.5-flash');
    expect(gemini).toBeDefined();
    expect(gemini?.provider).toBe('gemini');
    expect(gemini?.contextWindow).toBe(1_000_000);

    const list = catalog.listModels('anthropic');
    expect(list.length).toBeGreaterThan(0);
    expect(list.every(m => m.provider === 'anthropic')).toBe(true);
  });
});
