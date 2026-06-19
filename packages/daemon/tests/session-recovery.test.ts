import { expect, test, describe } from "bun:test";
import { SessionRecovery } from "../src/sessions/SessionRecovery";
import { SessionCoordinator } from "../src/sessions/SessionCoordinator";
import { RuntimePool } from "../src/sessions/RuntimePool";
import { RepositoryCache } from "../src/repositories/RepositoryCache";
import { RepositoryRegistry } from "../src/repositories/RepositoryRegistry";

describe("SessionRecovery", () => {
  test("returns false for unknown session", async () => {
    const pool = new RuntimePool(10);
    const cache = new RepositoryCache(new RepositoryRegistry());
    const coordinator = new SessionCoordinator(pool, cache);
    const recovery = new SessionRecovery(coordinator);

    const result = await recovery.recoverSession("non-existent");
    expect(result).toBe(false);
  });
});
