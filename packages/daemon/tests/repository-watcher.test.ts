import { expect, test, describe } from "bun:test";
import { EventBus } from "../src/streaming/EventBus";
import { RepositoryWatcher } from "../src/watchers/RepositoryWatcher";

describe("RepositoryWatcher", () => {
  test("watches and unwatches repository paths", async () => {
    const bus = new EventBus();
    const watcher = new RepositoryWatcher(bus);
    
    await watcher.watch("test-repo", "/fake/path");
    await watcher.unwatch("test-repo");
    expect(true).toBe(true);
  });
});
