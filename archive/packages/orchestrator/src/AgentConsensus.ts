import { AgentResult, AgentRole, ConsensusDecision } from "./models";

export class AgentConsensus {
  // Precedence order: lower index = higher priority in conflicts
  private precedence = [
    AgentRole.SECURITY,
    AgentRole.REVIEWER,
    AgentRole.TESTER,
    AgentRole.ARCHITECT,
    AgentRole.CODER,
    AgentRole.DOCS
  ];

  public evaluate(results: AgentResult[]): ConsensusDecision {
    let approved = true;
    const concerns: string[] = [];
    const recommendations: string[] = [];
    let totalConfidence = 0;

    // Sort results by precedence
    const sortedResults = [...results].sort((a, b) => {
      const idxA = this.precedence.indexOf(a.role);
      const idxB = this.precedence.indexOf(b.role);
      return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
    });

    for (const result of sortedResults) {
      totalConfidence += result.confidence;
      recommendations.push(...result.recommendations);
      
      if (result.findings.some(f => f.toLowerCase().includes("unsafe") || f.toLowerCase().includes("leak") || f.toLowerCase().includes("risk"))) {
        // High priority roles block the consensus if they find unsafe issues
        if (result.role === AgentRole.SECURITY || result.role === AgentRole.REVIEWER) {
          approved = false;
        }
        concerns.push(`[${result.role}]: ${result.findings.find(f => f.toLowerCase().includes("unsafe") || f.toLowerCase().includes("leak") || f.toLowerCase().includes("risk"))}`);
      }
      
      // Just gather other concerns
      const otherFindings = result.findings.filter(f => !f.toLowerCase().includes("unsafe") && !f.toLowerCase().includes("leak") && !f.toLowerCase().includes("risk"));
      for (const finding of otherFindings) {
        concerns.push(`[${result.role}]: ${finding}`);
      }
    }

    const averageConfidence = results.length > 0 ? totalConfidence / results.length : 0;

    return {
      approved,
      concerns,
      recommendations,
      confidence: averageConfidence
    };
  }
}
