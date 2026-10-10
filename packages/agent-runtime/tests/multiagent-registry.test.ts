import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { SubagentRegistry } from '../src/multiagent/SubagentRegistry';

describe('SubagentRegistry (Learned from Freebuff, OpenCode, Qwen Code)', () => {
  let tempWs: string;

  beforeEach(() => {
    tempWs = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-reg-ws-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempWs, { recursive: true, force: true });
    } catch (_e) {
      // cleanup
    }
  });

  it('1. discovers all built-in specialized subagents by default', () => {
    const registry = new SubagentRegistry({ workspaceRoot: tempWs });
    const agents = registry.listSubagents();

    expect(agents.length).toBeGreaterThanOrEqual(5);
    const names = agents.map(a => a.name);
    expect(names).toContain('explorer');
    expect(names).toContain('librarian');
    expect(names).toContain('coder');
    expect(names).toContain('verifier');
    expect(names).toContain('reviewer');

    const explorer = registry.getSubagent('explorer');
    expect(explorer).toBeDefined();
    expect(explorer?.role).toBe('explorer');
    expect(explorer?.tools).toContain('read_file');
    expect(explorer?.tools).not.toContain('edit_file'); // explorer must be read-only
  });

  it('2. discovers custom workspace subagents from .agentos/agents/*.json', () => {
    const agentsDir = path.join(tempWs, '.agentos', 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.writeFileSync(
      path.join(agentsDir, 'db-migrator.json'),
      JSON.stringify({
        name: 'db-migrator',
        description: 'Applies database schema migrations and validates seed data',
        role: 'custom',
        tools: ['run_command', 'read_file'],
        maxTurns: 5,
      })
    );

    const registry = new SubagentRegistry({ workspaceRoot: tempWs });
    const customAgent = registry.getSubagent('db-migrator');

    expect(customAgent).toBeDefined();
    expect(customAgent?.source).toBe('workspace');
    expect(customAgent?.description).toContain('migrations');
    expect(customAgent?.tools).toEqual(['run_command', 'read_file']);
  });

  it('3. workspace custom subagents override built-ins with identical name', () => {
    const agentsDir = path.join(tempWs, '.agentos', 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.writeFileSync(
      path.join(agentsDir, 'reviewer.json'),
      JSON.stringify({
        name: 'reviewer',
        description: 'Custom strict security reviewer with semgrep integration',
        role: 'reviewer',
        tools: ['read_file', 'grep'],
        maxTurns: 12,
      })
    );

    const registry = new SubagentRegistry({ workspaceRoot: tempWs });
    const reviewer = registry.getSubagent('reviewer');

    expect(reviewer).toBeDefined();
    expect(reviewer?.source).toBe('workspace');
    expect(reviewer?.description).toContain('semgrep');
    expect(reviewer?.maxTurns).toBe(12);
  });

  it('4. formats subagents catalog for prompt injection', () => {
    const registry = new SubagentRegistry({ workspaceRoot: tempWs });
    const promptText = registry.formatAgentsForPrompt();

    expect(promptText).toContain('Available Specialized Subagents');
    expect(promptText).toContain('explorer');
    expect(promptText).toContain('coder');
    expect(promptText).toContain('delegate_subagent');
  });
});
