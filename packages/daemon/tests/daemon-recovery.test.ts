import { expect, test, describe, beforeAll, afterAll } from "bun:test";
import { DaemonBootstrap } from "../src/DaemonBootstrap";
import { Transport } from "../src/api/Transport";
import * as fs from 'fs';

class MockTransport implements Transport {
  async start() {}
  async stop() {}
  async broadcast() {}
  async send() {}
  onMessage() {}
  onConnect() {}
  onDisconnect() {}
}

const TEST_DIR = "./.recovery-test";

describe("Daemon Recovery", () => {
  beforeAll(async () => {
    await fs.promises.mkdir(TEST_DIR, { recursive: true });
  });

  afterAll(async () => {
    await fs.promises.rm(TEST_DIR, { recursive: true, force: true });
  });

  test("loads existing state on bootstrap", async () => {
    const config = { maxConcurrentRuntimes: 10, dataDir: TEST_DIR, socketPath: "" };
    
    // First instance - acts as if it was running and saving state
    const firstInstance = DaemonBootstrap.create(config, new MockTransport());
    await firstInstance.daemon.getRepository("test-repo", "/mock/path");
    await firstInstance.lifecycle.shutdown(); // This persists state to disk
    
    // Second instance - should recover the state
    const secondInstance = DaemonBootstrap.create(config, new MockTransport());
    await secondInstance.lifecycle.startup();
    
    // Verify repository was restored automatically
    const repos = secondInstance.daemon['repositoryManager'].listRepositories();
    expect(repos.length).toBe(1);
    expect(repos[0].repositoryId).toBe("test-repo");
    
    await secondInstance.lifecycle.shutdown();
  });
});
