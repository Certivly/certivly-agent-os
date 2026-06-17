import { EventStore } from '@agent-os/events';
import { UIEvent } from './EventStreamAdapter';

export class SessionHydrator {
  constructor(private eventStore: EventStore) {}

  public async hydrate(sessionId: string): Promise<UIEvent[]> {
    const rawEvents = await this.eventStore.getEvents(sessionId);
    return rawEvents.map((raw: any) => ({
      id: raw.id || Date.now().toString(),
      type: raw.type,
      timestamp: raw.timestamp || Date.now(),
      payload: raw.payload
    }));
  }
}
