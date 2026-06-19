import { describe, it, expect, mock, beforeEach } from "bun:test";
import { Planner } from "../src/Planner";
import { GoalAnalyzer } from "../src/GoalAnalyzer";
import { PlanBuilder } from "../src/PlanBuilder";
import { PlanValidator } from "../src/PlanValidator";
import { ExecutionCoordinator } from "../src/ExecutionCoordinator";
import { PlannerEvents } from "../src/PlannerEvents";
import { PlannerMetrics } from "../src/PlannerMetrics";
import { LoggingEventBus } from "@agent-os/shared";
import { MetricRegistry } from "@agent-os/metrics";
import { GoalRequest, TaskType } from "../src/models";

describe("Planner Determinism & Replay", () => {
  let planner: Planner;

  beforeEach(() => {
    const eventBus = new LoggingEventBus();
    const metricsRegistry = new MetricRegistry();
    const events = new PlannerEvents(eventBus);
    const metrics = new PlannerMetrics(metricsRegistry);

    const analyzer = new GoalAnalyzer({} as any);
    const builder = new PlanBuilder();
    const validator = new PlanValidator();
    const coordinator = {
      coordinateExecution: mock(async () => true)
    } as unknown as ExecutionCoordinator;

    planner = new Planner(analyzer, builder, validator, coordinator, events, metrics);
  });

  it("should generate the exact same plan given the same goal (Determinism Rule)", async () => {
    const request: GoalRequest = {
      requestId: "req-replay-1",
      sessionId: "session-replay",
      goal: "Refactor module X to improve performance",
      workspaceRoot: "/workspace",
      approvalMode: "always"
    };

    const plan1 = await planner.createPlan(request);
    const plan2 = await planner.createPlan(request);

    // Everything except the UUIDs and timestamps should be identical.
    expect(plan1.estimatedComplexity).toBe(plan2.estimatedComplexity);
    expect(plan1.riskScore).toBe(plan2.riskScore);
    expect(plan1.requiresSandbox).toBe(plan2.requiresSandbox);
    expect(plan1.tasks.length).toBe(plan2.tasks.length);
    expect(plan1.dependencies.length).toBe(plan2.dependencies.length);
    
    // Check task sequence is identical
    const types1 = plan1.tasks.map(t => t.type);
    const types2 = plan2.tasks.map(t => t.type);
    expect(types1).toEqual(types2);
  });
});
