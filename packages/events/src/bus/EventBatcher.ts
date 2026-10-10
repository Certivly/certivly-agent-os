import { RuntimeEvent } from '../models';

export interface EventBatcherOptions {
  maxBatchSize?: number; // e.g. 50 events
  flushIntervalMs?: number; // e.g. 50ms
  onFlush: (batch: RuntimeEvent[]) => void | Promise<void>;
}

export class EventBatcher {
  private buffer: RuntimeEvent[] = [];
  private timer: any = null;
  private readonly maxBatchSize: number;
  private readonly flushIntervalMs: number;
  private readonly onFlush: (batch: RuntimeEvent[]) => void | Promise<void>;

  constructor(options: EventBatcherOptions) {
    this.maxBatchSize = options.maxBatchSize ?? 50;
    this.flushIntervalMs = options.flushIntervalMs ?? 50;
    this.onFlush = options.onFlush;
  }

  public push(event: RuntimeEvent): void {
    this.buffer.push(event);

    if (this.buffer.length >= this.maxBatchSize) {
      this.flush();
    } else if (!this.timer) {
      this.timer = setTimeout(() => {
        this.timer = null;
        this.flush();
      }, this.flushIntervalMs);
    }
  }

  public flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    if (this.buffer.length === 0) return;

    const batch = [...this.buffer];
    this.buffer = [];

    try {
      this.onFlush(batch);
    } catch (_err) {
      // Guard against throwing during flush
    }
  }

  public size(): number {
    return this.buffer.length;
  }

  public destroy(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.flush();
  }
}
