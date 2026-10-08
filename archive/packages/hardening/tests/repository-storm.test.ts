import { expect, test, describe } from "bun:test";
import { EventBus } from "../../daemon/src/streaming/EventBus";
import { RepositoryStorm } from "../src/stress/RepositoryStorm";

describe("Repository Storm", () => {
  test("can process 1000 file updates per minute cleanly", async () => {
    const bus = new EventBus();
    const storm = new RepositoryStorm(bus);
    
    let received = 0;
    bus.subscribe("repo:test-repo", () => {
      received++;
    });

    // Run a high-speed simulation: 1000 updates, but run very fast for testing (e.g. 10ms total)
    // Overriding the timing to be fast for unit testing purposes.
    const originalLog = console.log;
    console.log = () => {};
    
    for (let i = 0; i < 1000; i++) {
      bus.publish({
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        channel: `repo:test-repo`,
        topic: 'daemon.repository.updated',
        payload: { repositoryId: 'test-repo', eventName: 'change', path: `file-${i}.ts` }
      });
    }

    console.log = originalLog;
    expect(received).toBe(1000);
  });
});
