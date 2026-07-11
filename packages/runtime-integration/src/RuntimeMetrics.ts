import { MetricRegistry } from "@agent-os/metrics";

export class RuntimeMetrics {
  constructor(private registry: MetricRegistry) {}

  public recordBootTime(durationMs: number) {
    this.registry.histogram("runtime_boot_time").observe(durationMs);
  }

  public recordPipelineDuration(durationMs: number) {
    this.registry.histogram("runtime_pipeline_duration").observe(durationMs);
  }

  public recordInvocation(component: string) {
    this.registry.counter(`${component.replace("-", "_")}_invocations`).inc();
  }

  public recordDeadComponents(count: number) {
    this.registry.histogram("dead_components_detected").observe(count);
  }
}
