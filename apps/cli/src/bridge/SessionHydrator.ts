import { EventStore } from '@agent-os/events';
import { UIEvent } from './EventStreamAdapter';

export class SessionHydrator {
  constructor(private eventStore: EventStore) {}

  public async hydrate(sessionId: string): Promise<UIEvent[]> {
    const envelopes = this.eventStore.loadEvents(sessionId);
    return envelopes.map((envelope: any) => ({
      id: envelope.event.id || Date.now().toString(),
      type: envelope.event.eventType,
      timestamp: envelope.event.timestamp || Date.now(),
      payload: envelope.event.payload
    }));
  }
}
