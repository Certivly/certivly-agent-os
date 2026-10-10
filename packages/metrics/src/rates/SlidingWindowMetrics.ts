export interface WindowSample {
  timestamp: number;
  tokens: number;
  latencyMs: number;
  isError: boolean;
}

export interface SlidingWindowStats {
  windowSeconds: number;
  sampleCount: number;
  requestsPerMinute: number;
  tokensPerMinute: number;
  errorRatePercent: number;
  avgLatencyMs: number;
  minLatencyMs: number;
  maxLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
}

export class SlidingWindowMetrics {
  private samples: WindowSample[] = [];
  private readonly windowMs: number;

  constructor(windowSeconds: number = 60) {
    this.windowMs = windowSeconds * 1000;
  }

  public record(options: { tokens?: number; latencyMs?: number; isError?: boolean }): void {
    const now = Date.now();
    this.samples.push({
      timestamp: now,
      tokens: options.tokens ?? 0,
      latencyMs: options.latencyMs ?? 0,
      isError: options.isError ?? false,
    });
    this.prune(now);
  }

  private prune(now: number): void {
    const cutoff = now - this.windowMs;
    // Remove samples older than window
    while (this.samples.length > 0 && this.samples[0].timestamp < cutoff) {
      this.samples.shift();
    }
  }

  public getStats(): SlidingWindowStats {
    const now = Date.now();
    this.prune(now);

    const count = this.samples.length;
    const windowSec = this.windowMs / 1000;

    if (count === 0) {
      return {
        windowSeconds: windowSec,
        sampleCount: 0,
        requestsPerMinute: 0,
        tokensPerMinute: 0,
        errorRatePercent: 0,
        avgLatencyMs: 0,
        minLatencyMs: 0,
        maxLatencyMs: 0,
        p50LatencyMs: 0,
        p95LatencyMs: 0,
        p99LatencyMs: 0,
      };
    }

    let totalTokens = 0;
    let totalLatency = 0;
    let errorCount = 0;
    const latencies: number[] = [];

    for (const s of this.samples) {
      totalTokens += s.tokens;
      totalLatency += s.latencyMs;
      if (s.isError) errorCount++;
      latencies.push(s.latencyMs);
    }

    latencies.sort((a, b) => a - b);

    const rpm = (count / windowSec) * 60;
    const tpm = (totalTokens / windowSec) * 60;
    const errorRate = (errorCount / count) * 100;
    const avgLatency = totalLatency / count;
    const minLatency = latencies[0];
    const maxLatency = latencies[count - 1];

    const p50Idx = Math.floor(count * 0.5);
    const p95Idx = Math.max(0, Math.floor(count * 0.95) - 1);
    const p99Idx = Math.max(0, Math.floor(count * 0.99) - 1);

    return {
      windowSeconds: windowSec,
      sampleCount: count,
      requestsPerMinute: Number(rpm.toFixed(2)),
      tokensPerMinute: Number(tpm.toFixed(2)),
      errorRatePercent: Number(errorRate.toFixed(2)),
      avgLatencyMs: Number(avgLatency.toFixed(2)),
      minLatencyMs: Number(minLatency.toFixed(2)),
      maxLatencyMs: Number(maxLatency.toFixed(2)),
      p50LatencyMs: Number(latencies[p50Idx].toFixed(2)),
      p95LatencyMs: Number(latencies[p95Idx].toFixed(2)),
      p99LatencyMs: Number(latencies[p99Idx].toFixed(2)),
    };
  }

  public reset(): void {
    this.samples = [];
  }
}
