export interface Contradiction {
  id: string;
  claimId: string;
  evidenceId: string;
  severity: "critical" | "warning";
  description: string;
}

export interface ConflictReport {
  id: string;
  conflictingClaims: string[];
  supportingEvidence: string[];
  resolution: string;
  hasCriticalContradictions: boolean;
}
