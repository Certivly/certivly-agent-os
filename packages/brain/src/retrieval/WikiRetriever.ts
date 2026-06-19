import { BrainQuery, KnowledgeItem } from '../models';
import { KnowledgeRetriever } from '../KnowledgeRetriever';

export interface WiCERStore {
  searchKnowledgeUnits(query: string): Promise<any[]>;
}

export class WikiRetriever implements KnowledgeRetriever {
  public readonly type = 'wicer';

  constructor(private wicerStore?: WiCERStore) {}

  public async retrieve(query: BrainQuery): Promise<KnowledgeItem[]> {
    if (!this.wicerStore) return [];

    const units = await this.wicerStore.searchKnowledgeUnits(query.query);
    
    return units.map(unit => ({
      id: unit.id,
      type: this.type,
      content: unit,
      confidence: {
        score: 0.85,
        sources: [unit.id],
        traceable: true
      }
    }));
  }
}
