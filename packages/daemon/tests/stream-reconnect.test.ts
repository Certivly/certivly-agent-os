import { expect, test, describe } from "bun:test";
import { StreamReplayBuffer } from "../src/streaming/StreamReplayBuffer";
import { StreamManager } from "../src/streaming/StreamManager";
import { EventBus } from "../src/streaming/EventBus";
import { Transport } from "../src/api/Transport";

class MockTransport implements Transport {
  public sentEvents: any[] = [];
  async start() {}
  async stop() {}
  async broadcast() {}
  async send(clientId: string, msg: any) { this.sentEvents.push(msg); }
  onMessage() {}
  onConnect() {}
  onDisconnect() {}
}

describe("Stream Reconnect", () => {
  test("buffers events and replays them", () => {
    const bus = new EventBus();
    const transport = new MockTransport();
    const manager = new StreamManager(bus, transport);

    // Publish event
    const timestamp = Date.now();
    bus.publish({
      id: "1", timestamp: timestamp + 10, channel: "session:123", topic: "test", payload: {}
    });

    // Replay
    manager.replayToClient("client-A", "123", timestamp);

    expect(transport.sentEvents.length).toBe(1);
    expect(transport.sentEvents[0].type).toBe("REPLAY_EVENT");
  });
});
