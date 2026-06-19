import { PatternQueryEngine } from "../queries/PatternQueryEngine";
import { AgentContext, AgentResult, AgentRole } from "@agent-os/orchestrator"; // Use interfaces from orchestrator package

export class PatternAgent {
  public id = "pattern-01";
  public name = "PatternAgent";
  public role = "PATTERN" as any; // Using dynamic cast if PATTERN isn't in orchestrator's AgentRole enum yet
  public version = "1.0.0";

  constructor(private queryEngine: PatternQueryEngine) {}

  public async execute(context: AgentContext): Promise<AgentResult> {
    const strongestPatterns = this.queryEngine.getStrongestPatterns();
    
    const findings = strongestPatterns.map(p => `Detected Pattern [${p.type}]: ${p.title} (Confidence: ${p.confidence * 100}%)`);
    const recommendations = ["Follow detected patterns to avoid architectural drift."];
    
    return {
      agentId: this.id,
      role: this.role,
      summary: `Analyzed repository and detected ${strongestPatterns.length} strong patterns.`,
      findings,
      recommendations,
      confidence: 0.95,
      graphRefs: [],
      knowledgeRefs: [],
      eventRefs: []
    };
  }
}
