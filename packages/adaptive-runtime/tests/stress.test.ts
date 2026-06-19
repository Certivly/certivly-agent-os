import { expect, test, describe } from "bun:test";
import { ExecutionSupervisor } from "../src/supervisor/ExecutionSupervisor";
import { ExecutionLoop } from "../src/supervisor/ExecutionLoop";
import { ObservationEngine } from "../src/observation/ObservationEngine";
import { FailureAnalyzer } from "../src/observation/FailureAnalyzer";
import { PlanRevisionEngine } from "../src/replanning/PlanRevisionEngine";
import { VerificationEngine } from "../src/verification/VerificationEngine";
import { CompletionChecker } from "../src/verification/CompletionChecker";
import { AdaptivePlanner } from "../src/replanning/AdaptivePlanner";
import { DAGMutator } from "../src/replanning/DAGMutator";
import { ParallelExecutor } from "../../subagents/src/orchestration/ParallelExecutor";
import { WorkerPool } from "../../subagents/src/runtime/WorkerPool";
import { FailureHandler } from "../../subagents/src/orchestration/FailureHandler";
import { SubAgent } from "../../subagents/src/agents/SubAgent";
import { AgentMessageBus } from "../src/messaging/AgentMessageBus";
import { Goal } from "../src/models/Goal";

class MockAdaptiveAgent implements SubAgent {
  constructor(public id: string, public name: string, private bus: AgentMessageBus) {}
  async execute(task: any, context: any) {
    // Send 50 messages per execution to hit 50,000 messages total across 1000 goals
    for (let i = 0; i < 50; i++) {
      this.bus.publish({ id: `${task.id}-msg-${i}`, from: this.id, to: "all", type: "ping", payload: {} });
    }
    
    // Simulate test failure ONLY on the first attempt (no retry in task payload yet)
    if (this.id === 'test-agent' && !task.id.includes('retry')) {
      return { taskId: task.id, agentId: this.id, status: "success" as const, data: { failed: 1 }, durationMs: 1 };
    }
    return { taskId: task.id, agentId: this.id, status: "success" as const, data: { failed: 0, isValid: true }, durationMs: 1 };
  }
}

describe("Adaptive Stress Test", () => {
  test("executes 1000 goals causing 1000 replans natively", async () => {
    const bus = new AgentMessageBus();
    let messageCount = 0;
    bus.subscribe("ping", () => { messageCount++; });

    const planner = new AdaptivePlanner();
    const mutator = new DAGMutator();
    const revisionEngine = new PlanRevisionEngine(mutator);
    const observer = new ObservationEngine();
    const analyzer = new FailureAnalyzer();
    const verifier = new VerificationEngine();
    const checker = new CompletionChecker();
    
    const pool = new WorkerPool(50);
    const handler = new FailureHandler();
    
    const agents = new Map<string, SubAgent>();
    for (const id of ["search-agent", "patch-agent", "validation-agent", "test-agent"]) {
      agents.set(id, new MockAdaptiveAgent(id, id, bus));
    }

    const executor = new ParallelExecutor(pool, handler, agents);
    const loop = new ExecutionLoop(planner, executor, observer, analyzer, revisionEngine, verifier, checker);
    const supervisor = new ExecutionSupervisor(loop);

    const start = performance.now();
    const promises = [];
    
    for (let i = 0; i < 1000; i++) {
      const goal: Goal = {
        id: `goal-${i}`,
        description: `Fix bug ${i}`,
        successCriteria: [{ id: `c-${i}`, description: "Tests pass", type: "test", satisfied: false }],
        status: "pending"
      };
      promises.push(supervisor.submitGoal(goal, {} as any));
    }

    const goals = await Promise.all(promises);
    const duration = performance.now() - start;

    expect(goals.length).toBe(1000);
    expect(goals[0].status).toBe("completed");
    
    // 1000 goals * 5 agents executed (4 original + 1 retry) * 50 messages = 250,000 messages (exceeds 50k goal)
    expect(messageCount).toBeGreaterThanOrEqual(50000);
  }, 10000); // 10s timeout
});
