import { describe, it, expect, mock } from 'bun:test';
import { LoggingEventBus } from '../src/events';
import { runWithContext } from '../src/context';

describe('LoggingEventBus', () => {
  it('should publish events and trigger handlers asynchronously', async () => {
    const bus = new LoggingEventBus();
    let handledPayload: any = null;

    bus.subscribe('test.event', (event) => {
      handledPayload = event.payload;
    });

    bus.publish('test.event', { foo: 'bar' });

    // Yield to microtask queue since handlers are triggered asynchronously/fire-and-forget
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(handledPayload).toEqual({ foo: 'bar' });
  });

  it('should capture context in events', async () => {
    const bus = new LoggingEventBus();
    let capturedEvent: any = null;

    bus.subscribe('test.context', (event) => {
      capturedEvent = event;
    });

    runWithContext({ requestId: 'req-123', sessionId: 'sess-456' }, () => {
      bus.publish('test.context', {});
    });

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(capturedEvent).toBeDefined();
    expect(capturedEvent.correlationId).toBe('req-123');
    expect(capturedEvent.sessionId).toBe('sess-456');
  });
});
