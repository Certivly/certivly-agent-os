import { describe, it, expect, beforeEach, mock } from "bun:test";
import { Planner } from "../src/Planner";
import { GoalAnalyzer } from "../src/GoalAnalyzer";
import { PlanBuilder } from "../src/PlanBuilder";
import { PlanValidator } from "../src/PlanValidator";
import { ExecutionCoordinator } from "../src/ExecutionCoordinator";
import { PlannerEvents } from "../src/PlannerEvents";
import { PlannerMetrics } from "../src/PlannerMetrics";
import { LoggingEventBus } from "@agent-os/shared";
import { MetricRegistry } from "@agent-os/metrics";
import { GoalRequest, TaskType, ExecutionPlan } from "../src/models";

describe("Planner", () => {
  let planner: Planner;
  let analyzer: GoalAnalyzer;
  let builder: PlanBuilder;
  let validator: PlanValidator;
  let coordinator: ExecutionCoordinator;
  
  beforeEach(() => {
    // Mock the dependencies
    const eventBus = new LoggingEventBus();
    const metricsRegistry = new MetricRegistry();
    const events = new PlannerEvents(eventBus);
    const metrics = new PlannerMetrics(metricsRegistry);

    // Mock analyzer & builder
    analyzer = new GoalAnalyzer();
    builder = new PlanBuilder();
    validator = new PlanValidator();
    
    coordinator = {
      coordinateExecution: mock(async () => true)
    } as unknown as ExecutionCoordinator;

    planner = new Planner(analyzer, builder, validator, coordinator, events, metrics);
  });

  it("should create a valid plan for a BUG_FIX goal", async () => {
    const request: GoalRequest = {
      requestId: "req-1",
      sessionId: "session-1",
      goal: "Fix the failing tests in repository",
      workspaceRoot: "/workspace",
      approvalMode: "always"
    };

    const plan = await planner.createPlan(request);
    
    expect(plan.id).toBeDefined();
    expect(plan.goalId).toBe("req-1");
    expect(plan.tasks.length).toBeGreaterThan(0);
    expect(plan.tasks.some(t => t.type === TaskType.ANALYZE)).toBe(true);
    expect(plan.tasks.some(t => t.type === TaskType.TEST)).toBe(true);

    const validation = await planner.validatePlan(plan);
    expect(validation.valid).toBe(true);
  });

  it("should execute a valid plan successfully", async () => {
    const request: GoalRequest = {
      requestId: "req-2",
      sessionId: "session-2",
      goal: "Analyze the repository",
      workspaceRoot: "/workspace",
      approvalMode: "always"
    };

    const plan = await planner.createPlan(request);
    const result = await planner.executePlan(plan);

    expect(result.success).toBe(true);
    expect(result.planId).toBe(plan.id);
  });
});
