import { ExecutionPlan, TaskNode, TaskDependency } from "@agent-os/planner";
import { RunnableTask } from "./models";

export class TaskScheduler {
  private taskNodes: Map<string, TaskNode> = new Map();
  private adjList: Map<string, string[]> = new Map();
  private inDegree: Map<string, number> = new Map();
  private completedTasks: Set<string> = new Set();
  private runningTasks: Set<string> = new Set();

  constructor(plan: ExecutionPlan) {
    this.initializeGraph(plan.tasks, plan.dependencies);
  }

  private initializeGraph(tasks: TaskNode[], dependencies: TaskDependency[]) {
    for (const task of tasks) {
      this.taskNodes.set(task.id, task);
      this.adjList.set(task.id, []);
      this.inDegree.set(task.id, 0);
    }

    for (const dep of dependencies) {
      if (this.adjList.has(dep.fromTaskId) && this.inDegree.has(dep.toTaskId)) {
        this.adjList.get(dep.fromTaskId)!.push(dep.toTaskId);
        this.inDegree.set(dep.toTaskId, this.inDegree.get(dep.toTaskId)! + 1);
      }
    }

    if (this.detectCycles()) {
      throw new Error("Cycle detected in ExecutionPlan DAG.");
    }
  }

  public detectCycles(): boolean {
    const visited = new Set<string>();
    const stack = new Set<string>();

    const dfs = (nodeId: string): boolean => {
      if (stack.has(nodeId)) return true;
      if (visited.has(nodeId)) return false;

      visited.add(nodeId);
      stack.add(nodeId);

      const neighbors = this.adjList.get(nodeId) || [];
      for (const neighbor of neighbors) {
        if (dfs(neighbor)) return true;
      }

      stack.delete(nodeId);
      return false;
    };

    for (const nodeId of this.taskNodes.keys()) {
      if (dfs(nodeId)) return true;
    }

    return false;
  }

  public getReadyTasks(): RunnableTask[] {
    const readyTasks: RunnableTask[] = [];

    for (const [taskId, degree] of this.inDegree.entries()) {
      if (
        degree === 0 &&
        !this.completedTasks.has(taskId) &&
        !this.runningTasks.has(taskId)
      ) {
        const node = this.taskNodes.get(taskId)!;
        readyTasks.push({
          id: node.id,
          type: node.type,
          title: node.title,
          assignedSkill: node.assignedSkill
        });
      }
    }

    return readyTasks;
  }

  public markTaskRunning(taskId: string) {
    this.runningTasks.add(taskId);
  }

  public markTaskCompleted(taskId: string) {
    this.runningTasks.delete(taskId);
    this.completedTasks.add(taskId);

    // Decrease in-degree of neighbors
    const neighbors = this.adjList.get(taskId) || [];
    for (const neighbor of neighbors) {
      const currentInDegree = this.inDegree.get(neighbor)!;
      this.inDegree.set(neighbor, currentInDegree - 1);
    }
  }

  public markTaskFailed(taskId: string) {
    this.runningTasks.delete(taskId);
  }

  public isComplete(): boolean {
    return this.completedTasks.size === this.taskNodes.size;
  }
}
