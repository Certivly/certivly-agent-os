import { describe, it, expect } from 'bun:test';
import { AgentConsensusEvaluator, SubagentOpinion } from '../src/multiagent/AgentConsensusEvaluator';

describe('AgentConsensusEvaluator (Multi-Agent Veto Architecture)', () => {
  const evaluator = new AgentConsensusEvaluator();

  it('1. approves when all agents consent', () => {
    const opinions: SubagentOpinion[] = [
      { agentName: 'coder', role: 'coder', approved: true, findings: ['Implemented token rotation'] },
      { agentName: 'verifier', role: 'verifier', approved: true, findings: ['All 12 unit tests pass'] },
      { agentName: 'reviewer', role: 'reviewer', approved: true, findings: ['Code follows standards'] },
    ];

    const result = evaluator.evaluate(opinions);
    expect(result.approved).toBe(true);
    expect(result.vetoAgent).toBeUndefined();
    expect(result.averageConfidence).toBeGreaterThanOrEqual(0.8);
  });

  it('2. allows reviewer to veto proposal when security risk is discovered', () => {
    const opinions: SubagentOpinion[] = [
      { agentName: 'coder', role: 'coder', approved: true, findings: ['Feature implemented'] },
      { agentName: 'reviewer', role: 'reviewer', approved: false, findings: ['Detected hardcoded JWT secret leak in config.ts'] },
    ];

    const result = evaluator.evaluate(opinions);
    expect(result.approved).toBe(false);
    expect(result.vetoAgent).toBe('reviewer');
    expect(result.vetoReason).toContain('JWT secret leak');
    expect(result.concerns.length).toBeGreaterThanOrEqual(1);
  });

  it('3. enforces precedence where security overrides coder preference', () => {
    const opinions: SubagentOpinion[] = [
      { agentName: 'coder', role: 'coder', approved: true, findings: ['Quick fix with eval() works'] },
      { agentName: 'security-auditor', role: 'security', approved: false, findings: ['CRITICAL: eval() introduces remote code execution vulnerability'] },
    ];

    const result = evaluator.evaluate(opinions);
    expect(result.approved).toBe(false);
    expect(result.vetoAgent).toBe('security-auditor');
    expect(result.vetoReason).toContain('vulnerability');
  });
});
