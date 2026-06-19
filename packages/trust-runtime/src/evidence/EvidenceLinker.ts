import { Evidence } from "./EvidenceTypes";

export class EvidenceLinker {
  private links: Map<string, string[]> = new Map();

  public link(claimId: string, evidenceId: string): void {
    if (!this.links.has(claimId)) {
      this.links.set(claimId, []);
    }
    this.links.get(claimId)!.push(evidenceId);
  }

  public getEvidenceForClaim(claimId: string): string[] {
    return this.links.get(claimId) || [];
  }
}
