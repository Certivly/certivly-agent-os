import { Claim } from "./ClaimModels";

export class ClaimRegistry {
  private claims: Map<string, Claim> = new Map();

  public register(claim: Claim): void {
    this.claims.set(claim.id, claim);
  }

  public get(id: string): Claim | undefined {
    return this.claims.get(id);
  }

  public updateStatus(id: string, status: Claim["status"]): void {
    const claim = this.claims.get(id);
    if (claim) {
      claim.status = status;
    }
  }

  public getAll(): Claim[] {
    return Array.from(this.claims.values());
  }
}
