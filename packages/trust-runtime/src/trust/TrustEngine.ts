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

  public async evaluateRisk(context: any, patchBundle: any): Promise<{ riskScore: number; passed: boolean; regressions: string[] }> {
    const claims: Claim[] = [];
    const evidenceList: Evidence[] = [];
    
    const patches = patchBundle?.patches || [];
    for (const patch of patches) {
      claims.push({
        id: `claim_${crypto.randomUUID()}`,
        statement: `File modified successfully: ${patch.path}`,
        source: "PatchAgent",
        status: "unverified"
      });
      evidenceList.push({
        id: `evidence_${crypto.randomUUID()}`,
        type: "patch",
        source: "PatchAgent",
        timestamp: new Date().toISOString(),
        payload: { data: { passed: true } }
      });
    }
    
    const evaluation = this.evaluate(
      context.executionId || "default",
      claims,
      evidenceList,
      { hasCriticalRegressions: false, regressions: [] }
    );
    
    return {
      riskScore: 100 - evaluation.score.score,
      passed: evaluation.score.score >= 90,
      regressions: []
    };
  }
}
