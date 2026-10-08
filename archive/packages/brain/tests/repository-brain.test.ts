import { expect, test, describe } from "bun:test";
import { RepositoryBrain, EventEmitter } from "../src/RepositoryBrain";
import { HybridRetriever } from "../src/retrieval/HybridRetriever";
import { GraphRetriever, GraphStore } from "../src/retrieval/GraphRetriever";
import { WikiRetriever, WiCERStore } from "../src/retrieval/WikiRetriever";
import { BrainQuery, QueryType } from "../src/models";

class MockGraphStore implements GraphStore {
  async queryNodes(query: string) { return [{ id: "g1", name: "Node" }]; }
}
class MockWiCERStore implements WiCERStore {
  async searchKnowledgeUnits(query: string) { return [{ id: "w1", content: "Wiki" }]; }
}
class MockEventEmitter implements EventEmitter {
  events: { name: string, payload: any }[] = [];
  emit(event: string, payload: any) {
    this.events.push({ name: event, payload });
  }
}

describe("RepositoryBrain", () => {
  test("answers queries effectively", async () => {
    const graphRetriever = new GraphRetriever(new MockGraphStore());
    const wikiRetriever = new WikiRetriever(new MockWiCERStore());
    const hybridRetriever = new HybridRetriever([graphRetriever, wikiRetriever]);
    const eventEmitter = new MockEventEmitter();
    
    const brain = new RepositoryBrain(hybridRetriever, eventEmitter);
    
    const query: BrainQuery = { query: "architecture of system", intent: QueryType.UNKNOWN };
    const response = await brain.answer(query);
    
    expect(response.context.query.intent).toBe(QueryType.ARCHITECTURE);
    expect(response.context.knowledge.length).toBeGreaterThan(0);
    expect(response.assembledText).toContain("architecture of system");
    expect(response.assembledText).toContain("Traceable: true");

    expect(eventEmitter.events.map(e => e.name)).toContain("brain.query.started");
    expect(eventEmitter.events.map(e => e.name)).toContain("brain.answer.generated");
  });
});
