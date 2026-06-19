import { expect, test, describe } from "bun:test";
import { DaemonBootstrap } from "../src/DaemonBootstrap";
import { Transport } from "../src/api/Transport";

class MockTransport implements Transport {
  async start() {}
  async stop() {}
  async broadcast() {}
  async send() {}
  onMessage() {}
  onConnect() {}
  onDisconnect() {}
}

describe("AgentDaemon", () => {
  test("starts and stops correctly", async () => {
    const config = { maxConcurrentRuntimes: 10, dataDir: "./.test-daemon", socketPath: "" };
    const { daemon } = DaemonBootstrap.create(config, new MockTransport());
    
    await daemon.start();
    await daemon.stop();
    expect(true).toBe(true);
  });
});
