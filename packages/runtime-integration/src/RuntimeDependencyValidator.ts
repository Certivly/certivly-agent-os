import { RuntimeServiceRegistry } from "./RuntimeServiceRegistry";

export class RuntimeDependencyValidator {
  constructor(private registry: RuntimeServiceRegistry) {}

  public validate(): void {
    const required = [
      "planner",
      "repository",
      "wicer",
      "skills",
      "execution-engine",
      "trust-runtime",
      "patch-engine",
      "orchestrator",
      "pattern-intelligence",
      "memory"
    ];

    const registered = new Set(this.registry.getRegisteredServiceNames());
    const missing = required.filter(r => !registered.has(r));

    if (missing.length > 0) {
      throw new Error(`Runtime validation failed. Missing core components: ${missing.join(", ")}`);
    }
  }
}
