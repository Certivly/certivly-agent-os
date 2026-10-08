import { expect, test, describe } from "bun:test";
import { LeakDetector } from "../src/diagnostics/LeakDetector";

let retainedMemory: any[] = [];

describe("Memory Leak Detector", () => {
  test("detects massive allocations", () => {
    const detector = new LeakDetector();
    
    // Mock baseline
    const originalMemoryUsage = process.memoryUsage;
    (process as any).memoryUsage = () => ({
      rss: 100 * 1024 * 1024,
      heapTotal: 100 * 1024 * 1024,
      heapUsed: 100 * 1024 * 1024,
      external: 0,
      arrayBuffers: 0
    });
    detector.markBaseline();
    
    // Mock memory explosion
    (process as any).memoryUsage = () => ({
      rss: 200 * 1024 * 1024,
      heapTotal: 200 * 1024 * 1024,
      heapUsed: 200 * 1024 * 1024,
      external: 0,
      arrayBuffers: 0
    }); // 100MB growth
    
    const result = detector.detect();
    expect(result.hasLeak).toBe(true);
    expect(result.growthMB).toBe(100);

    // Restore
    process.memoryUsage = originalMemoryUsage;
  });
});
