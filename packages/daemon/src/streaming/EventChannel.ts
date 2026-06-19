import { EventBus, StreamEvent } from './EventBus';

export class EventChannel {
  constructor(
    private bus: EventBus,
    public readonly name: string
  ) {}

  public emit(topic: string, payload: any): void {
    const event: StreamEvent = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      channel: this.name,
      topic,
      payload
    };
    this.bus.publish(event);
  }

  public on(topic: string, handler: (payload: any) => void): () => void {
    return this.bus.subscribe(this.name, (event) => {
      if (event.topic === topic || topic === '*') {
        handler(event.payload);
      }
    });
  }
}
