export interface SubagentOpinion {
  agentName: string;
  role: 'security' | 'reviewer' | 'verifier' | 'architect' | 'coder' | 'librarian' | 'explorer' | 'custom';
  approved: boolean;
  findings: string[];
  recommendations?: string[];
  confidence?: number;
}

export interface ConsensusEvaluation {
  approved: boolean;
  vetoAgent?: string;
  vetoReason?: string;
  concerns: string[];
  recommendations: string[];
  averageConfidence: number;
}

export class AgentConsensusEvaluator {
  // Precedence order: lower index = higher priority in vetoes
  private static readonly PRECEDENCE_ORDER: Record<string, number> = {
    security: 1,
    reviewer: 2,
    verifier: 3,
    architect: 4,
    coder: 5,
    librarian: 6,
    explorer: 7,
    custom: 8,
  };

  /**
   * Evaluates collective subagent opinions and enforces safety/quality vetoes
   * learned from archive orchestrator and Freebuff reviewer architecture.
   */
  public evaluate(opinions: SubagentOpinion[]): ConsensusEvaluation {
    if (opinions.length === 0) {
      return {
        approved: true,
        concerns: [],
        recommendations: [],
        averageConfidence: 1.0,
      };
    }

    // Sort opinions by role precedence
    const sorted = [...opinions].sort((a, b) => {
      const pA = AgentConsensusEvaluator.PRECEDENCE_ORDER[a.role] ?? 99;
      const pB = AgentConsensusEvaluator.PRECEDENCE_ORDER[b.role] ?? 99;
      return pA - pB;
    });

    let approved = true;
    let vetoAgent: string | undefined;
    let vetoReason: string | undefined;
    const concerns: string[] = [];
    const recommendations: string[] = [];
    let totalConfidence = 0;

    for (const op of sorted) {
      totalConfidence += op.confidence ?? 0.8;
      if (op.recommendations) {
        recommendations.push(...op.recommendations);
      }

      // Check for veto condition:
      // High-priority roles (security, reviewer, verifier) can veto if approved === false
      // or if findings contain critical risk markers
      const isHighPriority = ['security', 'reviewer', 'verifier'].includes(op.role);
      const hasCriticalFinding = op.findings.some(f =>
        /\b(vulnerability|leak|unsafe|malicious|cve|critical failure|test failed)\b/i.test(f)
      );

      if (!op.approved || (isHighPriority && hasCriticalFinding)) {
        if (isHighPriority && approved) {
          approved = false;
          vetoAgent = op.agentName;
          vetoReason = op.findings.find(f => /\b(vulnerability|leak|unsafe|malicious|cve|critical failure|test failed)\b/i.test(f))
            || op.findings[0]
            || `Vetoed by ${op.role}`;
        }
        concerns.push(`[${op.agentName} (${op.role})]: ${op.findings.join('; ') || 'Disapproved change'}`);
      } else if (op.findings.length > 0) {
        concerns.push(`[${op.agentName} (${op.role})]: ${op.findings.join('; ')}`);
      }
    }

    return {
      approved,
      vetoAgent,
      vetoReason,
      concerns,
      recommendations,
      averageConfidence: totalConfidence / sorted.length,
    };
  }
}
