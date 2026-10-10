import { describe, it, expect } from 'bun:test';
import { MetricRegistry, Counter, Gauge, Histogram } from '../src/registry';
import type { MetricPublisher, MetricSnapshot } from '../src/models';

describe('Metrics Package (packages/metrics)', () => {
  it('Counter increments and reads values accurately', () => {
    const counter = new Counter();
    expect(counter.get()).toBe(0);
    counter.inc();
    expect(counter.get()).toBe(1);
    counter.inc(5);
    expect(counter.get()).toBe(6);
  });

  it('Gauge sets and reads values accurately', () => {
    const gauge = new Gauge();
    expect(gauge.get()).toBe(0);
    gauge.set(42);
    expect(gauge.get()).toBe(42);
    gauge.set(-10);
    expect(gauge.get()).toBe(-10);
  });

  it('Histogram computes count, sum, average, min, max, p95, and p99', () => {
    const hist = new Histogram();
    expect(hist.getSnapshot().count).toBe(0);

    for (let i = 1; i <= 100; i++) {
      hist.observe(i);
    }

    const snap = hist.getSnapshot();
    expect(snap.count).toBe(100);
    expect(snap.sum).toBe(5050);
    expect(snap.average).toBe(50.5);
    expect(snap.min).toBe(1);
    expect(snap.max).toBe(100);
    expect(snap.p95).toBe(95);
    expect(snap.p99).toBe(99);
  });

  it('MetricRegistry registers metrics, generates snapshots, and publishes', () => {
    const registry = new MetricRegistry();
    const published: MetricSnapshot[] = [];

    const mockPublisher: MetricPublisher = {
      publish: (snapshot) => {
        published.push(snapshot);
      },
    };

    registry.registerPublisher(mockPublisher);

    registry.counter('requests_total').inc(10);
    registry.gauge('memory_mb').set(256);
    registry.histogram('latency_ms').observe(15);
    registry.histogram('latency_ms').observe(25);

    const snapshot = registry.snapshot();
    expect(snapshot.counters['requests_total']).toBe(10);
    expect(snapshot.gauges['memory_mb']).toBe(256);
    expect(snapshot.histograms['latency_ms'].count).toBe(2);
    expect(snapshot.histograms['latency_ms'].average).toBe(20);

    registry.publishAll();
    expect(published.length).toBe(1);
    expect(published[0].counters['requests_total']).toBe(10);
  });
});
