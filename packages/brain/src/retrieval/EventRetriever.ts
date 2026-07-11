import { BrainQuery, KnowledgeItem } from '../models';
import { KnowledgeRetriever } from '../KnowledgeRetriever';

export interface EventStoreAdapter {
  loadEvents?(sessionId: string): any[];
  getAll?(): any[];
}

export class EventRetriever implements KnowledgeRetriever {
  public readonly type = 'event';

  constructor(private eventStore?: EventStoreAdapter) {}

  public async retrieve(query: BrainQuery): Promise<KnowledgeItem[]> {
    if (!this.eventStore) return [];

    let events: any[] = [];
    const lower = query.query.toLowerCase();
    const words = lower.split(/\s+/).filter(w => w.length > 3);

    // EventStore has loadEvents(sessionId) — we use a broad session wildcard
    // by loading recent events across sessions via getAll() if available,
    // otherwise best-effort with loadEvents('system')
    try {
      if (typeof this.eventStore.getAll === 'function') {
        events = this.eventStore.getAll();
      } else if (typeof this.eventStore.loadEvents === 'function') {
        // loadEvents needs a sessionId — try 'system' as a fallback
        const envelopes = this.eventStore.loadEvents('system');
        events = envelopes.map((e: any) => e.event || e);
      }
    } catch {
      return [];
    }

    // Keyword filter on eventType + payload
    const filtered = events.filter((ev: any) => {
      const text = [
        ev.eventType || ev.type || '',
        JSON.stringify(ev.payload || {})
      ].join(' ').toLowerCase();
      return words.length === 0 || words.some(w => text.includes(w));
    }).slice(0, query.limit ?? 10);

    return filtered.map((ev: any) => ({
      id: ev.id || String(Math.random()),
      type: this.type as any,
      content: ev,
      confidence: { score: 1.0, sources: [ev.id || 'event'], traceable: true }
    }));
  }
}
