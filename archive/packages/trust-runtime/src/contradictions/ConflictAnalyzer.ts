import { Contradiction, ConflictReport } from "./ContradictionModels";

export class ConflictAnalyzer {
  public analyze(contradictions: Contradiction[]): ConflictReport {
    return {
      id: `conflict_${Date.now()}`,
      conflictingClaims: contradictions.map(c => c.claimId),
      supportingEvidence: contradictions.map(c => c.evidenceId),
      resolution: contradictions.length > 0 ? "reject" : "accept",
      hasCriticalContradictions: contradictions.some(c => c.severity === "critical")
    };
  }
}
