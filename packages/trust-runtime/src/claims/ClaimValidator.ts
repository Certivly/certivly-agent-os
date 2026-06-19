import { Claim } from "./ClaimModels";

export class ClaimValidator {
  public validateFormat(claim: Claim): boolean {
    return !!(claim.id && claim.statement && claim.source && claim.status);
  }
}
