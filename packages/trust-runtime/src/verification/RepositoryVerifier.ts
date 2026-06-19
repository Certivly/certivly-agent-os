import { Evidence } from "../evidence/EvidenceTypes";
import { Claim } from "../claims/ClaimModels";

export class RepositoryVerifier {
  public verify(claim: Claim, evidence: Evidence[]): boolean {
    // Read-only repository graph consistency check mock
    const repoEvidence = evidence.find(e => e.type === "repository");
    return repoEvidence?.payload?.data?.consistent !== false; // defaults to true
  }
}
