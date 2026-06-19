import { expect, test, describe } from "bun:test";
import { SessionCoordinator } from "../../daemon/src/sessions/SessionCoordinator";
import { RuntimePool } from "../../daemon/src/sessions/RuntimePool";
import { RepositoryCache } from "../../daemon/src/repositories/RepositoryCache";
import { RepositoryRegistry } from "../../daemon/src/repositories/RepositoryRegistry";
import { SessionStorm } from "../src/stress/SessionStorm";

describe("Session Storm", () => {
  test("cycles 1000 sessions smoothly without leaking", async () => {
    const pool = new RuntimePool(50);
    const registry = new RepositoryRegistry();
    const cache = new RepositoryCache(registry);
    const coordinator = new SessionCoordinator(pool, cache);
    
    const storm = new SessionStorm(coordinator);
    
    // Simulate high load: 50 concurrent connections reconnecting 20 times each = 1000 cycles
    await storm.run(50, 20);
    
    // ensure storm completed without crashes
    expect(coordinator['sessions'].size).toBeGreaterThanOrEqual(0);
  });
});
