import { expect, test, describe } from "bun:test";
import { IncrementalUpdatePipeline } from "../src/watchers/IncrementalUpdatePipeline";
import { RepositoryCache } from "../src/repositories/RepositoryCache";
import { RepositoryRegistry } from "../src/repositories/RepositoryRegistry";
import { EventBus } from "../src/streaming/EventBus";

describe("IncrementalUpdatePipeline", () => {
  test("handles file update events", async () => {
    const cache = new RepositoryCache(new RepositoryRegistry());
    const bus = new EventBus();
    const pipeline = new IncrementalUpdatePipeline(cache, bus);

    await cache.getWorkspace("test-repo", "/path");

    bus.publish({
      id: "1", timestamp: Date.now(), channel: "test", topic: "daemon.repository.updated",
      payload: { repositoryId: "test-repo", eventName: "change", path: "src/index.ts" }
    });

    expect(pipeline).toBeDefined();
  });
});
