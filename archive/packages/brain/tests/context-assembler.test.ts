import { expect, test, describe } from "bun:test";
import { ContextAssembler } from "../src/ContextAssembler";
import { BrainQuery, QueryType, RankedKnowledge } from "../src/models";

describe("ContextAssembler", () => {
  test("assembles context correctly", () => {
    const assembler = new ContextAssembler();
    const query: BrainQuery = { query: "test", intent: QueryType.ARCHITECTURE };
    
    const rankedKnowledge: RankedKnowledge[] = [
      { id: "1", type: "graph", content: {}, confidence: { score: 1.0, sources: [], traceable: true }, finalScore: 0.9 },
      { id: "2", type: "wicer", content: {}, confidence: { score: 0.8, sources: [], traceable: true }, finalScore: 0.8 }
    ];

    const context = assembler.assemble(query, rankedKnowledge);
    
    expect(context.query).toEqual(query);
    expect(context.knowledge.length).toBe(2);
    expect(context.score.graphCoverage).toBeGreaterThan(0);
    expect(context.score.wikiCoverage).toBeGreaterThan(0);
    expect(context.score.memoryCoverage).toBe(0);
    expect(context.score.confidence).toBe(0.9); // (1.0 + 0.8) / 2
  });
});
