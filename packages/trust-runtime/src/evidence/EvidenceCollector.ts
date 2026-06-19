import { Evidence } from "./EvidenceTypes";

export class EvidenceCollector {
  private evidence: Evidence[] = [];

  public collect(
    type: Evidence["type"],
    sourceAgent: string,
    payload: any,
    eventIds: string[] = [],
    graphRefs: string[] = []
  ): Evidence {
    const item: Evidence = {
      id: `ev_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      type,
      sourceAgent,
      timestamp: Date.now(),
      sourceEventIds: eventIds,
      sourceGraphRefs: graphRefs,
      payload
    };
    this.evidence.push(item);
    return item;
  }

  public getAll(): Evidence[] {
    return [...this.evidence];
  }

  public getByType(type: Evidence["type"]): Evidence[] {
    return this.evidence.filter(e => e.type === type);
  }
}
