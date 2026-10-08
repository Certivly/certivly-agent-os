import { AgentRole } from "./models";

export type WorkflowState = "PENDING" | "RUNNING" | "CONSENSUS" | "COMPLETED" | "FAILED";

export class AgentLifecycle {
  public state: WorkflowState = "PENDING";
  public currentAgent?: AgentRole;
  public completedAgents: AgentRole[] = [];
  public failedAgents: AgentRole[] = [];

  public transitionToRunning(role: AgentRole) {
    this.state = "RUNNING";
    this.currentAgent = role;
  }

  public transitionToCompleted(role: AgentRole) {
    this.completedAgents.push(role);
    this.currentAgent = undefined;
  }

  public transitionToFailed(role: AgentRole) {
    this.failedAgents.push(role);
    this.state = "FAILED";
    this.currentAgent = undefined;
  }

  public transitionToConsensus() {
    this.state = "CONSENSUS";
  }

  public transitionToFinished() {
    this.state = "COMPLETED";
  }
}
