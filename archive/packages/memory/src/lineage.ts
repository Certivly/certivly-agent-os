import { MemoryStore } from './store';

export interface LineageGraph {
  memoryId?: string;
  contextId?: string;
  eventId?: string;
  sourceContextIds: string[];
  sourceEventIds: string[];
  sourceRequestIds: string[];
  sourceSessionIds: string[];
}

export class LineageService {
  constructor(private memoryStore: MemoryStore) {}

  public getMemoryLineage(memoryId: string): LineageGraph {
    const memory = this.memoryStore.getMemory(memoryId);
    if (!memory) {
      throw new Error(`Memory ${memoryId} not found`);
    }

    return {
      memoryId,
      sourceContextIds: memory.sourceContextIds,
      sourceEventIds: memory.sourceEventIds,
      sourceRequestIds: memory.sourceRequestIds,
      sourceSessionIds: memory.sourceSessionIds,
    };
  }

  // To get context lineage, we need context persistence.
  // Assuming in Phase 2.1 we return the linkage if known, 
  // but if Context entries are ephemeral, we rely on the memory graph.
}
