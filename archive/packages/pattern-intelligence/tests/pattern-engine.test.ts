import { describe, it, expect, mock } from "bun:test";
import { PatternEngine } from "../src/PatternEngine";
import { PatternRegistry } from "../src/PatternRegistry";
import { PatternCompiler } from "../src/PatternCompiler";
import { PatternStore } from "../src/PatternStore";
import { ServicePatternDetector } from "../detectors/ServicePatternDetector";

describe("PatternEngine", () => {
  it("should run detectors and build a snapshot", async () => {
    const registry = new PatternRegistry();
    registry.register(new ServicePatternDetector());

    const compiler = new PatternCompiler();
    const store = new PatternStore();

    const mockEvents = { emitScanStarted: mock(), emitPatternDetected: mock(), emitSnapshotCreated: mock() };
    const mockMetrics = { recordPatternDetected: mock(), recordScanDuration: mock() };

    const engine = new PatternEngine(registry, compiler, store, mockEvents, mockMetrics);

    const mockGraph = {
      nodes: [
        { type: "class", id: "1", name: "UserService" },
        { type: "class", id: "2", name: "PaymentService" },
        { type: "class", id: "3", name: "Helper" }
      ]
    };

    const snapshot = await engine.scan(mockGraph, [], "v1");

    expect(snapshot.patterns.length).toBe(1);
    expect(snapshot.patterns[0].occurrences).toBe(2);
    expect(snapshot.patterns[0].confidence).toBeCloseTo(2 / 3);

    expect(store.getLatestSnapshot()).toEqual(snapshot);
    expect(mockEvents.emitScanStarted).toHaveBeenCalled();
    expect(mockEvents.emitSnapshotCreated).toHaveBeenCalled();
  });
});
