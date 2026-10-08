import { MetricRegistry } from "@agent-os/metrics";

export class PatternMetrics {
  constructor(private registry: MetricRegistry) {}

  public recordPatternDetected(patternType: string) {
    this.registry.counter(`patterns_detected.${patternType}`).inc();
  }

  public recordScanDuration(durationMs: number) {
    this.registry.histogram("pattern_scan_duration").observe(durationMs);
  }
}
