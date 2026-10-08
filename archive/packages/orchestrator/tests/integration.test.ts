import { describe, it, expect, mock } from "bun:test";
import { AgentCoordinator } from "../src/AgentCoordinator";
import { AgentRegistry } from "../src/AgentRegistry";
import { AgentRouter } from "../src/AgentRouter";
import { AgentConsensus } from "../src/AgentConsensus";

import { ArchitectAgent } from "../agents/ArchitectAgent";
import { CoderAgent } from "../agents/CoderAgent";
import { TesterAgent } from "../agents/TesterAgent";
import { ReviewerAgent } from "../agents/ReviewerAgent";
import { SecurityAgent } from "../agents/SecurityAgent";
import { DocsAgent } from "../agents/DocsAgent";

describe("Integration: Orchestrator to Plan", () => {
  it("should accept goal, route agents, reach consensus, and generate execution plan", async () => {
    const registry = new AgentRegistry();
    registry.register(new ArchitectAgent());
    registry.register(new CoderAgent());
    registry.register(new TesterAgent());
    registry.register(new ReviewerAgent());
    registry.register(new SecurityAgent());
    registry.register(new DocsAgent());

    const router = new AgentRouter();
    const consensus = new AgentConsensus();
    
    // We mock events/metrics since we don't have the real bus in this isolation test
    const events = {
      emitWorkflowStarted: mock(),
      emitWorkflowCompleted: mock(),
      emitAgentStarted: mock(),
      emitAgentCompleted: mock(),
      emitAgentFailed: mock(),
      emitConsensusStarted: mock(),
      emitConsensusCompleted: mock()
    };
    
    const metrics = {
      recordAgentExecution: mock(),
      recordAgentFailure: mock(),
      recordConsensusConfidence: mock()
    };

    const coordinator = new AgentCoordinator(registry, router, consensus, events, metrics);

    // Provide a goal that triggers the full sequence but bypasses the "unsafe" mock logic
    // Wait, the dummy agents currently don't throw "unsafe" except for SecurityAgent's dummy.
    // Let's mock the SecurityAgent to return a passing result to avoid consensus failure.
    const secAgent = registry.getAgent("SECURITY" as any);
    secAgent.execute = async () => ({
      agentId: "sec", role: "SECURITY" as any, summary: "OK", findings: ["No issues"], recommendations: [], confidence: 1, graphRefs: [], knowledgeRefs: [], eventRefs: []
    });

    const context = {
      goal: "Implement full feature",
      repositorySnapshot: {},
      memory: [],
      knowledge: [],
      previousResults: []
    };

    const executionPlan = await coordinator.orchestrate(context);
    
    expect(executionPlan.plan).toBeDefined();
    expect(executionPlan.agentResults.length).toBe(6);
    expect(executionPlan.consensusSummary).toContain("approved");
    expect(events.emitWorkflowCompleted).toHaveBeenCalled();
  });
});
