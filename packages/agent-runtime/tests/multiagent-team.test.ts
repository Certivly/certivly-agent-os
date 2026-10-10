import { describe, it, expect } from 'bun:test';
import { SubagentRegistry } from '../src/multiagent/SubagentRegistry';
import { SubagentRunner } from '../src/multiagent/SubagentRunner';
import { AgentTeamCoordinator } from '../src/multiagent/AgentTeamCoordinator';
import { ToolRegistry } from '@agent-os/tools';
import { ScriptedModel } from './helpers/ScriptedModel';

describe('AgentTeamCoordinator (Multi-Agent Team Orchestration)', () => {
  it('1. coordinates research-and-implement workflow across explorer, librarian, coder, and verifier', async () => {
    // Explorer, Librarian (parallel), then Coder, Verifier, Reviewer
    const scriptedModel = new ScriptedModel([
      { text: 'Explorer: mapped auth modules in src/auth' },
      { text: 'Librarian: verified JWT dependency contracts' },
      { text: 'Coder: implemented token rotation logic' },
      { text: 'Verifier: ran tests, all passing' },
      { text: 'Reviewer: code meets standards, zero vulnerabilities' },
    ]);

    const registry = new SubagentRegistry();
    const toolReg = new ToolRegistry();
    const runner = new SubagentRunner(scriptedModel, toolReg);
    const coordinator = new AgentTeamCoordinator(registry, runner);

    const result = await coordinator.runWorkflow('research-and-implement', 'Implement token rotation in auth service');

    expect(result.workflow).toBe('research-and-implement');
    expect(result.success).toBe(true);
    expect(result.stepResults.length).toBe(5);
    expect(result.stepResults.map(s => s.agentName)).toEqual([
      'explorer',
      'librarian',
      'coder',
      'verifier',
      'reviewer',
    ]);
    expect(result.finalSummary).toContain('Multi-Agent Team Execution Summary (research-and-implement)');
    expect(result.finalSummary).toContain('SUCCESS');
  });

  it('2. coordinates investigate-and-fix workflow with diagnosis, localization, patch, and re-verification', async () => {
    const scriptedModel = new ScriptedModel([
      { text: 'Verifier initial: Test failed with TypeError at math.ts:14' },
      { text: 'Explorer: Identified division by zero at math.ts:14 in calc()' },
      { text: 'Coder: Added zero check guard at math.ts:14' },
      { text: 'Verifier re-run: All tests pass 100%' },
    ]);

    const registry = new SubagentRegistry();
    const toolReg = new ToolRegistry();
    const runner = new SubagentRunner(scriptedModel, toolReg);
    const coordinator = new AgentTeamCoordinator(registry, runner);

    const result = await coordinator.runWorkflow('investigate-and-fix', 'Fix TypeError in math.ts');

    expect(result.workflow).toBe('investigate-and-fix');
    expect(result.success).toBe(true);
    expect(result.stepResults.length).toBe(4);
    expect(result.stepResults[0].agentName).toBe('verifier');
    expect(result.stepResults[1].agentName).toBe('explorer');
    expect(result.stepResults[2].agentName).toBe('coder');
    expect(result.stepResults[3].agentName).toBe('verifier');
    expect(result.finalSummary).toContain('SUCCESS');
  });
});
