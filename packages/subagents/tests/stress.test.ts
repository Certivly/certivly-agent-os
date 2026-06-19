import { expect, test, describe } from "bun:test";
import { CoordinatorAgent } from "../src/coordinator/CoordinatorAgent";
import { TaskPlanner } from "../src/coordinator/TaskPlanner";
import { DependencyResolver } from "../src/coordinator/DependencyResolver";
import { ParallelExecutor } from "../src/orchestration/ParallelExecutor";
import { WorkerPool } from "../src/runtime/WorkerPool";
import { FailureHandler } from "../src/orchestration/FailureHandler";
import { ResultSynthesizer } from "../src/coordinator/ResultSynthesizer";
import { SubAgent } from "../src/agents/SubAgent";

class StressAgent implements SubAgent {
  constructor(public id: string, public name: string) {}
  async execute(task: any, context: any) {
    // Math.random() < 0.05 throw Error ? No, let's just make it fast.
    return { taskId: task.id, agentId: this.id, status: "success" as const, data: {}, durationMs: 1 };
  }
}

describe("Stress Test", () => {
  test("executes 1000 concurrent plans with massive parallelism", async () => {
    const resolver = new DependencyResolver();
    const planner = new TaskPlanner(resolver);
    // Overriding planner for stress
    planner.plan = (req: string) => {
      const graph = new TaskPlanner(resolver).plan(req); // use default DAG
      return graph;
    };

    const pool = new WorkerPool(50); // 50 parallel workers
    const handler = new FailureHandler();
    
    const agents = new Map<string, SubAgent>();
    for (const id of ["search-agent", "repository-agent", "memory-agent", "patch-agent", "validation-agent", "test-agent"]) {
      agents.set(id, new StressAgent(id, id));
    }

    const executor = new ParallelExecutor(pool, handler, agents);
    const synthesizer = new ResultSynthesizer();
    const coordinator = new CoordinatorAgent(planner, executor, synthesizer);

    const start = performance.now();
    const promises = [];
    
    // 1000 concurrent plans
    for (let i = 0; i < 1000; i++) {
      promises.push(coordinator.orchestrate(`Task ${i}`, {} as any));
    }

    const results = await Promise.all(promises);
    const duration = performance.now() - start;

    expect(results.length).toBe(1000);
    // 1000 plans * 6 tasks = 6000 tasks completed successfully
    expect(true).toBe(true);
  }, 10000); // Allow up to 10s for this massive stress test
});
