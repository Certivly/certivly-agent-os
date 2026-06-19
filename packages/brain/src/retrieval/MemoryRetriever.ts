import { BrainQuery, KnowledgeItem } from '../models';
import { KnowledgeRetriever } from '../KnowledgeRetriever';

export interface MemoryStore {
  searchMemories(query: string): Promise<any[]>;
}

export class MemoryRetriever implements KnowledgeRetriever {
  public readonly type = 'memory';

  constructor(private memoryStore?: MemoryStore) {}

  public async retrieve(query: BrainQuery): Promise<KnowledgeItem[]> {
    if (!this.memoryStore) return [];

    const memories = await this.memoryStore.searchMemories(query.query);
    
    return memories.map(memory => ({
      id: memory.id,
      type: this.type,
      content: memory,
      confidence: {
        score: memory.confidence || 0.8,
        sources: [memory.id],
        traceable: true
      }
    }));
  }
}
