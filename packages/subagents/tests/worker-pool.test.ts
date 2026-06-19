import { expect, test, describe } from "bun:test";
import { WorkerPool } from "../src/runtime/WorkerPool";
import { SubAgent } from "../src/agents/SubAgent";

class MockAgent implements SubAgent {
  id = "mock";
  name = "Mock";
  async execute(task: any, context: any) {
    await new Promise(r => setTimeout(r, 10));
    return { taskId: task.id, agentId: this.id, status: "success" as const, data: null, durationMs: 10 };
  }
}

describe("Worker Pool", () => {
  test("limits parallel execution gracefully", async () => {
    const pool = new WorkerPool(2);
    const agent = new MockAgent();
    
    const start = performance.now();
    
    // Fire 6 tasks at a 2-worker pool
    // Expected time ~3 batches of 10ms = ~30ms
    const promises = [];
    for (let i = 0; i < 6; i++) {
      promises.push(pool.execute(agent, { id: `${i}`, type: "mock", payload: {} }, {} as any));
    }
    
    await Promise.all(promises);
    const duration = performance.now() - start;
    
    expect(duration).toBeGreaterThanOrEqual(30);
  });
});
