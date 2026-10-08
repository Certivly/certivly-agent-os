import { KnowledgeUnit } from './models';

export class KnowledgeStore {
  private units: Map<string, KnowledgeUnit> = new Map();

  public save(unit: KnowledgeUnit): void {
    const existing = this.units.get(unit.id);
    if (existing) {
      if (existing.content !== unit.content || existing.title !== unit.title) {
        unit.version = existing.version + 1;
        unit.createdAt = existing.createdAt;
      } else {
        unit.version = existing.version;
        unit.createdAt = existing.createdAt;
      }
    } else {
      unit.version = 1;
      unit.createdAt = Date.now();
    }
    this.units.set(unit.id, unit);
  }

  public get(id: string): KnowledgeUnit | undefined {
    return this.units.get(id);
  }

  public query(filter: Partial<KnowledgeUnit>): KnowledgeUnit[] {
    const results: KnowledgeUnit[] = [];
    for (const unit of this.units.values()) {
      let match = true;
      for (const [key, val] of Object.entries(filter)) {
        // @ts-ignore
        if (unit[key] !== val) {
          match = false;
          break;
        }
      }
      if (match) results.push(unit);
    }
    return results;
  }
}
