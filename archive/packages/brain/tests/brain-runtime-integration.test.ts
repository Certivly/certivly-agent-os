import { expect, test, describe } from "bun:test";
import { RepositoryBrain } from "../src/RepositoryBrain";
import { HybridRetriever } from "../src/retrieval/HybridRetriever";
import { GraphRetriever } from "../src/retrieval/GraphRetriever";
import { WikiRetriever } from "../src/retrieval/WikiRetriever";
import { MemoryRetriever } from "../src/retrieval/MemoryRetriever";
import { EventRetriever } from "../src/retrieval/EventRetriever";
import { BrainQuery, QueryType } from "../src/models";

describe("Brain Runtime Integration", () => {
  test("full agent context assembly pipeline", async () => {
    const graphRetriever = new GraphRetriever();
    const wikiRetriever = new WikiRetriever();
    const memoryRetriever = new MemoryRetriever();
    const eventRetriever = new EventRetriever();
    
    const hybridRetriever = new HybridRetriever([
      graphRetriever, 
      wikiRetriever, 
      memoryRetriever, 
      eventRetriever
    ]);
    
    const brain = new RepositoryBrain(hybridRetriever);
    
    // Simulate a complex query
    const query: BrainQuery = { query: "why was the notification system changed?", intent: QueryType.UNKNOWN };
    
    const response = await brain.answer(query);
    
    // The query should be classified as HISTORY based on keywords "why", "change"
    expect(response.context.query.intent).toBe(QueryType.HISTORY);
    
    // Without mock stores, retrieved knowledge will be empty, but the pipeline shouldn't crash
    expect(response.context.knowledge.length).toBe(0);
    expect(response.assembledText).toContain("why was the notification system changed");
    expect(response.context.score).toBeDefined();
  });
});
