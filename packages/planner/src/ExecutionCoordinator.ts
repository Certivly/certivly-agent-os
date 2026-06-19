import { ExecutionPlan, TaskNode, TaskType } from "./models";
import { TaskScheduler } from "./TaskScheduler";
import { TaskGraph } from "./TaskGraph";
import { SandboxCoordinator } from "./SandboxCoordinator";
import { SkillResolver } from "./SkillResolver";
import { PlannerEvents } from "./PlannerEvents";

export class ExecutionCoordinator {
  constructor(
    private scheduler: TaskScheduler,
    private sandboxCoordinator: SandboxCoordinator,
    private skillResolver: SkillResolver,
    private events: PlannerEvents
  ) {}

  public async coordinateExecution(plan: ExecutionPlan): Promise<boolean> {
    this.events.emitExecutionStarted(plan.id);

    const graph = new TaskGraph();
    plan.tasks.forEach(t => graph.addNode(t));
    plan.dependencies.forEach(d => graph.addDependency(d));

    let sandboxId: string | undefined = undefined;
    if (plan.requiresSandbox) {
      sandboxId = await this.sandboxCoordinator.acquireSandbox(plan.id, { type: "local" });
    }

    try {
      const success = await this.scheduler.scheduleTasks(graph, async (task: TaskNode) => {
        return this.executeTask(task, sandboxId);
      });

      if (success) {
        this.events.emitExecutionCompleted(plan.id);
      } else {
        this.events.emitExecutionFailed(plan.id, "One or more tasks failed");
      }
      return success;
    } catch (e: any) {
      this.events.emitExecutionFailed(plan.id, e.message);
      return false;
    } finally {
      if (sandboxId) {
        await this.sandboxCoordinator.releaseSandbox(sandboxId);
      }
    }
  }

  private async executeTask(task: TaskNode, sandboxId?: string): Promise<boolean> {
    // Dispatch based on task type.
    switch (task.type) {
      case TaskType.ANALYZE:
      case TaskType.SEARCH:
      case TaskType.VALIDATE:
      case TaskType.APPROVAL:
        return this.executeLocalTask(task);
      case TaskType.SKILL:
        return this.executeSkillTask(task);
      case TaskType.MODIFY:
      case TaskType.TEST:
      case TaskType.PATCH:
        if (!sandboxId) throw new Error("Sandbox required for this task type");
        return this.executeSandboxTask(task, sandboxId);
      default:
        throw new Error(`Unknown task type: ${task.type}`);
    }
  }

  private async executeLocalTask(task: TaskNode): Promise<boolean> {
    // Execute locally
    return true;
  }

  private async executeSkillTask(task: TaskNode): Promise<boolean> {
    if (!task.assignedSkill) throw new Error("No skill assigned");
    // Resolve and invoke skill via registry
    return true;
  }

  private async executeSandboxTask(task: TaskNode, sandboxId: string): Promise<boolean> {
    // Execute inside sandbox securely
    return true;
  }
}
