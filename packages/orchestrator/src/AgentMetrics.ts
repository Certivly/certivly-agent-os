import { MetricRegistry } from "@agent-os/metrics";
import { AgentRole } from "./models";

export class AgentMetrics {
  constructor(private registry: MetricRegistry) {}

  public recordAgentExecution(role: AgentRole) {
    this.registry.counter("agent_executions").inc({ role });
  }

  public recordAgentFailure(role: AgentRole) {
    this.registry.counter("agent_failures").inc({ role });
  }

  public recordConsensusDuration(durationMs: number) {
    this.registry.histogram("agent_consensus_duration").observe(durationMs);
  }

  public recordCritique(severity: string) {
    this.registry.counter("agent_critiques").inc({ severity });
  }

  public recordWorkflowDuration(durationMs: number) {
    this.registry.histogram("workflow_duration").observe(durationMs);
  }

  public recordConsensusConfidence(confidence: number) {
    this.registry.histogram("consensus_confidence").observe(confidence);
  }
}
