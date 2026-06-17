import { JsonObject } from './types';
import { getAgentContext } from './context';
import { logger } from './logger';

export interface RuntimeEvent {
  id: string;
  type: string;
  timestamp: string;
  correlationId?: string;
  sessionId?: string;
  payload: JsonObject;
}

export interface EventPublisher {
  publish(type: string, payload: JsonObject): string;
}

export interface EventSubscriber {
  subscribe(type: string, handler: (event: RuntimeEvent) => void | Promise<void>): void;
}

export interface EventBus extends EventPublisher, EventSubscriber {}

export class LoggingEventBus implements EventBus {
  private handlers: Map<string, Array<(event: RuntimeEvent) => void | Promise<void>>> = new Map();

  publish(type: string, payload: JsonObject): string {
    const ctx = getAgentContext();
    const event: RuntimeEvent = {
      id: crypto.randomUUID(),
      type,
      timestamp: new Date().toISOString(),
      correlationId: ctx?.requestId,
      sessionId: ctx?.sessionId,
      payload
    };

    // Use logging as the initial event sink
    logger.info('eventbus', type, `Event Emitted: ${type}`, { eventId: event.id, payload });

    const typeHandlers = this.handlers.get(type) || [];
    const allHandlers = this.handlers.get('*') || [];

    // Fire and forget
    for (const handler of [...typeHandlers, ...allHandlers]) {
      Promise.resolve(handler(event)).catch(err => {
        logger.error('eventbus', 'event.handler.error', `Error in event handler for ${type}`, { error: err.message });
      });
    }

    return event.id;
  }

  subscribe(type: string, handler: (event: RuntimeEvent) => void | Promise<void>): void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, []);
    }
    this.handlers.get(type)!.push(handler);
  }
}
