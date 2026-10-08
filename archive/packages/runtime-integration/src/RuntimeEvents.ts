import { LoggingEventBus } from "@agent-os/shared";

export class RuntimeEvents {
  constructor(private bus: LoggingEventBus) {}

  public emitBootstrapStarted() {
    this.bus.publish("runtime.bootstrap.started", { component: "runtime", severity: "info", message: "Bootstrap started", meta: {} });
  }

  public emitBootstrapCompleted() {
    this.bus.publish("runtime.bootstrap.completed", { component: "runtime", severity: "info", message: "Bootstrap completed", meta: {} });
  }

  public emitPipelineStarted(sessionId: string) {
    this.bus.publish("runtime.pipeline.started", { component: "runtime", severity: "info", message: "Pipeline execution started", meta: { sessionId } });
  }

  public emitPipelineCompleted(sessionId: string) {
    this.bus.publish("runtime.pipeline.completed", { component: "runtime", severity: "info", message: "Pipeline execution completed", meta: { sessionId } });
  }

  public emitHealthGenerated(status: string) {
    this.bus.publish("runtime.health.generated", { component: "runtime", severity: "info", message: `Health generated: ${status}`, meta: { status } });
  }
}
