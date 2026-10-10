import { EventBus } from './EventBus';
import { EventStore } from '../store';
import { RuntimeEvent } from '../models';

export interface PersistentEventBusOptions {
  store: EventStore;
  bus?: EventBus;
  autoPersist?: boolean;
}

export class PersistentEventBus {
  public readonly bus: EventBus;
  public readonly store: EventStore;
  private readonly autoPersist: boolean;

  constructor(options: PersistentEventBusOptions) {
    this.store = options.store;
    this.bus = options.bus ?? new EventBus();
    this.autoPersist = options.autoPersist ?? true;
  }

  /**
   * Publishes an event to in-memory bus and optionally appends it to persistent store.
   */
  public emit(event: RuntimeEvent): void {
    if (this.autoPersist) {
      try {
        this.store.append(event);
      } catch (err) {
        // Log or handle store error, don't crash in-memory subscribers
      }
    }
    this.bus.emit(event);
  }

  /**
   * Asynchronously publishes an event to in-memory bus and appends to persistent store.
   */
  public async emitAsync(event: RuntimeEvent): Promise<void> {
    if (this.autoPersist) {
      try {
        this.store.append(event);
      } catch (err) {
        // Silently isolate or propagate
      }
    }
    await this.bus.emitAsync(event);
  }

  /**
   * Replays historical events for a session through the event bus.
   */
  public replay(sessionId: string, targetBus?: EventBus): number {
    const replayBus = targetBus ?? this.bus;
    const envelopes = this.store.loadEvents(sessionId);
    for (const env of envelopes) {
      replayBus.emit(env.event);
    }
    return envelopes.length;
  }
}
