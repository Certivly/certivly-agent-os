import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { CommandDispatcher } from '../src/ui/commands/CommandDispatcher';
import { SubagentRegistry } from '@agent-os/agent-runtime';

describe('Multi-Agent CLI Subcommands & Slash Commands', () => {
  let tempWs: string;

  beforeEach(() => {
    tempWs = fs.mkdtempSync(path.join(os.tmpdir(), 'agents-cli-ws-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempWs, { recursive: true, force: true });
    } catch (_e: unknown) {
      // Ignored in test cleanup
    }
  });

  it('1. CommandDispatcher dispatches /agents command', () => {
    const listRes = CommandDispatcher.dispatch('/agents');
    expect(listRes.isCommand).toBe(true);
    expect(listRes.action).toBe('agents');
  });

  it('2. CommandDispatcher dispatches /team command with workflow and goal', () => {
    const teamRes = CommandDispatcher.dispatch('/team research-and-implement Implement OAuth2 PKCE flow');
    expect(teamRes.isCommand).toBe(true);
    expect(teamRes.action).toBe('team');
    expect(teamRes.payload?.workflow).toBe('research-and-implement');
    expect(teamRes.payload?.goal).toBe('Implement OAuth2 PKCE flow');

    // Default workflow fallback when only goal is provided
    const defaultTeamRes = CommandDispatcher.dispatch('/team Refactor logger');
    expect(defaultTeamRes.isCommand).toBe(true);
    expect(defaultTeamRes.action).toBe('team');
    expect(defaultTeamRes.payload?.workflow).toBe('research-and-implement');
    expect(defaultTeamRes.payload?.goal).toBe('Refactor logger');
  });

  it('3. CommandDispatcher /help includes /agents and /team commands', () => {
    const helpRes = CommandDispatcher.dispatch('/help');
    expect(helpRes.isCommand).toBe(true);
    expect(helpRes.action).toBe('help');
    expect(helpRes.message).toContain('/agents');
    expect(helpRes.message).toContain('/team');
  });

  it('4. Custom user agents in workspace .agentos/agents/*.json are loaded and discoverable', () => {
    const agentsDir = path.join(tempWs, '.agentos', 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.writeFileSync(
      path.join(agentsDir, 'security-auditor.json'),
      JSON.stringify({
        name: 'security-auditor',
        description: 'Audit dependencies and source for known CVE vulnerabilities',
        role: 'reviewer',
        tools: ['read_file', 'grep_search'],
        systemPrompt: 'You are a paranoid security auditor looking for vulnerabilities.',
      })
    );

    const registry = new SubagentRegistry({ workspaceRoot: tempWs });
    const customAgent = registry.getSubagent('security-auditor');
    expect(customAgent).toBeDefined();
    expect(customAgent?.role).toBe('reviewer');
    expect(customAgent?.tools).toEqual(['read_file', 'grep_search']);

    const promptCatalog = registry.formatSubagentsPrompt();
    expect(promptCatalog).toContain('security-auditor');
    expect(promptCatalog).toContain('explorer');
  });
});
