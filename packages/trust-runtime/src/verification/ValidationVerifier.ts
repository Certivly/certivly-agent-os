import { Evidence } from "../evidence/EvidenceTypes";
import { Claim } from "../claims/ClaimModels";

export class ValidationVerifier {
  public verify(claim: Claim, evidence: Evidence[]): boolean {
    const validationEvidence = evidence.find(e => e.type === "validation");
    if (!validationEvidence) return false;

    const isValid = validationEvidence.payload?.data?.isValid === true;
    if (claim.statement === "Validation succeeded" && isValid) return true;
    if (claim.statement === "Validation failed" && !isValid) return true;

    return false;
  }
}
