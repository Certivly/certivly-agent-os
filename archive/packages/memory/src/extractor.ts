import { ContextEntry, MemoryExtractor as IMemoryExtractor } from '@agent-os/brain';
import { MemoryStore } from './store';
import { Memory, MemoryType } from './models';
import { metrics } from '@agent-os/metrics';

export class MemoryExtractor implements IMemoryExtractor {
  constructor(private store: MemoryStore) {}

  public async extractAndStore(entry: ContextEntry): Promise<void> {
    // Phase 2 Extraction Logic:
    // In future phases, this would use an LLM or NLP to distill facts.
    // For now, we perform a naive deterministic extraction based on metadata or fallback to generic types.
    
    // Validation: prevent empty
    if (!entry.content || entry.content.trim() === '') {
      return;
    }

    const memoryId = crypto.randomUUID();
    let type: MemoryType = 'ObservationMemory';
    let topic = 'general';
    let confidence = 0.5;
    
    // Naive rule-based parsing to fulfill Phase 2 requirements without LLM
    if (entry.metadata?.topic) {
      topic = entry.metadata.topic;
    } else if (entry.content.toLowerCase().includes('decision')) {
      type = 'DecisionMemory';
      topic = 'architecture';
      confidence = 0.8;
    } else if (entry.type === 'ToolContext') {
      type = 'FactMemory';
      topic = 'tool-execution';
      confidence = 0.9;
    }

    // Duplicate check using naive topic-based exact string matching
    const existingMemories = this.store.getMemoriesByTopic(topic);
    for (const em of existingMemories) {
      if (em.content === entry.content) {
        // Validation: prevent duplicates
        return; 
      }
    }

    const memory: Memory = {
      id: memoryId,
      type,
      topic,
      content: entry.content,
      confidence,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sourceEventIds: entry.sourceEventIds,
      sourceSessionIds: entry.sourceSessionIds || [],
      sourceRequestIds: entry.sourceRequestIds || [],
      sourceContextIds: [entry.id],
      tags: [type.toLowerCase()],
      version: 1
    };

    this.store.save(memory);
    
    // Observability Metric
    metrics.counter('memories_created').inc();
  }
}
