import { MetricRegistry } from "@agent-os/metrics";
import { AgentRole } from "./models";

export class AgentMetrics {
  constructor(private registry: MetricRegistry) {}

  public recordAgentExecution(role: AgentRole) {
    this.registry.counter(`agent_executions.${role}`).inc();
  }

  public recordAgentFailure(role: AgentRole) {
    this.registry.counter(`agent_failures.${role}`).inc();
  }

  public recordConsensusDuration(durationMs: number) {
    this.registry.histogram("agent_consensus_duration").observe(durationMs);
  }

  public recordCritique(severity: string) {
    this.registry.counter(`agent_critiques.${severity}`).inc();
  }

  public recordWorkflowDuration(durationMs: number) {
    this.registry.histogram("workflow_duration").observe(durationMs);
  }

  public recordConsensusConfidence(confidence: number) {
    this.registry.histogram("consensus_confidence").observe(confidence);
  }
}
