import { expect, test, describe } from "bun:test";
import { RepositoryCache } from "../src/repositories/RepositoryCache";
import { RepositoryRegistry } from "../src/repositories/RepositoryRegistry";

describe("RepositoryCache", () => {
  test("caches and returns workspace", async () => {
    const registry = new RepositoryRegistry();
    const cache = new RepositoryCache(registry);

    const workspace1 = await cache.getWorkspace("repo-1", "/path");
    expect(workspace1.repositoryId).toBe("repo-1");

    const workspace2 = await cache.getWorkspace("repo-1", "/path");
    expect(workspace1).toBe(workspace2); // Same reference = cached
  });
});
