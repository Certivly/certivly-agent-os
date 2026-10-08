import { expect, test, describe } from "bun:test";
import { FailureHandler, FailurePolicy } from "../src/orchestration/FailureHandler";

describe("Failure Handler", () => {
  test("FAIL_FAST returns false immediately", async () => {
    const handler = new FailureHandler(FailurePolicy.FAIL_FAST);
    const shouldRetry = await handler.handleFailure("node1", new Error("test"), 1);
    expect(shouldRetry).toBe(false);
  });

  test("RETRY returns true until max attempts", async () => {
    const handler = new FailureHandler(FailurePolicy.RETRY, { maxAttempts: 3, backoffMs: 1 });
    const retry1 = await handler.handleFailure("node1", new Error("test"), 1);
    const retry2 = await handler.handleFailure("node1", new Error("test"), 2);
    const retry3 = await handler.handleFailure("node1", new Error("test"), 3);
    
    expect(retry1).toBe(true);
    expect(retry2).toBe(true);
    expect(retry3).toBe(false); // attempt 3 >= maxAttempts 3
  });
});
