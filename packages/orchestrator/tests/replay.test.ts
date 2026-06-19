import { describe, it, expect } from "bun:test";
import { AgentReplay } from "../src/AgentReplay";

describe("AgentReplay", () => {
  it("should replay workflow state exactly", async () => {
    const events = [
      { type: "agent.workflow.started", timestamp: "1", payload: {} },
      { type: "agent.started", timestamp: "2", payload: { role: "ARCHITECT" } },
      { type: "agent.critique.created", timestamp: "3", payload: { sourceAgent: "coder", targetAgent: "arch", issue: "too complex" } },
      { type: "agent.consensus.completed", timestamp: "4", payload: { approved: true } },
      { type: "agent.workflow.completed", timestamp: "5", payload: {} }
    ];

    const store = { query: async () => events };
    const replay = new AgentReplay(store);
    const state = await replay.replayWorkflow("w-1");

    expect(state.status).toBe("COMPLETED");
    expect(state.agentsRan).toContain("ARCHITECT");
    expect(state.critiques.length).toBe(1);
    expect(state.consensusApproved).toBe(true);
  });
});
