import { RequestPriority } from './PriorityManager';

export class SchedulerFairnessAnalyzer {
  private executionLatencies: number[] = [];

  public recordLatency(priority: RequestPriority, latencyMs: number): void {
    // For a real analyzer we would track by priority to ensure LOW doesn't starve
    this.executionLatencies.push(latencyMs);
    // Keep bounded
    if (this.executionLatencies.length > 1000) {
      this.executionLatencies.shift();
    }
  }

  public getMetrics() {
    if (this.executionLatencies.length === 0) return { p50: 0, p95: 0, p99: 0 };

    const sorted = [...this.executionLatencies].sort((a, b) => a - b);
    const p50 = sorted[Math.floor(sorted.length * 0.5)];
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    const p99 = sorted[Math.floor(sorted.length * 0.99)];

    return { p50, p95, p99 };
  }
}
