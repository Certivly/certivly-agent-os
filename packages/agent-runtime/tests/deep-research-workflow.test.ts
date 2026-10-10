import { describe, it, expect } from 'bun:test';
import { SubagentRegistry } from '../src/multiagent/SubagentRegistry';
import { SubagentRunner } from '../src/multiagent/SubagentRunner';
import { AgentTeamCoordinator } from '../src/multiagent/AgentTeamCoordinator';
import { ToolRegistry } from '@agent-os/tools';
import { ScriptedModel } from './helpers/ScriptedModel';

describe('Deep Research Workflow (AgentTeamCoordinator)', () => {
  it('coordinates multi-source deep research across researcher-web, researcher-docs, explorer, and reviewer synthesis', async () => {
    const scriptedModel = new ScriptedModel([
      // 1. researcher-web
      { text: 'Web Researcher: Found official Bun 1.1 release notes at https://bun.sh/blog/bun-v1.1 with cross-platform terminal APIs.' },
      // 2. researcher-docs
      { text: 'Doc Researcher: Extracted Bun.spawn() API contract and process exit signal specifications.' },
      // 3. explorer
      { text: 'Explorer: Local codebase implements terminal sessions in packages/sandbox/src/terminal/TerminalSessionManager.ts.' },
      // 4. reviewer (synthesis dossier)
      { text: 'Reviewer Synthesis:\n### Executive Summary\nBun 1.1 provides cross-platform shell compatibility.\n### Key Discoveries\nTerminal multiplexing is safe.\n### References\nhttps://bun.sh/blog/bun-v1.1' },
    ]);

    const registry = new SubagentRegistry();
    const toolReg = new ToolRegistry();
    const runner = new SubagentRunner(scriptedModel, toolReg);
    const coordinator = new AgentTeamCoordinator(registry, runner);

    const result = await coordinator.runWorkflow(
      'deep-research',
      'Investigate Bun cross-platform pseudo-terminal capabilities'
    );

    expect(result.workflow).toBe('deep-research');
    expect(result.success).toBe(true);
    expect(result.stepResults.length).toBe(4);

    const agentNames = result.stepResults.map(s => s.agentName);
    expect(agentNames).toContain('researcher-web');
    expect(agentNames).toContain('researcher-docs');
    expect(agentNames).toContain('explorer');
    expect(agentNames).toContain('reviewer');

    expect(result.finalSummary).toContain('Multi-Agent Team Execution Summary (deep-research)');
    expect(result.finalSummary).toContain('SUCCESS');
    expect(result.stepResults.find(s => s.agentName === 'reviewer')?.finalText).toContain('Executive Summary');
  });
});
