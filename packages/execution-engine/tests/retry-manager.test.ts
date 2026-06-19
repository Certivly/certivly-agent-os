import { describe, it, expect } from "bun:test";
import { RetryManager } from "../src/RetryManager";
import { FailureAnalyzer } from "../src/FailureAnalyzer";

describe("RetryManager", () => {
  const analyzer = new FailureAnalyzer();
  
  it("should retry SKILL failures up to 2 times", () => {
    const manager = new RetryManager(analyzer);
    const task = { id: "t1", type: "SKILL", title: "Skill Task" };
    
    // Attempt 1 fails -> Retry
    expect(manager.handleFailure(task, new Error("skill failed"))).toBe("RETRY");
    expect(manager.getRetryCount("t1")).toBe(1);

    // Attempt 2 fails -> Retry
    expect(manager.handleFailure(task, new Error("skill failed again"))).toBe("RETRY");
    expect(manager.getRetryCount("t1")).toBe(2);

    // Attempt 3 fails -> Abort
    expect(manager.handleFailure(task, new Error("skill failed third time"))).toBe("ABORT");
  });

  it("should replan on VALIDATION failures", () => {
    const manager = new RetryManager(analyzer);
    const task = { id: "t2", type: "VALIDATE", title: "Validate Task" };
    
    expect(manager.handleFailure(task, new Error("validation error"))).toBe("REPLAN");
  });

  it("should abort on SANDBOX failures", () => {
    const manager = new RetryManager(analyzer);
    const task = { id: "t3", type: "TEST", title: "Test Task" };
    
    expect(manager.handleFailure(task, new Error("sandbox crashed isolated runtime"))).toBe("ABORT");
  });

  it("should retry PATCH failures up to 1 time", () => {
    const manager = new RetryManager(analyzer);
    const task = { id: "t4", type: "PATCH", title: "Patch Task" };
    
    // Attempt 1 fails -> Retry
    expect(manager.handleFailure(task, new Error("patch generation failed"))).toBe("RETRY");
    expect(manager.getRetryCount("t4")).toBe(1);

    // Attempt 2 fails -> Abort
    expect(manager.handleFailure(task, new Error("patch generation failed again"))).toBe("ABORT");
  });
});
