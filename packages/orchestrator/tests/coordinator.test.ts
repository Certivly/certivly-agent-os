import { describe, it, expect, mock } from "bun:test";
import { AgentCoordinator } from "../src/AgentCoordinator";
import { AgentRegistry } from "../src/AgentRegistry";
import { AgentRouter } from "../src/AgentRouter";
import { AgentConsensus } from "../src/AgentConsensus";
import { CoderAgent } from "../agents/CoderAgent";
import { TesterAgent } from "../agents/TesterAgent";

describe("AgentCoordinator", () => {
  it("should orchestrate multiple agents and reach consensus", async () => {
    const registry = new AgentRegistry();
    registry.register(new CoderAgent());
    registry.register(new TesterAgent());

    const router = new AgentRouter();
    // Force specific route for test
    router.route = mock(() => [registry.getAgent("CODER" as any).role, registry.getAgent("TESTER" as any).role]);

    const consensus = new AgentConsensus();

    const mockEvents = {
      emitWorkflowStarted: mock(),
      emitWorkflowCompleted: mock(),
      emitAgentStarted: mock(),
      emitAgentCompleted: mock(),
      emitAgentFailed: mock(),
      emitConsensusStarted: mock(),
      emitConsensusCompleted: mock()
    };

    const mockMetrics = {
      recordAgentExecution: mock(),
      recordAgentFailure: mock(),
      recordConsensusConfidence: mock()
    };

    const coordinator = new AgentCoordinator(registry, router, consensus, mockEvents, mockMetrics);

    const context = {
      goal: "Implement feature",
      repositorySnapshot: {},
      memory: [],
      knowledge: [],
      previousResults: []
    };

    const result = await coordinator.orchestrate(context);
    
    expect(result.agentResults.length).toBe(2);
    expect(result.plan).toBeDefined();
    expect(mockEvents.emitWorkflowCompleted).toHaveBeenCalled();
    expect(mockMetrics.recordConsensusConfidence).toHaveBeenCalled();
  });
});
