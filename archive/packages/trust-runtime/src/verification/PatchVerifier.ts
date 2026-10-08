import { Evidence } from "../evidence/EvidenceTypes";
import { Claim } from "../claims/ClaimModels";

export class PatchVerifier {
  public verify(claim: Claim, evidence: Evidence[]): boolean {
    const patchEvidence = evidence.find(e => e.type === "patch");
    if (!patchEvidence) return false;

    // For mocking purposes in tests
    return patchEvidence.payload?.data?.patched === true;
  }
}
