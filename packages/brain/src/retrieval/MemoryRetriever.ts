import { BrainQuery, KnowledgeItem } from '../models';
import { KnowledgeRetriever } from '../KnowledgeRetriever';

export interface MemoryStoreAdapter {
  search?(query: string, limit?: number): any[];
  getMemoriesByType?(type: string): any[];
}

export class MemoryRetriever implements KnowledgeRetriever {
  public readonly type = 'memory';

  constructor(private memoryStore?: MemoryStoreAdapter) {}

  public async retrieve(query: BrainQuery): Promise<KnowledgeItem[]> {
    if (!this.memoryStore) return [];

    let memories: any[] = [];

    // Prefer the search() method we added to MemoryStore
    if (typeof this.memoryStore.search === 'function') {
      memories = this.memoryStore.search(query.query, query.limit ?? 10);
    } else if (typeof this.memoryStore.getMemoriesByType === 'function') {
      // Fallback: load all types and keyword filter
      const lower = query.query.toLowerCase();
      const words = lower.split(/\s+/).filter(w => w.length > 3);
      const all = [
        ...this.memoryStore.getMemoriesByType('FactMemory'),
        ...this.memoryStore.getMemoriesByType('DecisionMemory'),
        ...this.memoryStore.getMemoriesByType('PatternMemory'),
        ...this.memoryStore.getMemoriesByType('TaskMemory'),
      ];
      memories = all.filter(m => {
        const text = ((m.topic || '') + ' ' + (m.content || '')).toLowerCase();
        return words.some(w => text.includes(w));
      }).slice(0, query.limit ?? 10);
    }

    return memories.map(m => ({
      id: m.id || String(Math.random()),
      type: this.type as any,
      content: m,
      confidence: {
        score: m.confidence ?? 0.8,
        sources: [m.id || 'memory'],
        traceable: true
      }
    }));
  }
}
