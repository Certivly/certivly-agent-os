import { DaemonMetrics } from '../DaemonMetrics';
import { EventBus } from '../streaming/EventBus';

export class DaemonMetricsService {
  private metrics = new Map<string, number>();
  private startTime: number;

  constructor(private bus: EventBus) {
    this.startTime = Date.now();
    this.metrics.set(DaemonMetrics.UPTIME, 0);
    this.metrics.set(DaemonMetrics.CACHE_HITS, 0);
    this.metrics.set(DaemonMetrics.CACHE_MISSES, 0);
    this.metrics.set(DaemonMetrics.REQUESTS, 0);

    // Update uptime periodically
    setInterval(() => {
      this.metrics.set(DaemonMetrics.UPTIME, Date.now() - this.startTime);
    }, 1000);
  }

  public increment(metric: string, count: number = 1): void {
    const current = this.metrics.get(metric) || 0;
    this.metrics.set(metric, current + count);
    this.emitMetricsUpdate();
  }

  public set(metric: string, value: number): void {
    this.metrics.set(metric, value);
    this.emitMetricsUpdate();
  }

  public get(metric: string): number {
    if (metric === DaemonMetrics.UPTIME) {
      return Date.now() - this.startTime;
    }
    return this.metrics.get(metric) || 0;
  }

  public getAll(): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [key, value] of this.metrics.entries()) {
      result[key] = value;
    }
    result[DaemonMetrics.UPTIME] = this.get(DaemonMetrics.UPTIME);
    return result;
  }

  private emitMetricsUpdate(): void {
    // Only emit occasionally or debounce in a real implementation
    this.bus.publish({
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      channel: 'daemon',
      topic: 'daemon.metrics.updated',
      payload: this.getAll()
    });
  }
}
