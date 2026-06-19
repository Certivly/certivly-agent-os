export class RuntimeProfiler {
  private startTime: number = 0;
  private checkpoints: Map<string, number> = new Map();

  public start() {
    this.startTime = performance.now();
    this.checkpoints.clear();
  }

  public checkpoint(name: string) {
    this.checkpoints.set(name, performance.now() - this.startTime);
  }

  public report(): void {
    console.log("Runtime Profiler Report:");
    for (const [name, time] of this.checkpoints.entries()) {
      console.log(`  ${name}: ${time.toFixed(2)}ms`);
    }
  }
}
