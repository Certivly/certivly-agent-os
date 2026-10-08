import { expect, test, describe } from "bun:test";
import { SchedulerFairnessAnalyzer } from "../../daemon/src/scheduler/SchedulerFairnessAnalyzer";
import { RequestPriority } from "../../daemon/src/scheduler/PriorityManager";

describe("Scheduler Fairness", () => {
  test("records and calculates P50/P95/P99 latencies", () => {
    const analyzer = new SchedulerFairnessAnalyzer();
    
    for (let i = 1; i <= 100; i++) {
      analyzer.recordLatency(RequestPriority.NORMAL, i);
    }

    const metrics = analyzer.getMetrics();
    expect(metrics.p50).toBe(51); // Or 50 based on rounding
    expect(metrics.p95).toBe(96);
    expect(metrics.p99).toBe(100);
  });
});
