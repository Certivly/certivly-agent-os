import { describe, it, expect } from "bun:test";
import { AgentConsensus } from "../src/AgentConsensus";
import { AgentResult, AgentRole } from "../src/models";

describe("AgentConsensus", () => {
  it("should evaluate positive results securely", () => {
    const consensus = new AgentConsensus();
    const results: AgentResult[] = [
      { agentId: "arch-1", role: AgentRole.ARCHITECT, summary: "OK", findings: ["Looks good"], recommendations: ["Do A"], confidence: 0.9, graphRefs: [], knowledgeRefs: [], eventRefs: [] },
      { agentId: "coder-1", role: AgentRole.CODER, summary: "OK", findings: ["Code is fine"], recommendations: ["Merge"], confidence: 0.9, graphRefs: [], knowledgeRefs: [], eventRefs: [] }
    ];

    const decision = consensus.evaluate(results);
    expect(decision.approved).toBe(true);
    expect(decision.confidence).toBe(0.9);
    expect(decision.concerns.length).toBe(2);
    expect(decision.recommendations).toContain("Do A");
  });

  it("should block consensus if Security finds unsafe issues", () => {
    const consensus = new AgentConsensus();
    const results: AgentResult[] = [
      { agentId: "coder-1", role: AgentRole.CODER, summary: "OK", findings: ["Fast code"], recommendations: [], confidence: 0.9, graphRefs: [], knowledgeRefs: [], eventRefs: [] },
      { agentId: "sec-1", role: AgentRole.SECURITY, summary: "Warn", findings: ["This is unsafe handling"], recommendations: ["Fix it"], confidence: 0.99, graphRefs: [], knowledgeRefs: [], eventRefs: [] }
    ];

    const decision = consensus.evaluate(results);
    expect(decision.approved).toBe(false); // Security overrides Coder
    expect(decision.concerns[0]).toContain("SECURITY");
    expect(decision.concerns[0]).toContain("unsafe handling");
  });

  it("should block consensus if Reviewer finds risky issues", () => {
    const consensus = new AgentConsensus();
    const results: AgentResult[] = [
      { agentId: "coder-1", role: AgentRole.CODER, summary: "OK", findings: ["Fast code"], recommendations: [], confidence: 0.9, graphRefs: [], knowledgeRefs: [], eventRefs: [] },
      { agentId: "rev-1", role: AgentRole.REVIEWER, summary: "Warn", findings: ["This poses a memory leak risk"], recommendations: ["Fix it"], confidence: 0.95, graphRefs: [], knowledgeRefs: [], eventRefs: [] }
    ];

    const decision = consensus.evaluate(results);
    expect(decision.approved).toBe(false); // Reviewer overrides
  });
});
