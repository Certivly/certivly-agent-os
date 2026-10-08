import { Evidence } from "./EvidenceTypes";

export class EvidenceStore {
  private store: Map<string, Evidence> = new Map();

  public save(evidence: Evidence): void {
    this.store.set(evidence.id, evidence);
  }

  public get(id: string): Evidence | undefined {
    return this.store.get(id);
  }

  public getAll(): Evidence[] {
    return Array.from(this.store.values());
  }
}
