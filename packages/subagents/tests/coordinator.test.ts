import { expect, test, describe } from "bun:test";
import { CoordinatorAgent } from "../src/coordinator/CoordinatorAgent";
import { TaskPlanner } from "../src/coordinator/TaskPlanner";
import { DependencyResolver } from "../src/coordinator/DependencyResolver";
import { ParallelExecutor } from "../src/orchestration/ParallelExecutor";
import { WorkerPool } from "../src/runtime/WorkerPool";
import { FailureHandler } from "../src/orchestration/FailureHandler";
import { ResultSynthesizer } from "../src/coordinator/ResultSynthesizer";
import { SearchAgent } from "../src/agents/SearchAgent";
import { RepositoryAgent } from "../src/agents/RepositoryAgent";
import { MemoryAgent } from "../src/agents/MemoryAgent";
import { PatchAgent } from "../src/agents/PatchAgent";
import { ValidationAgent } from "../src/agents/ValidationAgent";
import { TestAgent } from "../src/agents/TestAgent";

describe("Coordinator", () => {
  test("orchestrates end-to-end plan execution", async () => {
    const resolver = new DependencyResolver();
    const planner = new TaskPlanner(resolver);
    const pool = new WorkerPool(8);
    const handler = new FailureHandler();
    
    const agents = new Map<string, any>();
    const agentList = [new SearchAgent(), new RepositoryAgent(), new MemoryAgent(), new PatchAgent(), new ValidationAgent(), new TestAgent()];
    for (const a of agentList) agents.set(a.id, a);

    const executor = new ParallelExecutor(pool, handler, agents);
    const synthesizer = new ResultSynthesizer();
    const coordinator = new CoordinatorAgent(planner, executor, synthesizer);

    const result = await coordinator.orchestrate("Fix login bug", {} as any);

    expect(result.summary).toContain("Synthesized 6 subagent outputs");
    expect(result.references).toContain("auth/login.ts");
    expect(result.findings).toContain("Update auth/login.ts token handling");
  });
});
