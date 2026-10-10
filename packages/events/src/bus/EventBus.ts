import { RuntimeEvent } from '../models';
import { EventMatcher } from './EventMatcher';

export type EventHandler<T = any> = (event: RuntimeEvent<T>) => void | Promise<void>;

export interface SubscriptionOptions {
  priority?: number; // Higher numbers execute first (default: 0)
  filter?: (event: RuntimeEvent) => boolean;
  once?: boolean;
}

export interface Subscription {
  id: string;
  pattern: string;
  unsubscribe: () => void;
}

interface InternalSubscriber {
  id: string;
  pattern: string;
  handler: EventHandler;
  priority: number;
  filter?: (event: RuntimeEvent) => boolean;
  once: boolean;
}

export interface DeadLetterEvent {
  event: RuntimeEvent;
  error: Error;
  subscriberId: string;
  timestamp: string;
}

export class EventBus {
  private subscribers: Map<string, InternalSubscriber> = new Map();
  private deadLetterQueue: DeadLetterEvent[] = [];
  private subCounter = 0;

  /**
   * Subscribes a handler to a pattern (e.g. 'session.*', 'agent.**', '*').
   */
  public subscribe<T = any>(
    pattern: string,
    handler: EventHandler<T>,
    options: SubscriptionOptions = {}
  ): Subscription {
    const id = `sub_${++this.subCounter}_${Date.now()}`;
    const sub: InternalSubscriber = {
      id,
      pattern,
      handler: handler as EventHandler,
      priority: options.priority ?? 0,
      filter: options.filter,
      once: options.once ?? false,
    };

    this.subscribers.set(id, sub);

    return {
      id,
      pattern,
      unsubscribe: () => this.unsubscribe(id),
    };
  }

  /**
   * Subscribes a handler that will fire only once for matching events.
   */
  public subscribeOnce<T = any>(
    pattern: string,
    handler: EventHandler<T>,
    options: Omit<SubscriptionOptions, 'once'> = {}
  ): Subscription {
    return this.subscribe(pattern, handler, { ...options, once: true });
  }

  public unsubscribe(subscriptionId: string): boolean {
    return this.subscribers.delete(subscriptionId);
  }

  /**
   * Emits an event synchronously to all matching subscribers, ordered by priority.
   * If any subscriber fails, the error is caught and pushed to DLQ to protect caller.
   */
  public emit(event: RuntimeEvent): void {
    const matching = this.getMatchingSubscribers(event);

    for (const sub of matching) {
      if (sub.once) {
        this.subscribers.delete(sub.id);
      }

      try {
        const result = sub.handler(event);
        if (result instanceof Promise) {
          result.catch(err => this.handleSubscriberError(event, sub.id, err));
        }
      } catch (err: any) {
        this.handleSubscriberError(event, sub.id, err);
      }
    }
  }

  /**
   * Emits an event asynchronously and awaits all matching subscribers.
   */
  public async emitAsync(event: RuntimeEvent): Promise<void> {
    const matching = this.getMatchingSubscribers(event);

    for (const sub of matching) {
      if (sub.once) {
        this.subscribers.delete(sub.id);
      }

      try {
        await sub.handler(event);
      } catch (err: any) {
        this.handleSubscriberError(event, sub.id, err);
      }
    }
  }

  /**
   * Creates an async iterable stream for consuming events with `for await (const ev of bus.stream(pattern))`.
   */
  public stream<T = any>(
    pattern: string = '*',
    options: { signal?: AbortSignal; filter?: (event: RuntimeEvent) => boolean } = {}
  ): AsyncIterable<RuntimeEvent<T>> {
    const queue: RuntimeEvent<T>[] = [];
    let notify: (() => void) | null = null;
    let ended = false;

    const sub = this.subscribe<T>(
      pattern,
      (event) => {
        if (ended) return;
        queue.push(event);
        if (notify) {
          const resolve = notify;
          notify = null;
          resolve();
        }
      },
      { filter: options.filter }
    );

    if (options.signal) {
      options.signal.addEventListener('abort', () => {
        ended = true;
        sub.unsubscribe();
        if (notify) {
          const resolve = notify;
          notify = null;
          resolve();
        }
      });
    }

    return {
      [Symbol.asyncIterator]: () => ({
        next: async (): Promise<IteratorResult<RuntimeEvent<T>>> => {
          while (queue.length === 0 && !ended) {
            await new Promise<void>((resolve) => {
              notify = resolve;
            });
          }

          if (queue.length > 0) {
            return { value: queue.shift()!, done: false };
          }

          sub.unsubscribe();
          return { value: undefined as any, done: true };
        },
        return: async (): Promise<IteratorResult<RuntimeEvent<T>>> => {
          ended = true;
          sub.unsubscribe();
          return { value: undefined as any, done: true };
        },
      }),
    };
  }

  private getMatchingSubscribers(event: RuntimeEvent): InternalSubscriber[] {
    const matches: InternalSubscriber[] = [];

    for (const sub of this.subscribers.values()) {
      if (!EventMatcher.matches(sub.pattern, event.eventType)) continue;
      if (sub.filter && !sub.filter(event)) continue;
      matches.push(sub);
    }

    // Sort descending by priority (higher priority runs first)
    return matches.sort((a, b) => b.priority - a.priority);
  }

  private handleSubscriberError(event: RuntimeEvent, subscriberId: string, error: any): void {
    const errObj = error instanceof Error ? error : new Error(String(error));
    this.deadLetterQueue.push({
      event,
      error: errObj,
      subscriberId,
      timestamp: new Date().toISOString(),
    });
  }

  public getDeadLetters(): DeadLetterEvent[] {
    return [...this.deadLetterQueue];
  }

  public clearDeadLetters(): void {
    this.deadLetterQueue = [];
  }

  public getSubscriberCount(pattern?: string): number {
    if (!pattern) return this.subscribers.size;
    let count = 0;
    for (const sub of this.subscribers.values()) {
      if (sub.pattern === pattern) count++;
    }
    return count;
  }

  public clear(): void {
    this.subscribers.clear();
    this.deadLetterQueue = [];
  }
}

export const eventBus = new EventBus();
