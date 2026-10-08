import { describe, it, expect } from "bun:test";
import { TaskScheduler } from "../src/TaskScheduler";
import { ExecutionPlan, TaskType } from "@agent-os/planner";

describe("TaskScheduler", () => {
  it("should detect a cycle and throw", () => {
    const plan: ExecutionPlan = {
      id: "plan-1",
      goalId: "g-1",
      goal: "Test",
      tasks: [
        { id: "A", type: TaskType.ANALYZE, title: "A", dependencies: [], status: "pending" },
        { id: "B", type: TaskType.ANALYZE, title: "B", dependencies: [], status: "pending" }
      ],
      dependencies: [
        { fromTaskId: "A", toTaskId: "B" },
        { fromTaskId: "B", toTaskId: "A" }
      ],
      estimatedComplexity: 10,
      riskScore: 10,
      requiresSandbox: false,
      createdAt: Date.now()
    };

    expect(() => new TaskScheduler(plan)).toThrow("Cycle detected");
  });

  it("should return ready tasks correctly resolving DAG", () => {
    const plan: ExecutionPlan = {
      id: "plan-2",
      goalId: "g-2",
      goal: "Test DAG",
      tasks: [
        { id: "A", type: TaskType.ANALYZE, title: "A", dependencies: [], status: "pending" },
        { id: "B", type: TaskType.ANALYZE, title: "B", dependencies: [], status: "pending" },
        { id: "C", type: TaskType.ANALYZE, title: "C", dependencies: [], status: "pending" }
      ],
      dependencies: [
        { fromTaskId: "A", toTaskId: "C" },
        { fromTaskId: "B", toTaskId: "C" }
      ],
      estimatedComplexity: 10,
      riskScore: 10,
      requiresSandbox: false,
      createdAt: Date.now()
    };

    const scheduler = new TaskScheduler(plan);

    // Initial ready tasks: A and B
    let ready = scheduler.getReadyTasks();
    expect(ready.length).toBe(2);
    expect(ready.map(t => t.id).sort()).toEqual(["A", "B"]);

    // Complete A
    scheduler.markTaskRunning("A");
    scheduler.markTaskCompleted("A");

    // C should still not be ready because B is not complete
    ready = scheduler.getReadyTasks();
    expect(ready.length).toBe(1);
    expect(ready[0].id).toBe("B");

    // Complete B
    scheduler.markTaskRunning("B");
    scheduler.markTaskCompleted("B");

    // Now C is ready
    ready = scheduler.getReadyTasks();
    expect(ready.length).toBe(1);
    expect(ready[0].id).toBe("C");
    
    scheduler.markTaskRunning("C");
    scheduler.markTaskCompleted("C");

    expect(scheduler.isComplete()).toBe(true);
  });
});
