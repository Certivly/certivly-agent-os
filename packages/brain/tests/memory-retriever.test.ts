import { expect, test, describe } from "bun:test";
import { MemoryRetriever, MemoryStore } from "../src/retrieval/MemoryRetriever";
import { BrainQuery, QueryType } from "../src/models";

class MockMemoryStore implements MemoryStore {
  async searchMemories(query: string): Promise<any[]> {
    return [{ id: "mem1", content: "memory-data", confidence: 0.9 }];
  }
}

describe("MemoryRetriever", () => {
  test("retrieves memories correctly", async () => {
    const store = new MockMemoryStore();
    const retriever = new MemoryRetriever(store);
    const query: BrainQuery = { query: "test", intent: QueryType.HISTORY };
    
    const results = await retriever.retrieve(query);
    expect(results.length).toBe(1);
    expect(results[0].type).toBe("memory");
    expect(results[0].confidence.traceable).toBe(true);
    expect(results[0].confidence.score).toBe(0.9);
  });
});
