import { TrustScoreCalculator } from "./TrustScoreCalculator";
import { TrustEvaluation } from "./TrustModels";
import { Claim } from "../claims/ClaimModels";
import { Contradiction } from "../contradictions/ContradictionModels";
import { RegressionReport } from "../regression/RegressionReport";
import { Evidence } from "../evidence/EvidenceTypes";
import { VerificationEngine } from "../verification/VerificationEngine";
import { ContradictionDetector } from "../contradictions/ContradictionDetector";

export class TrustEngine {
  constructor(
    private calculator: TrustScoreCalculator,
    private verificationEngine: VerificationEngine,
    private contradictionDetector: ContradictionDetector
  ) {}

  public evaluate(
    goalId: string,
    claims: Claim[],
    evidenceList: Evidence[],
    regressionReport: RegressionReport
  ): TrustEvaluation {
    
    // Verify all claims
    for (const claim of claims) {
      if (claim.status === "unverified") {
        claim.status = this.verificationEngine.verify(claim, evidenceList);
      }
    }

    // Detect contradictions across all claims
    const contradictions: Contradiction[] = [];
    for (const claim of claims) {
      const contras = this.contradictionDetector.detect(claim, evidenceList);
      contradictions.push(...contras);
    }

    // Calculate score
    const score = this.calculator.calculate(claims, contradictions, regressionReport);

    return {
      id: `eval_${Date.now()}`,
      score,
      goalId,
      verifiedClaims: claims.filter(c => c.status === "verified").map(c => c.id),
      rejectedClaims: claims.filter(c => c.status === "rejected").map(c => c.id),
      criticalContradictions: contradictions.filter(c => c.severity === "critical").length,
      criticalRegressions: regressionReport.hasCriticalRegressions ? 1 : 0
    };
  }
}
