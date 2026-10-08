import { AgentCritique } from "./models";

export class AgentConversation {
  private critiques: AgentCritique[] = [];

  public addCritique(critique: AgentCritique) {
    this.critiques.push(critique);
  }

  public getCritiquesForTarget(targetAgent: string): AgentCritique[] {
    return this.critiques.filter(c => c.targetAgent === targetAgent);
  }

  public getAllCritiques(): AgentCritique[] {
    return [...this.critiques];
  }
}
