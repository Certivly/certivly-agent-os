import { expect, test, describe } from "bun:test";
import { LeakDetector } from "../src/diagnostics/LeakDetector";

let retainedMemory: any[] = [];

describe("Memory Leak Detector", () => {
  test("detects massive allocations", () => {
    const detector = new LeakDetector();
    
    // Mock baseline
    const originalMemoryUsage = process.memoryUsage;
    process.memoryUsage = () => ({ heapUsed: 100 * 1024 * 1024 } as any);
    detector.markBaseline();
    
    // Mock memory explosion
    process.memoryUsage = () => ({ heapUsed: 200 * 1024 * 1024 } as any); // 100MB growth
    
    const result = detector.detect();
    expect(result.hasLeak).toBe(true);
    expect(result.growthMB).toBe(100);

    // Restore
    process.memoryUsage = originalMemoryUsage;
  });
});

