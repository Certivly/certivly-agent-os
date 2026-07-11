import { BaseAgent } from './BaseAgent';
import { AgentContext, AgentResult } from '../models';
import { AgentRole } from '../AgentResult';

export class ArchitectAgent extends BaseAgent {
  id = 'architect-agent-v1';
  name = 'Architect Agent';
  role = AgentRole.ARCHITECT;
  version = '1.0.0';

  async execute(context: AgentContext): Promise<AgentResult> {
    const findings: string[] = [];
    const recommendations: string[] = [];

    // Analyze repository context
    if (context.repositorySnapshot?.files) {
      const fileCount = (context.repositorySnapshot.files as Map<any,any>).size ?? 0;
      findings.push(`Repository contains ${fileCount} indexed files.`);
    }

    // Summarize available knowledge units
    if (context.knowledge?.length > 0) {
      findings.push(`${context.knowledge.length} WiCER knowledge unit(s) available.`);
      for (const ku of context.knowledge.slice(0, 3)) {
        const title = (ku as any).title || (ku as any).id || 'module';
        findings.push(`Module in scope: ${title}`);
      }
    }

    // Use past memories for context
    if ((context as any).memories?.length > 0) {
      findings.push(`${(context as any).memories.length} relevant past execution(s) found.`);
    }

    // Generate architecture plan via LLM if available
    const contextSummary = findings.join('. ');
    const plan = await this.askModel(
      'You are a senior software architect. Given the goal and codebase context, produce a concise implementation plan in 3-5 bullet points. Be specific about which files or modules to touch.',
      `Goal: ${context.goal}\nContext: ${contextSummary}`
    );

    if (plan) {
      const bullets = plan.split('\n').filter(l => l.trim().length > 0).slice(0, 5);
      recommendations.push(...bullets);
    } else {
      recommendations.push(`Implement: ${context.goal}`);
    }

    return this.makeResult(
      AgentRole.ARCHITECT,
      `Architecture plan produced for: ${context.goal}`,
      findings,
      recommendations
    );
  }
}
