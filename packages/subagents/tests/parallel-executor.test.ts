import { expect, test, describe } from "bun:test";
import { ParallelExecutor } from "../src/orchestration/ParallelExecutor";
import { TaskGraph } from "../src/coordinator/TaskGraph";
import { WorkerPool } from "../src/runtime/WorkerPool";
import { FailureHandler, FailurePolicy } from "../src/orchestration/FailureHandler";
import { SubAgent } from "../src/agents/SubAgent";

class FastAgent implements SubAgent {
  id = "fast";
  name = "Fast";
  async execute(task: any, context: any) {
    return { taskId: task.id, agentId: this.id, status: "success" as const, data: null, durationMs: 1 };
  }
}

describe("Parallel Executor", () => {
  test("executes independent tasks concurrently and handles dependencies", async () => {
    const pool = new WorkerPool(4);
    const handler = new FailureHandler(FailurePolicy.FAIL_FAST);
    const agents = new Map<string, SubAgent>([["fast", new FastAgent()]]);
    const executor = new ParallelExecutor(pool, handler, agents);

    const graph = new TaskGraph();
    graph.addNode({ id: "A", agent: "fast", dependencies: [], status: "pending", task: { id: "A", type: "T", payload: {} } });
    graph.addNode({ id: "B", agent: "fast", dependencies: [], status: "pending", task: { id: "B", type: "T", payload: {} } });
    graph.addNode({ id: "C", agent: "fast", dependencies: ["A", "B"], status: "pending", task: { id: "C", type: "T", payload: {} } });
    
    graph.addEdge("A", "C");
    graph.addEdge("B", "C");

    await executor.executeGraph(graph, {} as any);

    expect(graph.isComplete()).toBe(true);
    expect(graph.nodes.get("C")?.status).toBe("completed");
  });
});
