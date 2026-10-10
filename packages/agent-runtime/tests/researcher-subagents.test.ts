import { describe, it, expect } from 'bun:test';
import { SubagentRegistry } from '../src/multiagent/SubagentRegistry';

describe('Researcher Specialist Subagents (Freebuff & Qwen-Agent Parity)', () => {
  it('registers researcher-web and researcher-docs as built-in subagents', () => {
    const registry = new SubagentRegistry();
    const agents = registry.listSubagents();
    const names = agents.map(a => a.name);

    expect(names).toContain('researcher-web');
    expect(names).toContain('researcher-docs');
  });

  it('resolves alias names correctly (researcher, doc-researcher, docs-researcher)', () => {
    const registry = new SubagentRegistry();
    
    const webAgent1 = registry.getSubagent('researcher-web');
    const webAgent2 = registry.getSubagent('researcher');
    expect(webAgent1).toBeDefined();
    expect(webAgent2?.name).toBe('researcher-web');

    const docsAgent1 = registry.getSubagent('researcher-docs');
    const docsAgent2 = registry.getSubagent('docs-researcher');
    const docsAgent3 = registry.getSubagent('doc-researcher');
    expect(docsAgent1).toBeDefined();
    expect(docsAgent2?.name).toBe('researcher-docs');
    expect(docsAgent3?.name).toBe('researcher-docs');
  });

  it('configures researcher-web with strict research protocols and tool whitelist', () => {
    const registry = new SubagentRegistry();
    const webAgent = registry.getSubagent('researcher-web')!;

    expect(webAgent.role).toBe('researcher');
    expect(webAgent.modelRole).toBe('fast');
    expect(webAgent.maxTurns).toBe(15);
    expect(webAgent.tools).toContain('web_search');
    expect(webAgent.tools).toContain('read_url');
    expect(webAgent.tools).toContain('read_docs');

    // Quality gate: Hard rule requiring reading primary source pages and citations
    expect(webAgent.systemPrompt).toContain('HARD RULE');
    expect(webAgent.systemPrompt).toContain('read_url');
    expect(webAgent.systemPrompt).toContain('cite the URLs');
  });

  it('configures researcher-docs with specialized framework documentation instructions', () => {
    const registry = new SubagentRegistry();
    const docsAgent = registry.getSubagent('researcher-docs')!;

    expect(docsAgent.role).toBe('researcher');
    expect(docsAgent.tools).toContain('read_docs');
    expect(docsAgent.tools).toContain('read_url');
    expect(docsAgent.systemPrompt).toContain('technical documentation');
  });
});
