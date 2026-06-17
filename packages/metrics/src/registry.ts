import { MetricPublisher, MetricSnapshot, HistogramSnapshot } from './models';

export class Counter {
  private value: number = 0;
  
  public inc(amount: number = 1): void {
    this.value += amount;
  }
  
  public get(): number {
    return this.value;
  }
}

export class Gauge {
  private value: number = 0;

  public set(val: number): void {
    this.value = val;
  }

  public get(): number {
    return this.value;
  }
}

export class Histogram {
  private values: number[] = [];

  public observe(val: number): void {
    this.values.push(val);
  }

  public getSnapshot(): HistogramSnapshot {
    if (this.values.length === 0) {
      return { count: 0, sum: 0, min: 0, max: 0, average: 0, p95: 0, p99: 0 };
    }

    const sorted = [...this.values].sort((a, b) => a - b);
    const count = sorted.length;
    const sum = sorted.reduce((a, b) => a + b, 0);
    const min = sorted[0];
    const max = sorted[count - 1];
    const average = sum / count;

    const p95Idx = Math.max(0, Math.floor(count * 0.95) - 1);
    const p99Idx = Math.max(0, Math.floor(count * 0.99) - 1);
    const p95 = sorted[p95Idx];
    const p99 = sorted[p99Idx];

    return { count, sum, min, max, average, p95, p99 };
  }
}

export class MetricRegistry {
  private counters: Map<string, Counter> = new Map();
  private gauges: Map<string, Gauge> = new Map();
  private histograms: Map<string, Histogram> = new Map();
  private publishers: MetricPublisher[] = [];

  public counter(name: string): Counter {
    if (!this.counters.has(name)) {
      this.counters.set(name, new Counter());
    }
    return this.counters.get(name)!;
  }

  public gauge(name: string): Gauge {
    if (!this.gauges.has(name)) {
      this.gauges.set(name, new Gauge());
    }
    return this.gauges.get(name)!;
  }

  public histogram(name: string): Histogram {
    if (!this.histograms.has(name)) {
      this.histograms.set(name, new Histogram());
    }
    return this.histograms.get(name)!;
  }

  public registerPublisher(publisher: MetricPublisher): void {
    this.publishers.push(publisher);
  }

  public snapshot(): MetricSnapshot {
    const snap: MetricSnapshot = {
      timestamp: new Date().toISOString(),
      counters: {},
      gauges: {},
      histograms: {}
    };

    for (const [k, v] of this.counters.entries()) {
      snap.counters[k] = v.get();
    }
    for (const [k, v] of this.gauges.entries()) {
      snap.gauges[k] = v.get();
    }
    for (const [k, v] of this.histograms.entries()) {
      snap.histograms[k] = v.getSnapshot();
    }

    return snap;
  }

  public publishAll(): void {
    const snap = this.snapshot();
    for (const p of this.publishers) {
      try {
        p.publish(snap);
      } catch (e) {
        // Silently swallow publisher errors to protect business logic
      }
    }
  }
}

export const metrics = new MetricRegistry();
