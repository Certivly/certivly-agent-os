export class LeakDetector {
  private baseMemory: number = 0;

  public markBaseline() {
    this.baseMemory = process.memoryUsage().heapUsed;
  }

  public detect(): { hasLeak: boolean, growthMB: number } {
    const currentMemory = process.memoryUsage().heapUsed;
    const growth = currentMemory - this.baseMemory;
    const growthMB = growth / 1024 / 1024;
    
    // Warn if growth > 50MB
    return {
      hasLeak: growthMB > 50,
      growthMB
    };
  }
}
