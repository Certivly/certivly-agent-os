import { describe, it, expect, mock } from "bun:test";
import { PatternEngine } from "../src/PatternEngine";
import { PatternRegistry } from "../src/PatternRegistry";
import { PatternCompiler } from "../src/PatternCompiler";
import { PatternStore } from "../src/PatternStore";
import { PatternQueryEngine } from "../queries/PatternQueryEngine";
import { PatternAgent } from "../agents/PatternAgent";
import { APIPatternDetector } from "../detectors/APIPatternDetector";

describe("Integration: Scan to Agent Recommendation", () => {
  it("should scan graph, build snapshot, and allow agent to formulate recommendations", async () => {
    const registry = new PatternRegistry();
    registry.register(new APIPatternDetector());

    const compiler = new PatternCompiler();
    const store = new PatternStore();

    const mockEvents = { emitScanStarted: mock(), emitPatternDetected: mock(), emitSnapshotCreated: mock() };
    const mockMetrics = { recordPatternDetected: mock(), recordScanDuration: mock() };

    const engine = new PatternEngine(registry, compiler, store, mockEvents, mockMetrics);

    const mockGraph = {
      edges: [
        { type: "import", id: "e1", target: "hono" },
        { type: "import", id: "e2", target: "hono" }
      ]
    };

    // 1. Scan
    await engine.scan(mockGraph, [], "repo-v2");

    // 2. Query Engine setup
    const queryEngine = new PatternQueryEngine(store);

    // 3. Agent Execution
    const agent = new PatternAgent(queryEngine);
    const context = { goal: "Add new API route", repositorySnapshot: {}, memory: [], knowledge: [], previousResults: [] };
    
    const result = await agent.execute(context as any);

    expect(result.findings.length).toBe(1);
    expect(result.findings[0]).toContain("Hono");
    expect(result.recommendations).toContain("Follow detected patterns to avoid architectural drift.");
  });
});
