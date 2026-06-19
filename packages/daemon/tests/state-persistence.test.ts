import { expect, test, describe, beforeAll, afterAll } from "bun:test";
import { StateStore, DaemonState } from "../src/persistence/StateStore";
import { SessionSnapshotStore } from "../src/persistence/SessionSnapshotStore";
import * as fs from 'fs';

const TEST_DIR = "./.test-data";

describe("State Persistence", () => {
  beforeAll(async () => {
    await fs.promises.mkdir(TEST_DIR, { recursive: true });
  });

  afterAll(async () => {
    await fs.promises.rm(TEST_DIR, { recursive: true, force: true });
  });

  test("saves and loads daemon state", async () => {
    const store = new StateStore(TEST_DIR);
    const state: DaemonState = {
      version: "1.0.0",
      repositories: [{ id: "repo-1", rootPath: "/path" }],
      lastSavedAt: Date.now()
    };

    await store.saveState(state);
    const loaded = await store.loadState();
    
    expect(loaded).toBeDefined();
    expect(loaded!.repositories[0].id).toBe("repo-1");
  });

  test("saves and restores session snapshot", async () => {
    const store = new SessionSnapshotStore(TEST_DIR);
    await store.save({
      sessionId: "sess-1",
      repositoryId: "repo-1",
      clientId: "cli-1",
      contextStack: [],
      messages: [],
      savedAt: Date.now()
    });

    const snapshot = await store.restore("sess-1");
    expect(snapshot).toBeDefined();
    expect(snapshot!.sessionId).toBe("sess-1");
  });
});
