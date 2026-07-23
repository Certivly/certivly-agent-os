import { describe, it, expect, mock } from "bun:test";
import { PlanExecutor } from "../src/PlanExecutor";
import { ExecutionEngine } from "../src/ExecutionEngine";
import { TaskDispatcher } from "../src/TaskDispatcher";
import { ExecutionEvents } from "../src/ExecutionEvents";
import { ExecutionMetrics } from "../src/ExecutionMetrics";
import { ExecutionPlan, TaskType } from "@agent-os/planner";

describe("ExecutionEngine Core", () => {
  it("should successfully execute a basic plan", async () => {
    const mockDispatcher = { dispatch: mock(async () => ({ success: true })) } as unknown as TaskDispatcher;
    const mockEvents = {
      emitExecutionStarted: mock(),
      emitExecutionCompleted: mock(),
      emitTaskStarted: mock(),
      emitTaskCompleted: mock(),
      emitValidationStarted: mock(),
      emitValidationCompleted: mock(),
      emitApprovalGenerated: mock()
    } as unknown as ExecutionEvents;
    
    const mockMetrics = {
      recordExecutionStarted: mock(),
      recordExecutionCompleted: mock(),
      recordTaskCompleted: mock(),
      recordValidationSuccess: mock(),
      recordExecutionDuration: mock()
    } as unknown as ExecutionMetrics;
    
    const mockRetry = { handleFailure: mock() };
    const mockValidation = { validate: mock(async () => ({ passed: true })) };
    const mockApproval = { generateApprovalPackage: mock(async () => ({ summary: "approved" })) };
    const mockSandbox = { createSandbox: mock(async () => ({ destroy: mock(async () => {}) })), destroySandbox: mock(async () => {}) };

    const executor = new PlanExecutor(
      mockDispatcher, mockEvents, mockMetrics, mockRetry, mockValidation, mockApproval, mockSandbox
    );
    const engine = new ExecutionEngine(executor);

    const plan: ExecutionPlan = {
      id: "plan-core",
      goalId: "g-core",
      goal: "Basic core test",
      tasks: [
        { id: "A", type: TaskType.ANALYZE, title: "A", dependencies: [], status: "pending" }
      ],
      dependencies: [],
      estimatedComplexity: 10,
      riskScore: 10,
      requiresSandbox: true,
      createdAt: Date.now()
    };

    const approval = await engine.executePlan("session-1", "req-1", "/ws", plan);
    
    expect(approval.summary).toBe("approved");
    expect(mockSandbox.createSandbox).toHaveBeenCalled();
    expect(mockDispatcher.dispatch).toHaveBeenCalled();
    expect(mockValidation.validate).toHaveBeenCalled();
  });
});
