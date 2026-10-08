import { MetricRegistry } from "@agent-os/metrics";

export class ExecutionMetrics {
  constructor(private registry: MetricRegistry) {}

  public recordExecutionStarted() {
    this.registry.counter("executions_started").inc();
  }

  public recordExecutionCompleted() {
    this.registry.counter("executions_completed").inc();
  }

  public recordExecutionFailed() {
    this.registry.counter("executions_failed").inc();
  }

  public recordTaskCompleted() {
    this.registry.counter("tasks_completed").inc();
  }

  public recordTaskFailed() {
    this.registry.counter("tasks_failed").inc();
  }

  public recordTaskRetry() {
    this.registry.counter("task_retry_count").inc();
  }

  public recordValidationSuccess() {
    this.registry.counter("validation_success_rate").inc();
  }

  public recordValidationFailure() {
    // implicitly tracking failure by success rate ratio
  }

  public recordPatchGenerationTime(durationMs: number) {
    this.registry.histogram("patch_generation_time").observe(durationMs);
  }

  public recordApprovalGenerationTime(durationMs: number) {
    this.registry.histogram("approval_generation_time").observe(durationMs);
  }

  public recordExecutionDuration(durationMs: number) {
    this.registry.histogram("average_execution_duration").observe(durationMs);
  }
}
