export class RuntimeExecutionTracer {
  private registered = new Set<string>();
  private invoked = new Set<string>();
  private completed = new Set<string>();

  public recordRegistration(name: string): void {
    this.registered.add(name);
  }

  public recordInvocation(name: string): void {
    this.invoked.add(name);
  }

  public recordCompletion(name: string): void {
    this.completed.add(name);
  }

  public getDeadComponents(): string[] {
    const dead: string[] = [];
    for (const name of this.registered) {
      if (!this.invoked.has(name)) {
        dead.push(name);
      }
    }
    return dead;
  }
  
  public getTraceReport(): any {
    return {
      registered: Array.from(this.registered),
      invoked: Array.from(this.invoked),
      completed: Array.from(this.completed),
      dead: this.getDeadComponents()
    };
  }
}
