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

describe("Shared State Validation", () => {
  test("repository workspace instance is perfectly shared across daemon", async () => {
    const config = { maxConcurrentRuntimes: 10, dataDir: "./.test", socketPath: "" };
    const { daemon } = DaemonBootstrap.create(config, new MockTransport());

    const workspace1 = await daemon.getRepository("shared-repo", "/path/C");
    const workspace2 = await daemon.getRepository("shared-repo", "/path/C");

    // They must point to the exact same reference
    expect(workspace1).toBe(workspace2);
  });
});
