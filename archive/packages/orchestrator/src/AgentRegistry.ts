import { Agent, AgentRole } from "./models";

export class AgentRegistry {
  private agents: Map<AgentRole, Agent> = new Map();

  public register(agent: Agent) {
    if (this.agents.has(agent.role)) {
      throw new Error(`Agent for role ${agent.role} is already registered.`);
    }
    this.agents.set(agent.role, agent);
  }

  public getAgent(role: AgentRole): Agent {
    const agent = this.agents.get(role);
    if (!agent) {
      throw new Error(`No agent registered for role ${role}`);
    }
    return agent;
  }
}
