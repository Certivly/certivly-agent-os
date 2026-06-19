import { expect, test, describe } from "bun:test";
import { EventBus } from "../src/streaming/EventBus";

describe("EventBus", () => {
  test("publishes and subscribes to events", () => {
    const bus = new EventBus();
    let received = 0;

    bus.subscribe("test-channel", (event) => {
      received++;
      expect(event.topic).toBe("test.topic");
    });

    bus.publish({
      id: "1", timestamp: Date.now(), channel: "test-channel", topic: "test.topic", payload: {}
    });

    expect(received).toBe(1);
  });
});
