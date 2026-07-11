import { BaseAgent } from './BaseAgent';
import { AgentContext, AgentResult } from '../models';
import { AgentRole } from '../AgentResult';

export class CoderAgent extends BaseAgent {
  id = 'coder-agent-v1';
  name = 'Coder Agent';
  role = AgentRole.CODER;
  version = '1.0.0';

  async execute(context: AgentContext): Promise<AgentResult> {
    const findings: string[] = [];
    const recommendations: string[] = [];

    // Pull architect recommendations if available
    const architectResult = context.previousResults.find(r => r.role === AgentRole.ARCHITECT);
    if (architectResult) {
      findings.push(`Architect plan: ${architectResult.recommendations.slice(0, 2).join('; ')}`);
    }

    // Generate implementation notes via LLM
    const contextSummary = findings.join('. ') || `Goal: ${context.goal}`;
    const impl = await this.askModel(
      'You are a senior software engineer. Given the architectural plan, identify the exact file changes needed and write implementation notes. Be concrete about function names, file paths, and logic to add.',
      `Goal: ${context.goal}\nArchitectural context: ${contextSummary}`
    );

    if (impl) {
      const lines = impl.split('\n').filter(l => l.trim().length > 0).slice(0, 6);
      recommendations.push(...lines);
    } else {
      recommendations.push(`Implement code changes for: ${context.goal}`);
    }

    return this.makeResult(
      AgentRole.CODER,
      `Implementation notes produced for: ${context.goal}`,
      findings,
      recommendations
    );
  }
}
