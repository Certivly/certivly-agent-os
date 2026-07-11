import { RuntimeExecutionTracer } from "./RuntimeExecutionTracer";

export class RuntimeServiceRegistry {
  private services = new Map<string, any>();

  constructor(private tracer: RuntimeExecutionTracer) {}

  public register<T>(name: string, service: T): void {
    this.services.set(name, service);
    this.tracer.recordRegistration(name);
  }

  public resolve<T>(name: string): T {
    if (!this.services.has(name)) {
      throw new Error(`Service not found: ${name}`);
    }
    this.tracer.recordInvocation(name);
    return this.services.get(name) as T;
  }

  public getRegisteredServiceNames(): string[] {
    return Array.from(this.services.keys());
  }
}
