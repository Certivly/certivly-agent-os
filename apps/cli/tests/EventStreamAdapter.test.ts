import { describe, expect, it } from 'bun:test';
import { EventStreamAdapter } from '../src/bridge/EventStreamAdapter';
import { LoggingEventBus } from '@agent-os/shared';

describe('EventStreamAdapter', () => {
  it('should drop internal events in normal mode', () => {
    const eventBus = new LoggingEventBus();
    const adapter = new EventStreamAdapter(eventBus, 'sess1', false);
    
    eventBus.publish('repository.scan.started', { sessionId: 'sess1' });
    const snapshot = adapter.ringBuffer.getSnapshot();
    
    expect(snapshot.length).toBe(0);
  });

  it('should keep internal events in debug mode', () => {
    const eventBus = new LoggingEventBus();
    const adapter = new EventStreamAdapter(eventBus, 'sess2', true);
    
    eventBus.publish('repository.scan.started', { sessionId: 'sess2' });
    const snapshot = adapter.ringBuffer.getSnapshot();
    
    expect(snapshot.length).toBe(1);
    expect(snapshot[0].type).toBe('repository.scan.started');
  });

  it('should always keep UI core events', () => {
    const eventBus = new LoggingEventBus();
    const adapter = new EventStreamAdapter(eventBus, 'sess3', false);
    
    eventBus.publish('message.responded', { sessionId: 'sess3' });
    eventBus.publish('llm.token.stream', { sessionId: 'sess3' });
    eventBus.publish('narrative.activity.started', { sessionId: 'sess3' });

    const snapshot = adapter.ringBuffer.getSnapshot();
    expect(snapshot.length).toBe(3);
  });
});
