import { expect, test, describe } from "bun:test";
import { BackpressureController } from "../../daemon/src/streaming/BackpressureController";

describe("Event Backpressure", () => {
  test("drops oldest 20% of events when buffer limit reached", () => {
    const controller = new BackpressureController(100, 0.2);
    
    const buffer = Array.from({ length: 110 }, (_, i) => ({
      id: `ev-${i}`, timestamp: Date.now(), channel: 'test', topic: 'test', payload: {}
    }));

    const compacted = controller.applyBackpressure(buffer);
    
    expect(compacted.length).toBe(90); // 110 - 20 (20% of max 100)
    expect(compacted[0].id).toBe("ev-20"); // Dropped ev-0 to ev-19
  });
});
