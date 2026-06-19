import { describe, it, expect, mock } from "bun:test";
import { PlanExecutor } from "../src/PlanExecutor";
import { ExecutionEngine } from "../src/ExecutionEngine";
import { TaskDispatcher } from "../src/TaskDispatcher";
import { ExecutionEvents } from "../src/ExecutionEvents";
import { ExecutionMetrics } from "../src/ExecutionMetrics";
import { RetryManager } from "../src/RetryManager";
import { FailureAnalyzer } from "../src/FailureAnalyzer";
import { ValidationCoordinator } from "../src/ValidationCoordinator";
import { ApprovalCoordinator } from "../src/ApprovalCoordinator";
import { ExecutionPlan, TaskType } from "@agent-os/planner";

describe("ExecutionEngine Integration", () => {
  it("should execute end to end successfully", async () => {
    const mockEvents = {
      emitExecutionStarted: mock(),
      emitExecutionCompleted: mock(),
      emitTaskStarted: mock(),
      emitTaskCompleted: mock(),
      emitValidationStarted: mock(),
      emitValidationCompleted: mock(),
      emitApprovalGenerated: mock(),
      emitTaskFailed: mock(),
      emitTaskRetried: mock(),
      emitExecutionFailed: mock(),
      emitPatchGenerated: mock()
    } as unknown as ExecutionEvents;
    
    const mockMetrics = {
      recordExecutionStarted: mock(),
      recordExecutionCompleted: mock(),
      recordTaskCompleted: mock(),
      recordValidationSuccess: mock(),
      recordExecutionDuration: mock(),
      recordTaskFailed: mock()
    } as unknown as ExecutionMetrics;
    
    const mockSkill = { execute: mock(async () => ({ success: true })) };
    const mockSandbox = { 
      createSandbox: mock(async () => "sandbox-id"), 
      destroySandbox: mock(async () => {}),
      executeInSandbox: mock(async () => ({ success: true })) 
    };
    const mockPatchEngine = { generatePatch: mock(async () => ({})) };
    
    const mockTrust = { evaluateRisk: mock(async () => ({ riskScore: 5 })) };
    const mockWicer = { generateImpactReport: mock(async () => ({})) };

    const dispatcher = new TaskDispatcher(mockSkill, mockSandbox, mockPatchEngine, null);
    const analyzer = new FailureAnalyzer();
    const retry = new RetryManager(analyzer);
    const validation = new ValidationCoordinator(mockSandbox);
    const approval = new ApprovalCoordinator(mockPatchEngine, mockTrust, mockWicer);

    const executor = new PlanExecutor(
      dispatcher, mockEvents, mockMetrics, retry, validation, approval, mockSandbox
    );
    const engine = new ExecutionEngine(executor);

    const plan: ExecutionPlan = {
      id: "plan-e2e",
      goalId: "g-e2e",
      goal: "End to end integration",
      tasks: [
        { id: "T1", type: TaskType.ANALYZE, title: "Analyze", dependencies: [], status: "pending" },
        { id: "T2", type: TaskType.SKILL, title: "Skill", dependencies: ["T1"], assignedSkill: "test-skill", status: "pending" },
        { id: "T3", type: TaskType.TEST, title: "Test", dependencies: ["T2"], status: "pending" }
      ],
      dependencies: [
        { fromTaskId: "T1", toTaskId: "T2" },
        { fromTaskId: "T2", toTaskId: "T3" }
      ],
      estimatedComplexity: 5,
      riskScore: 5,
      requiresSandbox: true,
      createdAt: Date.now()
    };

    const result = await engine.executePlan("session-e2e", "req-e2e", "/ws", plan);
    
    expect(result.summary).toContain("Passed");
    expect(result.validationResult.passed).toBe(true);
    expect(mockSandbox.createSandbox).toHaveBeenCalled();
    expect(mockSkill.execute).toHaveBeenCalled();
    expect(mockPatchEngine.generatePatch).toHaveBeenCalled();
    expect(mockTrust.evaluateRisk).toHaveBeenCalled();
  });
});
