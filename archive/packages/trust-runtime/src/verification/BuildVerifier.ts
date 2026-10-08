import { Evidence } from "../evidence/EvidenceTypes";
import { Claim } from "../claims/ClaimModels";

export class BuildVerifier {
  public verify(claim: Claim, evidence: Evidence[]): boolean {
    const buildEvidence = evidence.find(e => e.type === "build");
    if (!buildEvidence) return false;
    
    const buildPassed = buildEvidence.payload?.data?.passed === true;
    if (claim.statement === "Build successful" && buildPassed) return true;
    if (claim.statement === "Build failed" && !buildPassed) return true;
    
    return false;
  }
}
