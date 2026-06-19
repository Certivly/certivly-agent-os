import { TaskGraph } from '../coordinator/TaskGraph';
import { WorkerPool } from '../runtime/WorkerPool';
import { AgentContext } from '../runtime/AgentContext';
import { FailureHandler, FailurePolicy } from './FailureHandler';
import { SubAgent } from '../agents/SubAgent';

export class ParallelExecutor {
  constructor(
    private workerPool: WorkerPool,
    private failureHandler: FailureHandler,
    private agents: Map<string, SubAgent>
  ) {}

  public async executeGraph(graph: TaskGraph, context: AgentContext): Promise<void> {
    const runningTasks = new Set<string>();

    while (!graph.isComplete() && !graph.hasFailed()) {
      const readyNodes = graph.getReadyNodes();
      const nodesToStart = readyNodes.filter(n => !runningTasks.has(n.id));

      if (nodesToStart.length === 0 && runningTasks.size === 0) {
        // Deadlock or disconnected graph
        break;
      }

      const promises = nodesToStart.map(async (node) => {
        runningTasks.add(node.id);
        graph.updateNodeStatus(node.id, "running");

        const agent = this.agents.get(node.agent);
        if (!agent) throw new Error(`Agent ${node.agent} not found`);

        let attempt = 0;
        let success = false;
        let result;

        while (!success) {
          attempt++;
          result = await this.workerPool.execute(agent, node.task, context);
          
          if (result.status === "failed") {
            const shouldRetry = await this.failureHandler.handleFailure(node.id, result.error, attempt);
            if (!shouldRetry) {
              if (this.failureHandler.policy === FailurePolicy.FAIL_FAST) {
                graph.updateNodeStatus(node.id, "failed", result);
                return; // Escape immediately
              } else {
                break; // Continue policy bypasses failure
              }
            }
          } else {
            success = true;
          }
        }

        graph.updateNodeStatus(node.id, "completed", result);
        runningTasks.delete(node.id);
      });

      await Promise.all(promises);
      
      // small yield to prevent tight event loop spin
      await new Promise(r => setTimeout(r, 5));
    }
  }
}
