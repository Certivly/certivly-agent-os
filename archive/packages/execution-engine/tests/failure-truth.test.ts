import { describe, expect, it, mock } from "bun:test";
import { TaskDispatcher } from "../src/TaskDispatcher";
import { ValidationCoordinator } from "../src/ValidationCoordinator";
import { PlanExecutor } from "../src/PlanExecutor";
import { ExecutionEvents } from "../src/ExecutionEvents";
import { ExecutionMetrics } from "../src/ExecutionMetrics";
import { ExecutionPlan, TaskType } from "@agent-os/planner";

describe("Execution failure truthfulness", () => {
  it("throws when TEST command exits non-zero", async () => {
    const dispatcher = new TaskDispatcher({}, {}, {}, {});
    const sandbox = {
      execute: mock(async () => ({
        exitCode: 1,
        stdout: "",
        stderr: "tests failed"
      }))
    };

    await expect(
      dispatcher.dispatch(
        { id: "test-task", type: "TEST", title: "Run tests" },
        { sandbox }
      )
    ).rejects.toThrow(/tests failed/);
  });

  it("validation fails if any build lint or test check fails", async () => {
    const sandbox = {
      execute: mock(async (command: string) => {
        if (command === "bun run lint") {
          return { exitCode: 1, stdout: "", stderr: "lint failed" };
        }
        return { exitCode: 0, stdout: "ok", stderr: "" };
      })
    };

    const coordinator = new ValidationCoordinator({});
    const result = await coordinator.validate({
      executionId: "exec",
      sessionId: "session",
      requestId: "request",
      workspaceRoot: "/workspace",
      planId: "plan",
      startedAt: Date.now(),
      sandbox: sandbox as any
    });

    expect(result.buildPassed).toBe(true);
    expect(result.lintPassed).toBe(false);
    expect(result.testsPassed).toBe(true);
    expect(result.passed).toBe(false);
    expect(result.errors.join("\n")).toContain("lint failed");
  });

  it("validation reports missing sandbox as skipped instead of passed", async () => {
    const coordinator = new ValidationCoordinator({});
    const result = await coordinator.validate({
      executionId: "exec",
      sessionId: "session",
      requestId: "request",
      workspaceRoot: "/workspace",
      planId: "plan",
      startedAt: Date.now()
    });

    expect(result.passed).toBe(false);
    expect(result.skipped).toEqual(["build", "lint", "test"]);
  });

  it("PlanExecutor fails a task that returns success false", async () => {
    const dispatcher = {
      dispatch: mock(async () => ({ success: false, error: "skill failed" }))
    } as unknown as TaskDispatcher;
    const events = {
      emitExecutionStarted: mock(),
      emitExecutionFailed: mock(),
      emitTaskStarted: mock(),
      emitTaskFailed: mock(),
      emitTaskRetried: mock()
    } as unknown as ExecutionEvents;
    const metrics = {
      recordExecutionStarted: mock(),
      recordTaskFailed: mock(),
      recordExecutionFailed: mock()
    } as unknown as ExecutionMetrics;
    const retry = { handleFailure: mock(() => "ABORT") };
    const validation = { validate: mock() };
    const approval = { generateApprovalPackage: mock() };
    const sandbox = { createSandbox: mock(async () => ({ destroy: mock(async () => {}) })) };

    const executor = new PlanExecutor(
      dispatcher,
      events,
      metrics,
      retry,
      validation,
      approval,
      sandbox
    );

    const plan: ExecutionPlan = {
      id: "plan",
      goalId: "goal",
      goal: "fail task",
      tasks: [
        { id: "A", type: TaskType.SKILL, title: "A", dependencies: [], status: "pending" }
      ],
      dependencies: [],
      estimatedComplexity: 1,
      riskScore: 1,
      requiresSandbox: true,
      createdAt: Date.now()
    };

    await expect(
      executor.execute({
        executionId: "exec",
        sessionId: "session",
        requestId: "request",
        workspaceRoot: "/workspace",
        planId: "plan",
        startedAt: Date.now()
      }, plan)
    ).rejects.toThrow(/Execution aborted/);
  });
});
