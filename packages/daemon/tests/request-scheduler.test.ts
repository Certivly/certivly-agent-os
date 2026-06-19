import { expect, test, describe } from "bun:test";
import { RequestQueue } from "../src/scheduler/RequestQueue";
import { RequestScheduler } from "../src/scheduler/RequestScheduler";
import { RuntimePool } from "../src/sessions/RuntimePool";

describe("RequestScheduler", () => {
  test("queues and executes requests with priority", async () => {
    const queue = new RequestQueue();
    const pool = new RuntimePool(5);
    const scheduler = new RequestScheduler(queue, pool);

    pool.acquireRuntime("default");

    const result = await scheduler.schedule({ id: "req1", type: "CHAT_MESSAGE", payload: {} });
    expect(result.status).toBe("success");
  });
});
