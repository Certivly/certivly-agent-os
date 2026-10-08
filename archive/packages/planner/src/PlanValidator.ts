import { ExecutionPlan, PlanValidation } from "./models";
import { TaskGraph } from "./TaskGraph";

export class PlanValidator {
  public validate(plan: ExecutionPlan): PlanValidation {
    const errors: string[] = [];

    if (!plan.id) errors.push("Plan missing ID");
    if (!plan.tasks || plan.tasks.length === 0) errors.push("Plan has no tasks");

    const graph = new TaskGraph();
    try {
      plan.tasks.forEach(t => graph.addNode(t));
      plan.dependencies.forEach(d => graph.addDependency(d));
    } catch (e: any) {
      errors.push(`Graph construction error: ${e.message}`);
    }

    // Check for DAG cycles
    if (graph.detectCycles()) {
      errors.push("Plan contains circular dependencies (Cycle detected)");
    }

    // Check for dangling dependencies
    const nodeIds = new Set(plan.tasks.map(t => t.id));
    for (const d of plan.dependencies) {
      if (!nodeIds.has(d.fromTaskId)) errors.push(`Missing dependency source task: ${d.fromTaskId}`);
      if (!nodeIds.has(d.toTaskId)) errors.push(`Missing dependency target task: ${d.toTaskId}`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}
