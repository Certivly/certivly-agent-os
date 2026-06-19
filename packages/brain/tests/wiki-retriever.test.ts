import { expect, test, describe } from "bun:test";
import { WikiRetriever, WiCERStore } from "../src/retrieval/WikiRetriever";
import { BrainQuery, QueryType } from "../src/models";

class MockWiCERStore implements WiCERStore {
  async searchKnowledgeUnits(query: string): Promise<any[]> {
    return [{ id: "wiki1", content: "wiki-knowledge" }];
  }
}

describe("WikiRetriever", () => {
  test("retrieves knowledge units correctly", async () => {
    const store = new MockWiCERStore();
    const retriever = new WikiRetriever(store);
    const query: BrainQuery = { query: "test", intent: QueryType.ARCHITECTURE };
    
    const results = await retriever.retrieve(query);
    expect(results.length).toBe(1);
    expect(results[0].type).toBe("wicer");
    expect(results[0].confidence.traceable).toBe(true);
  });
});
