import { AgentContext, AgentResult, Agent } from '../models';
import { AgentRole } from '../AgentResult';

export abstract class BaseAgent implements Agent {
  abstract id: string;
  abstract name: string;
  abstract role: AgentRole;
  abstract version: string;

  protected model: any;

  constructor(model?: any) {
    this.model = model;
  }

  abstract execute(context: AgentContext): Promise<AgentResult>;

  protected makeResult(
    role: AgentRole,
    summary: string,
    findings: string[],
    recommendations: string[]
  ): AgentResult {
    return {
      agentId: this.id,
      role,
      summary,
      findings,
      recommendations,
      confidence: 0.8,
      graphRefs: [],
      knowledgeRefs: [],
      eventRefs: []
    };
  }

  protected async askModel(systemPrompt: string, userContent: string): Promise<string> {
    if (!this.model) return '';
    try {
      const resp = await this.model.generate({
        systemPrompt,
        messages: [{ role: 'user', content: userContent }]
      });
      return resp.text || '';
    } catch (e: any) {
      console.warn(`[${this.name}] Model call failed: ${e.message}`);
      return '';
    }
  }
}
