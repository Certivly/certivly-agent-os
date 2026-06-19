import { expect, test, describe } from "bun:test";
import { RepositoryCache } from "../src/repositories/RepositoryCache";
import { RepositoryRegistry } from "../src/repositories/RepositoryRegistry";

describe("DaemonBrainIntegration", () => {
  test("brain is loaded as part of repository workspace", async () => {
    const registry = new RepositoryRegistry();
    const cache = new RepositoryCache(registry);
    
    const workspace = await cache.getWorkspace("repo-1", "/path");
    
    expect(workspace.brain).toBeDefined();
  });
});
