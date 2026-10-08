import { LoggingEventBus } from "@agent-os/shared";
import { AgentRole } from "./models";

export class AgentEvents {
  constructor(private eventBus: LoggingEventBus) {}

  public emitWorkflowStarted(goal: string) {
    this.eventBus.publish("agent.workflow.started", { component: "orchestrator", severity: "info", message: `Workflow started for: ${goal}`, meta: { goal } });
  }

  public emitWorkflowCompleted() {
    this.eventBus.publish("agent.workflow.completed", { component: "orchestrator", severity: "info", message: "Workflow completed", meta: {} });
  }

  public emitAgentStarted(agentId: string, role: AgentRole) {
    this.eventBus.publish("agent.started", { component: "orchestrator", severity: "info", message: `Agent started: ${role}`, meta: { agentId, role } });
  }

  public emitAgentCompleted(agentId: string, role: AgentRole) {
    this.eventBus.publish("agent.completed", { component: "orchestrator", severity: "info", message: `Agent completed: ${role}`, meta: { agentId, role } });
  }

  public emitAgentFailed(agentId: string, role: AgentRole, error: string) {
    this.eventBus.publish("agent.failed", { component: "orchestrator", severity: "error", message: `Agent failed: ${role}`, meta: { agentId, role, error } });
  }

  public emitConsensusStarted() {
    this.eventBus.publish("agent.consensus.started", { component: "orchestrator", severity: "info", message: "Consensus started", meta: {} });
  }

  public emitConsensusCompleted(approved: boolean) {
    this.eventBus.publish("agent.consensus.completed", { component: "orchestrator", severity: "info", message: `Consensus completed: ${approved}`, meta: { approved } });
  }

  public emitCritiqueCreated(sourceAgent: string, targetAgent: string, issue: string) {
    this.eventBus.publish("agent.critique.created", { component: "orchestrator", severity: "warn", message: `Critique: ${sourceAgent} -> ${targetAgent}`, meta: { sourceAgent, targetAgent, issue } });
  }
}
