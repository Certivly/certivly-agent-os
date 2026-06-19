import { expect, test, describe } from "bun:test";
import { RepositoryManager } from "../src/repositories/RepositoryManager";
import { RepositoryRegistry } from "../src/repositories/RepositoryRegistry";
import { RepositoryCache } from "../src/repositories/RepositoryCache";
import { RepositoryWatcher } from "../src/watchers/RepositoryWatcher";
import { EventBus } from "../src/streaming/EventBus";

describe("Multi-Repository Management", () => {
  test("adds and removes multiple repositories", async () => {
    const registry = new RepositoryRegistry();
    const cache = new RepositoryCache(registry);
    const watcher = new RepositoryWatcher(new EventBus());
    const manager = new RepositoryManager(registry, cache, watcher);

    await manager.addRepository("repo-A", "/path/A");
    await manager.addRepository("repo-B", "/path/B");

    expect(manager.listRepositories().length).toBe(2);

    await manager.removeRepository("repo-A");

    expect(manager.listRepositories().length).toBe(1);
    expect(manager.listRepositories()[0].repositoryId).toBe("repo-B");
  });
});
