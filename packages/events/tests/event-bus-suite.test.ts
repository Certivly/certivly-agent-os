import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import {
  EventMatcher,
  EventBus,
  EventBatcher,
  PersistentEventBus,
  EventStore,
  RuntimeEvent,
} from '../src';
import * as fs from 'fs';
import * as path from 'path';

describe('Events Package Complete Suite', () => {
  describe('EventMatcher', () => {
    it('matches exact topic strings', () => {
      expect(EventMatcher.matches('session.created', 'session.created')).toBe(true);
      expect(EventMatcher.matches('session.created', 'session.deleted')).toBe(false);
    });

    it('matches single-level wildcard *', () => {
      expect(EventMatcher.matches('session.*', 'session.created')).toBe(true);
      expect(EventMatcher.matches('session.*', 'session.closed')).toBe(true);
      expect(EventMatcher.matches('session.*', 'session.turn.started')).toBe(false);
    });

    it('matches multi-level wildcard **', () => {
      expect(EventMatcher.matches('agent.**', 'agent.turn.start')).toBe(true);
      expect(EventMatcher.matches('agent.**', 'agent.tool.exec.done')).toBe(true);
      expect(EventMatcher.matches('agent.**', 'agent.started')).toBe(true);
      expect(EventMatcher.matches('agent.**', 'session.started')).toBe(false);
    });

    it('matches global wildcard *', () => {
      expect(EventMatcher.matches('*', 'anything.here')).toBe(true);
    });
  });

  describe('EventBus', () => {
    let bus: EventBus;

    beforeEach(() => {
      bus = new EventBus();
    });

    it('subscribes and receives matching events', () => {
      const received: string[] = [];
      bus.subscribe('test.*', (ev) => {
        received.push(ev.eventType);
      });

      bus.emit({
        id: '1',
        eventType: 'test.one',
        timestamp: new Date().toISOString(),
        requestId: 'req-1',
        sessionId: 'sess-1',
        source: 'test',
        payload: { val: 1 },
        version: '1.0',
      });

      bus.emit({
        id: '2',
        eventType: 'other.event',
        timestamp: new Date().toISOString(),
        requestId: 'req-2',
        sessionId: 'sess-1',
        source: 'test',
        payload: { val: 2 },
        version: '1.0',
      });

      expect(received).toEqual(['test.one']);
    });

    it('respects subscriber priority order', () => {
      const executionOrder: string[] = [];

      bus.subscribe('priority.test', () => { executionOrder.push('low'); }, { priority: 1 });
      bus.subscribe('priority.test', () => { executionOrder.push('high'); }, { priority: 10 });
      bus.subscribe('priority.test', () => { executionOrder.push('default'); }, { priority: 0 });

      bus.emit({
        id: '3',
        eventType: 'priority.test',
        timestamp: new Date().toISOString(),
        requestId: 'req-3',
        sessionId: 'sess-1',
        source: 'test',
        payload: {},
        version: '1.0',
      });

      expect(executionOrder).toEqual(['high', 'low', 'default']);
    });

    it('supports subscribeOnce', () => {
      let count = 0;
      bus.subscribeOnce('once.test', () => {
        count++;
      });

      const makeEvent = (id: string): RuntimeEvent => ({
        id,
        eventType: 'once.test',
        timestamp: new Date().toISOString(),
        requestId: 'req',
        sessionId: 'sess',
        source: 'test',
        payload: {},
        version: '1.0',
      });

      bus.emit(makeEvent('e1'));
      bus.emit(makeEvent('e2'));

      expect(count).toBe(1);
    });

    it('captures subscriber errors to Dead Letter Queue without throwing', () => {
      bus.subscribe('fail.test', () => {
        throw new Error('Listener exploded');
      });

      let nextReceived = false;
      bus.subscribe('fail.test', () => {
        nextReceived = true;
      });

      bus.emit({
        id: 'fail-1',
        eventType: 'fail.test',
        timestamp: new Date().toISOString(),
        requestId: 'req',
        sessionId: 'sess',
        source: 'test',
        payload: {},
        version: '1.0',
      });

      expect(nextReceived).toBe(true);
      const dlq = bus.getDeadLetters();
      expect(dlq.length).toBe(1);
      expect(dlq[0].error.message).toContain('Listener exploded');
    });

    it('streams events using async iterator', async () => {
      const controller = new AbortController();
      const stream = bus.stream('stream.*', { signal: controller.signal });

      setTimeout(() => {
        bus.emit({
          id: 's1',
          eventType: 'stream.item',
          timestamp: new Date().toISOString(),
          requestId: 'r',
          sessionId: 's',
          source: 't',
          payload: { num: 1 },
          version: '1.0',
        });
        bus.emit({
          id: 's2',
          eventType: 'stream.item',
          timestamp: new Date().toISOString(),
          requestId: 'r',
          sessionId: 's',
          source: 't',
          payload: { num: 2 },
          version: '1.0',
        });
        controller.abort();
      }, 20);

      const items: number[] = [];
      for await (const ev of stream) {
        items.push(ev.payload.num);
      }

      expect(items).toEqual([1, 2]);
    });
  });

  describe('EventBatcher', () => {
    it('flushes batches when maxBatchSize is reached', () => {
      let flushedBatch: RuntimeEvent[] = [];
      const batcher = new EventBatcher({
        maxBatchSize: 3,
        flushIntervalMs: 500,
        onFlush: (batch) => {
          flushedBatch = batch;
        },
      });

      const makeEvent = (id: string): RuntimeEvent => ({
        id,
        eventType: 'batch.item',
        timestamp: new Date().toISOString(),
        requestId: 'r',
        sessionId: 's',
        source: 't',
        payload: {},
        version: '1.0',
      });

      batcher.push(makeEvent('b1'));
      batcher.push(makeEvent('b2'));
      expect(flushedBatch.length).toBe(0);

      batcher.push(makeEvent('b3'));
      expect(flushedBatch.length).toBe(3);

      batcher.destroy();
    });
  });

  describe('PersistentEventBus', () => {
    const testDbPath = path.join(process.cwd(), 'temp-test-events.db');

    afterEach(() => {
      if (fs.existsSync(testDbPath)) {
        try { fs.unlinkSync(testDbPath); } catch {}
      }
    });

    it('persists emitted events and replays them accurately', () => {
      const store = new EventStore(testDbPath);
      const persistentBus = new PersistentEventBus({ store });

      const inMemorySeen: string[] = [];
      persistentBus.bus.subscribe('sess.*', (ev) => {
        inMemorySeen.push(ev.id);
      });

      const ev1: RuntimeEvent = {
        id: 'p1',
        eventType: 'sess.start',
        timestamp: new Date().toISOString(),
        requestId: 'r1',
        sessionId: 'session-persist',
        source: 'agent',
        payload: { step: 1 },
        version: '1.0',
      };
      const ev2: RuntimeEvent = {
        id: 'p2',
        eventType: 'sess.end',
        timestamp: new Date().toISOString(),
        requestId: 'r2',
        sessionId: 'session-persist',
        source: 'agent',
        payload: { step: 2 },
        version: '1.0',
      };

      persistentBus.emit(ev1);
      persistentBus.emit(ev2);

      expect(inMemorySeen).toEqual(['p1', 'p2']);

      // Replay check
      const replayed: string[] = [];
      const replayTarget = new EventBus();
      replayTarget.subscribe('*', (ev) => {
        replayed.push(ev.id);
      });

      const count = persistentBus.replay('session-persist', replayTarget);
      expect(count).toBe(2);
      expect(replayed).toEqual(['p1', 'p2']);
    });
  });
});
