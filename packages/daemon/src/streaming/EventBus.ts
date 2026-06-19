export interface StreamEvent {
  id: string;
  timestamp: number;
  channel: string;
  topic: string;
  payload: any;
}

export type EventSubscriber = (event: StreamEvent) => void;

export class EventBus {
  private subscribers = new Map<string, Set<EventSubscriber>>();

  public publish(event: StreamEvent): void {
    const channelSubs = this.subscribers.get(event.channel);
    if (channelSubs) {
      for (const sub of channelSubs) {
        sub(event);
      }
    }

    const allSubs = this.subscribers.get('*');
    if (allSubs) {
      for (const sub of allSubs) {
        sub(event);
      }
    }
  }

  public subscribe(channel: string, subscriber: EventSubscriber): () => void {
    if (!this.subscribers.has(channel)) {
      this.subscribers.set(channel, new Set());
    }
    this.subscribers.get(channel)!.add(subscriber);

    return () => this.unsubscribe(channel, subscriber);
  }

  public unsubscribe(channel: string, subscriber: EventSubscriber): void {
    const subs = this.subscribers.get(channel);
    if (subs) {
      subs.delete(subscriber);
      if (subs.size === 0) {
        this.subscribers.delete(channel);
      }
    }
  }
}
