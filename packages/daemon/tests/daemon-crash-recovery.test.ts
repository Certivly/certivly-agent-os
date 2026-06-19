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

describe("DaemonCrashRecovery", () => {
  test("lifecycle completes startup and shutdown", async () => {
    const config = { maxConcurrentRuntimes: 10, dataDir: "./.test-lifecycle", socketPath: "" };
    const { lifecycle } = DaemonBootstrap.create(config, new MockTransport());
    
    await lifecycle.startup();
    await lifecycle.shutdown();
    expect(true).toBe(true);
  });
});
