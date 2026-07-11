import { BrainQuery, KnowledgeItem } from '../models';
import { KnowledgeRetriever } from '../KnowledgeRetriever';

export interface WiCERStore {
  query?(type: string): any[];
  searchKnowledgeUnits?(query: string): Promise<any[]>;
}

export class WikiRetriever implements KnowledgeRetriever {
  public readonly type = 'wicer';

  constructor(private wicerStore?: WiCERStore) {}

  public async retrieve(query: BrainQuery): Promise<KnowledgeItem[]> {
    if (!this.wicerStore) return [];

    let units: any[] = [];
    if (typeof this.wicerStore.searchKnowledgeUnits === 'function') {
      units = await this.wicerStore.searchKnowledgeUnits(query.query);
    } else if (typeof this.wicerStore.query === 'function') {
      // WicerAPI.query() returns all units of a type — filter by keyword
      const all = this.wicerStore.query('file');
      const lower = query.query.toLowerCase();
      units = all.filter((u: any) =>
        (u.name || u.id || '').toLowerCase().includes(lower) ||
        (u.description || u.content || '').toLowerCase().includes(lower)
      ).slice(0, 15);
    }

    return units.map((unit: any) => ({
      id: unit.id || unit.name || String(Math.random()),
      type: this.type as any,
      content: unit,
      confidence: { score: 0.85, sources: [unit.id || unit.name], traceable: true }
    }));
  }
}
