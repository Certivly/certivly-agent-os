import { describe, it, expect } from "bun:test";
import { ExecutionReplay } from "../src/ExecutionReplay";

describe("ExecutionReplay", () => {
  it("should reconstruct execution state from events exactly", async () => {
    const mockEvents = [
      { type: "execution.started", timestamp: "2026-01-01T10:00:00Z", payload: { meta: { executionId: "exec-1" } } },
      { type: "task.started", timestamp: "2026-01-01T10:00:01Z", payload: { meta: { taskId: "task-A" } } },
      { type: "task.completed", timestamp: "2026-01-01T10:00:02Z", payload: { meta: { taskId: "task-A" } } },
      { type: "task.started", timestamp: "2026-01-01T10:00:03Z", payload: { meta: { taskId: "task-B" } } },
      { type: "task.failed", timestamp: "2026-01-01T10:00:04Z", payload: { meta: { taskId: "task-B", error: "fail" } } },
      { type: "validation.completed", timestamp: "2026-01-01T10:00:05Z", payload: { meta: { executionId: "exec-1", passed: true } } },
      { type: "approval.generated", timestamp: "2026-01-01T10:00:06Z", payload: { meta: { executionId: "exec-1" } } },
      { type: "execution.completed", timestamp: "2026-01-01T10:00:07Z", payload: { meta: { executionId: "exec-1" } } }
    ];

    const mockStore = {
      query: async () => mockEvents
    };

    const replayer = new ExecutionReplay(mockStore);
    const state = await replayer.replay("exec-1");

    expect(state.executionId).toBe("exec-1");
    expect(state.status).toBe("completed");
    expect(state.completedTasks).toContain("task-A");
    expect(state.failedTasks).toContain("task-B");
    expect(state.validationStatus).toBe("passed");
    expect(state.approvalStatus).toBe("approved");
    expect(state.currentTask).toBeUndefined();
  });
});
