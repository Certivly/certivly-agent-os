import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { AgentRuntime } from '../src/runtime';

describe('AgentRuntime Multi-Model Roles & MCP Auto-Initialization (Phase Completion)', () => {
  let tmpDir: string;
  let configPath: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-roles-mcp-'));
    configPath = path.join(tmpDir, 'agentos.config.json');

    fs.writeFileSync(
      configPath,
      JSON.stringify({
        activeProvider: 'lmstudio',
        activeModel: 'qwen-coder-32b',
        runtime: { logLevel: 'error', sessionDir: path.join(tmpDir, '.sessions') },
        agent: {
          modelRoles: {
            primary: 'qwen-coder-32b',
            fast: 'qwen-coder-7b',
            planning: 'deepseek-r1',
            review: 'qwen-coder-32b',
          },
          antiLoopMonitoring: true,
        },
        providers: {
          lmstudio: { baseUrl: 'http://127.0.0.1:9999/v1' },
        },
      })
    );
  });

  afterAll(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore temporary Windows file locks
    }
  });

  it('1. registers search_symbols and code_interpreter tools by default', () => {
    const runtime = new AgentRuntime({
      configPath,
      workspaceRoot: tmpDir,
    });

    try {
      const registry = runtime.getToolRegistry();
      expect(registry.get('search_symbols')).toBeDefined();
      expect(registry.get('code_interpreter')).toBeDefined();
      expect(registry.get('repo_map')).toBeDefined();
      expect(registry.get('execute')).toBeDefined();
      expect(runtime.createCodeModeTool()).toBeDefined();
    } finally {
      runtime.close();
    }
  });

  it('2. resolves model roles and supports dynamic setActiveModel', () => {
    const runtime = new AgentRuntime({
      configPath,
      workspaceRoot: tmpDir,
    });

    try {
      expect(runtime.getActiveModel().id).toBe('qwen-coder-32b');

      const fastModel = runtime.resolveModel('qwen-coder-7b');
      expect(fastModel?.id).toBe('qwen-coder-7b');

      const planModel = runtime.resolveModel('deepseek-r1');
      expect(planModel?.id).toBe('deepseek-r1');

      runtime.setActiveModel('claude-3-5-sonnet');
      expect(runtime.getActiveModel().id).toBe('claude-3-5-sonnet');
    } finally {
      runtime.close();
    }
  });

  it('3. initializes and closes McpClientManager cleanly', () => {
    const runtime = new AgentRuntime({
      configPath,
      workspaceRoot: tmpDir,
    });

    try {
      const mcpManager = runtime.getMcpManager();
      expect(mcpManager).toBeDefined();
    } finally {
      runtime.close();
    }
  });
});
