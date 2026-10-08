import { AgentRole } from "./models";

export class AgentRouter {
  public route(goal: string): AgentRole[] {
    const normalizedGoal = goal.toLowerCase();
    
    // Simple deterministic routing based on goal keywords
    if (normalizedGoal.includes("bug") || normalizedGoal.includes("fix")) {
      return [AgentRole.CODER, AgentRole.TESTER, AgentRole.REVIEWER, AgentRole.SECURITY];
    }
    
    if (normalizedGoal.includes("doc") || normalizedGoal.includes("readme")) {
      return [AgentRole.DOCS];
    }
    
    // Default flow for full features: Architect -> Coder -> Tester -> Reviewer -> Security -> Docs
    return [
      AgentRole.ARCHITECT,
      AgentRole.CODER,
      AgentRole.TESTER,
      AgentRole.REVIEWER,
      AgentRole.SECURITY,
      AgentRole.DOCS
    ];
  }
}
