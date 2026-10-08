import { ExecutionPlan, ExecutionResult, GoalRequest, PlannerPort, PlanValidation } from "./models";
import { GoalAnalyzer } from "./GoalAnalyzer";
import { PlanBuilder } from "./PlanBuilder";
import { PlanValidator } from "./PlanValidator";
import { ExecutionCoordinator } from "./ExecutionCoordinator";
import { PlannerEvents } from "./PlannerEvents";
import { PlannerMetrics } from "./PlannerMetrics";

export class Planner implements PlannerPort {
  constructor(
    private analyzer: GoalAnalyzer,
    private builder: PlanBuilder,
    private validator: PlanValidator,
    private coordinator: ExecutionCoordinator,
    private events: PlannerEvents,
    private metrics: PlannerMetrics
  ) {}

  public async createPlan(request: GoalRequest): Promise<ExecutionPlan> {
    this.events.emitGoalReceived(request.requestId);
    const startTime = Date.now();

    const analysis = await this.analyzer.analyzeGoal(request);
    const plan = this.builder.buildPlan(request, analysis);

    this.metrics.recordPlanGenerationTime(Date.now() - startTime);
    this.metrics.recordPlanCreated();
    this.events.emitPlanCreated(plan.id, plan.riskScore);

    return plan;
  }

  public async validatePlan(plan: ExecutionPlan): Promise<PlanValidation> {
    const validation = this.validator.validate(plan);
    this.events.emitPlanValidated(plan.id, validation.valid);
    if (!validation.valid) {
      this.metrics.recordValidationFailure();
    }
    return validation;
  }

  public async executePlan(plan: ExecutionPlan): Promise<ExecutionResult> {
    const validation = await this.validatePlan(plan);
    if (!validation.valid) {
      return {
        planId: plan.id,
        success: false,
        tasksCompleted: 0,
        tasksFailed: 0,
        error: "Plan validation failed: " + validation.errors.join(", ")
      };
    }

    const startTime = Date.now();
    const success = await this.coordinator.coordinateExecution(plan);
    
    // We would ideally query the graph to see how many were completed vs failed, 
    // but we return the aggregate result here.
    const completed = success ? plan.tasks.length : 0;
    const failed = success ? 0 : 1;

    this.metrics.recordPlanExecutionTime(Date.now() - startTime);

    return {
      planId: plan.id,
      success,
      tasksCompleted: completed,
      tasksFailed: failed,
      error: success ? undefined : "Execution failed during task scheduling."
    };
  }
}
