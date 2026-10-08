import { expect, test, describe } from "bun:test";
import { KnowledgeRanker } from "../src/KnowledgeRanker";
import { BrainQuery, QueryType, KnowledgeItem } from "../src/models";

describe("KnowledgeRanker", () => {
  test("ranks and sorts items correctly", () => {
    const ranker = new KnowledgeRanker();
    const query: BrainQuery = { query: "test", intent: QueryType.UNKNOWN, limit: 2 };
    
    const items: KnowledgeItem[] = [
      { id: "1", type: "graph", content: {}, confidence: { score: 1, sources: [], traceable: true }, finalScore: 0.5 },
      { id: "2", type: "wicer", content: {}, confidence: { score: 1, sources: [], traceable: true }, finalScore: 0.9 },
      { id: "3", type: "memory", content: {}, confidence: { score: 1, sources: [], traceable: true }, finalScore: 0.7 }
    ];

    const ranked = ranker.rank(query, items);
    
    expect(ranked.length).toBe(2);
    expect(ranked[0].id).toBe("2");
    expect(ranked[1].id).toBe("3");
  });
});
