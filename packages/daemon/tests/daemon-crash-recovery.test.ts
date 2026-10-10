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

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

describe("DaemonCrashRecovery", () => {
  test("lifecycle completes startup and shutdown", async () => {
    const tmpDir = path.join(os.tmpdir(), `test-lifecycle-${Date.now()}`);
    try {
      const config = { maxConcurrentRuntimes: 10, dataDir: tmpDir, socketPath: "" };
      const { lifecycle } = DaemonBootstrap.create(config, new MockTransport());
      
      await lifecycle.startup();
      await lifecycle.shutdown();
      expect(true).toBe(true);
    } finally {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    }
  });
});
