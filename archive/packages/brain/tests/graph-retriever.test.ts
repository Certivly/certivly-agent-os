import { expect, test, describe } from "bun:test";
import { GraphRetriever, GraphStore } from "../src/retrieval/GraphRetriever";
import { BrainQuery, QueryType } from "../src/models";

class MockGraphStore implements GraphStore {
  async queryNodes(query: string): Promise<any[]> {
    return [{ id: "node1", name: "testNode" }];
  }
}

describe("GraphRetriever", () => {
  test("retrieves evidence correctly", async () => {
    const store = new MockGraphStore();
    const retriever = new GraphRetriever(store);
    const query: BrainQuery = { query: "test", intent: QueryType.UNKNOWN };
    
    const results = await retriever.retrieve(query);
    expect(results.length).toBe(1);
    expect(results[0].type).toBe("graph");
    expect(results[0].confidence.traceable).toBe(true);
    expect(results[0].confidence.score).toBeGreaterThan(0);
  });

  test("handles empty store", async () => {
    const retriever = new GraphRetriever();
    const query: BrainQuery = { query: "test", intent: QueryType.UNKNOWN };
    const results = await retriever.retrieve(query);
    expect(results.length).toBe(0);
  });
});
