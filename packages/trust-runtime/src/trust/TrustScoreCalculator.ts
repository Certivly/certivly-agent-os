import { TrustScore } from "./TrustModels";
import { Claim } from "../claims/ClaimModels";
import { Contradiction } from "../contradictions/ContradictionModels";
import { RegressionReport } from "../regression/RegressionReport";

export class TrustScoreCalculator {
  public calculate(
    claims: Claim[],
    contradictions: Contradiction[],
    regressionReport: RegressionReport
  ): TrustScore {
    let score = 100;
    const reasons: string[] = [];

    // -10 failed verifier
    const rejectedClaims = claims.filter(c => c.status === "rejected");
    if (rejectedClaims.length > 0) {
      score -= rejectedClaims.length * 10;
      reasons.push(`Deducted ${rejectedClaims.length * 10} for ${rejectedClaims.length} rejected claims`);
    }

    // -20 contradiction
    if (contradictions.length > 0) {
      score -= contradictions.length * 20;
      reasons.push(`Deducted ${contradictions.length * 20} for ${contradictions.length} contradictions`);
    }

    // -15 regression
    if (regressionReport.regressions.length > 0) {
      score -= regressionReport.regressions.length * 15;
      reasons.push(`Deducted ${regressionReport.regressions.length * 15} for ${regressionReport.regressions.length} regressions`);
    }

    // -5 unverifiable claim
    const unverifiableClaims = claims.filter(c => c.status === "unverified");
    if (unverifiableClaims.length > 0) {
      score -= unverifiableClaims.length * 5;
      reasons.push(`Deducted ${unverifiableClaims.length * 5} for ${unverifiableClaims.length} unverifiable claims`);
    }

    if (score < 0) score = 0;

    return { score, reasons };
  }
}
