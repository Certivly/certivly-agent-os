import { EventBus } from '@agent-os/shared';

export interface UIEvent {
  id: string;
  type: string;
  timestamp: number;
  payload: any;
}

export class EventRingBuffer {
  private buffer: UIEvent[] = [];
  private maxSize = 10000;

  push(event: UIEvent) {
    if (this.buffer.length >= this.maxSize) {
      this.buffer.shift();
    }
    this.buffer.push(event);
  }

  getSnapshot(): UIEvent[] {
    return [...this.buffer];
  }
}

export class EventBatcher {
  private queue: UIEvent[] = [];
  private listeners: ((batch: UIEvent[]) => void)[] = [];
  private timer: any;

  constructor(private interval = 33) {
    this.timer = setInterval(() => this.flush(), this.interval);
  }

  add(event: UIEvent) {
    if (this.queue.length > 10000) {
      if (event.type === 'llm.token.stream' || event.type.startsWith('debug')) {
        return; // Drop UI-only events under severe backpressure
      }
    }
    this.queue.push(event);
  }

  flush() {
    if (this.queue.length === 0) return;

    const batch = [...this.queue];
    this.queue = [];

    this.listeners.forEach(fn => fn(batch));
  }

  subscribe(fn: (batch: UIEvent[]) => void) {
    this.listeners.push(fn);
  }

  cleanup() {
    clearInterval(this.timer);
  }
}

export class EventStreamAdapter {
  public readonly ringBuffer = new EventRingBuffer();
  public readonly batcher = new EventBatcher(33);

  constructor(private eventBus: EventBus, private sessionId: string, private debug: boolean = false) {
    this.subscribeToStore();
  }

  private subscribeToStore() {
    this.eventBus.subscribe('*', (rawEvent: any) => {
      if (rawEvent.sessionId && rawEvent.sessionId !== this.sessionId && rawEvent.sessionId !== 'system') return;
      
      // If not in debug mode, filter out raw infrastructure events unless they are core UI events
      if (!this.debug) {
         const isCoreUiEvent = [
           'message.received',
           'message.responded',
           'llm.token.stream',
           'provider.request.started',
           'provider.request.completed',
           'provider.health.ok',
           'provider.health.failed'
         ].includes(rawEvent.type);
         
         const isNarrativeEvent = rawEvent.type.startsWith('narrative.');
         
         if (!isCoreUiEvent && !isNarrativeEvent) {
           return; // Drop internal event from UI stream in normal mode
         }
      }

      const uiEvent: UIEvent = {
        id: rawEvent.id || Date.now().toString(),
        type: rawEvent.type,
        timestamp: rawEvent.timestamp || Date.now(),
        payload: rawEvent.payload
      };

      this.ringBuffer.push(uiEvent);
      this.batcher.add(uiEvent);
    });
  }

  public cleanup() {
    this.batcher.cleanup();
  }
}
