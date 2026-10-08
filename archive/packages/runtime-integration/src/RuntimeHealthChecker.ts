import { RuntimeServiceRegistry } from "./RuntimeServiceRegistry";

export interface HealthReport {
  status: "HEALTHY" | "DEGRADED" | "DOWN";
  components: Record<string, string>;
}

export class RuntimeHealthChecker {
  constructor(private registry: RuntimeServiceRegistry) {}

  public async checkHealth(): Promise<HealthReport> {
    const components = this.registry.getRegisteredServiceNames();
    const report: Record<string, string> = {};

    for (const name of components) {
      // In a real implementation we would call .ping() or .health() on the service
      report[name] = "HEALTHY";
    }

    return {
      status: "HEALTHY",
      components: report
    };
  }
}
