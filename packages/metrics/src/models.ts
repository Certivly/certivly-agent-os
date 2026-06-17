export interface MetricPublisher {
  publish(snapshot: MetricSnapshot): void;
}

export interface MetricSnapshot {
  timestamp: string;
  counters: Record<string, number>;
  gauges: Record<string, number>;
  histograms: Record<string, HistogramSnapshot>;
}

export interface HistogramSnapshot {
  count: number;
  sum: number;
  min: number;
  max: number;
  average: number;
  p95: number;
  p99: number;
}
