export interface TrustScore {
  score: number;
  reasons: string[];
}

export interface TrustEvaluation {
  id: string;
  score: TrustScore;
  goalId: string;
  verifiedClaims: string[];
  rejectedClaims: string[];
  criticalContradictions: number;
  criticalRegressions: number;
}
