import { BrainQuery, KnowledgeItem } from '../models';
import { KnowledgeRetriever } from '../KnowledgeRetriever';

export interface EventStore {
  queryEvents(query: string): Promise<any[]>;
}

export class EventRetriever implements KnowledgeRetriever {
  public readonly type = 'event';

  constructor(private eventStore?: EventStore) {}

  public async retrieve(query: BrainQuery): Promise<KnowledgeItem[]> {
    if (!this.eventStore) return [];

    const events = await this.eventStore.queryEvents(query.query);
    
    return events.map(event => ({
      id: event.id,
      type: this.type,
      content: event,
      confidence: {
        score: 1.0, // Events are absolute facts of what happened
        sources: [event.id],
        traceable: true
      }
    }));
  }
}
