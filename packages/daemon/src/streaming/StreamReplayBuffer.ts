import { StreamEvent } from './EventBus';

export class StreamReplayBuffer {
  private events: StreamEvent[] = [];
  
  constructor(private maxEvents: number = 10000) {}

  public add(event: StreamEvent): void {
    this.events.push(event);
    if (this.events.length > this.maxEvents) {
      this.events.shift(); // Remove oldest
    }
  }

  public getEventsAfter(timestamp: number): StreamEvent[] {
    return this.events.filter(e => e.timestamp > timestamp);
  }

  public getAll(): StreamEvent[] {
    return [...this.events];
  }

  public clear(): void {
    this.events = [];
  }
}
