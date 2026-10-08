import { MetricRegistry } from "@agent-os/metrics";

export class PlannerMetrics {
  constructor(private registry: MetricRegistry) {}

  public recordPlanCreated() {
    this.registry.counter("plans_created").inc();
  }

  public recordPlanGenerationTime(durationMs: number) {
    this.registry.histogram("plan_generation_time").observe(durationMs);
  }

  public recordPlanExecutionTime(durationMs: number) {
    this.registry.histogram("plan_execution_time").observe(durationMs);
  }

  public recordTaskSuccess() {
    this.registry.counter("task_success_rate").inc();
  }

  public recordTaskFailure() {
    this.registry.counter("task_failure_rate").inc();
  }

  public recordSandboxUsage() {
    this.registry.counter("sandbox_usage_rate").inc();
  }

  public recordValidationFailure() {
    this.registry.counter("validation_failure_rate").inc();
  }

  public recordApprovalGenerationTime(durationMs: number) {
    this.registry.histogram("approval_generation_time").observe(durationMs);
  }
}
