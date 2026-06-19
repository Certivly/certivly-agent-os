import { expect, test, describe } from "bun:test";
import { EventStorm } from "../src/stress/EventStorm";
import { EventBus } from "../../daemon/src/streaming/EventBus";

describe("Event Store Integrity", () => {
  test("generates massively concurrent events without dropping sequence", async () => {
    const bus = new EventBus();
    const storm = new EventStorm(bus);
    
    let received = 0;
    bus.subscribe("storm-channel", () => {
      received++;
    });

    await storm.flood(10000, 10); // 10k events in 10ms for stress test

    expect(received).toBe(10000);
  });
});
