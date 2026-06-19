import { Claim } from "../claims/ClaimModels";
import { Evidence } from "../evidence/EvidenceTypes";
import { BuildVerifier } from "./BuildVerifier";
import { TestVerifier } from "./TestVerifier";
import { PatchVerifier } from "./PatchVerifier";
import { ValidationVerifier } from "./ValidationVerifier";
import { RepositoryVerifier } from "./RepositoryVerifier";

export class VerificationEngine {
  constructor(
    private buildVerifier: BuildVerifier = new BuildVerifier(),
    private testVerifier: TestVerifier = new TestVerifier(),
    private patchVerifier: PatchVerifier = new PatchVerifier(),
    private valVerifier: ValidationVerifier = new ValidationVerifier(),
    private repoVerifier: RepositoryVerifier = new RepositoryVerifier()
  ) {}

  public verify(claim: Claim, evidence: Evidence[]): "verified" | "rejected" {
    let verified = false;

    if (claim.source === "BuildAgent") {
      verified = this.buildVerifier.verify(claim, evidence);
    } else if (claim.source === "TestAgent") {
      verified = this.testVerifier.verify(claim, evidence);
    } else if (claim.source === "PatchAgent") {
      verified = this.patchVerifier.verify(claim, evidence);
    } else if (claim.source === "ValidationAgent") {
      verified = this.valVerifier.verify(claim, evidence);
    } else {
      // Default fallback verifier for untracked agents
      verified = this.repoVerifier.verify(claim, evidence);
    }

    return verified ? "verified" : "rejected";
  }
}
