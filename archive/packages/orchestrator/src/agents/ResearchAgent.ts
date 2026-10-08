import { AgentContext, AgentResult } from '../models';
import { AgentRole } from '../AgentResult';
import { BaseAgent } from './BaseAgent';

/**
 * ResearchAgent — synthesizes technical summaries, API references, and best-practice
 * documentation for a given goal. Runs as an orchestrator agent (alongside ArchitectAgent
 * and CoderAgent) so the planner always has domain context before it commits to a design.
 *
 * Moved from packages/research/src/ResearchAgent.ts and elevated to a first-class agent.
 */
export class ResearchAgent extends BaseAgent {
  id = 'research-agent';
  name = 'ResearchAgent';
  role: AgentRole = AgentRole.RESEARCHER;
  version = '1.0.0';

  constructor(model?: any) {
    super(model);
  }

  public async execute(context: AgentContext): Promise<AgentResult> {
    const topic = context.goal ?? 'unknown topic';

    const modelSummary = await this.askModel(
      'You are an expert technical researcher. Provide a concise summary of best practices, relevant APIs, and documentation for the following goal. Be specific and concrete.',
      `Goal: ${topic}\nRepository context: ${context.repositorySnapshot ? 'Available' : 'Not available'}`
    );

    const findings: string[] = [];
    const recommendations: string[] = [];

    if (modelSummary) {
      findings.push(modelSummary);
      recommendations.push('Incorporate research findings into architecture and implementation plan');
    } else {
      findings.push(`Research requested for: ${topic}`);
      findings.push('No active LLM model — research findings will be limited to structural analysis');
    }

    return this.makeResult(
      AgentRole.RESEARCHER,
      `Research completed for goal: ${topic.slice(0, 80)}${topic.length > 80 ? '...' : ''}`,
      findings,
      recommendations
    );
  }
}
