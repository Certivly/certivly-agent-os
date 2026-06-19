import { Evidence } from "../evidence/EvidenceTypes";
import { Claim } from "../claims/ClaimModels";

export class TestVerifier {
  public verify(claim: Claim, evidence: Evidence[]): boolean {
    const testEvidence = evidence.find(e => e.type === "test");
    if (!testEvidence) return false;

    const testsPassed = testEvidence.payload?.data?.failed === 0;
    if (claim.statement === "Tests passing" && testsPassed) return true;
    if (claim.statement === "Failed tests exist" && !testsPassed) return true;

    return false;
  }
}
