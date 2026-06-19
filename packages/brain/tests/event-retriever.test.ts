import { expect, test, describe } from "bun:test";
import { EventRetriever, EventStore } from "../src/retrieval/EventRetriever";
import { BrainQuery, QueryType } from "../src/models";

class MockEventStore implements EventStore {
  async queryEvents(query: string): Promise<any[]> {
    return [{ id: "evt1", type: "system.started", timestamp: Date.now() }];
  }
}

describe("EventRetriever", () => {
  test("retrieves events correctly", async () => {
    const store = new MockEventStore();
    const retriever = new EventRetriever(store);
    const query: BrainQuery = { query: "test", intent: QueryType.HISTORY };
    
    const results = await retriever.retrieve(query);
    expect(results.length).toBe(1);
    expect(results[0].type).toBe("event");
    expect(results[0].confidence.traceable).toBe(true);
    expect(results[0].confidence.score).toBe(1.0);
  });
});
