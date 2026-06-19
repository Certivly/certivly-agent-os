import { TaskGraph } from "./TaskGraph";
import { TaskNode } from "./models";
import { PlannerEvents } from "./PlannerEvents";

export class TaskScheduler {
  constructor(private events: PlannerEvents) {}

  public async scheduleTasks(
    graph: TaskGraph, 
    executeTask: (task: TaskNode) => Promise<boolean>
  ): Promise<boolean> {
    
    const runningTasks = new Set<Promise<void>>();

    while (!graph.isComplete() && !graph.hasFailedNodes()) {
      const readyNodes = graph.getReadyNodes();
      
      if (readyNodes.length === 0 && runningTasks.size === 0) {
        // Deadlock or all done
        break;
      }

      for (const node of readyNodes) {
        graph.updateNodeStatus(node.id, "running");
        this.events.emitTaskStarted(node.id);

        const taskPromise = executeTask(node).then(success => {
          if (success) {
            graph.updateNodeStatus(node.id, "completed");
            this.events.emitTaskCompleted(node.id);
          } else {
            graph.updateNodeStatus(node.id, "failed");
            this.events.emitTaskFailed(node.id, "Task execution failed");
          }
        }).catch(e => {
          graph.updateNodeStatus(node.id, "failed");
          this.events.emitTaskFailed(node.id, e.message);
        });

        runningTasks.add(taskPromise);
        taskPromise.finally(() => runningTasks.delete(taskPromise));
      }

      if (runningTasks.size > 0) {
        // Wait for at least one task to finish before checking again
        await Promise.race(runningTasks);
      }
    }

    return !graph.hasFailedNodes() && graph.isComplete();
  }
}
