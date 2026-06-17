import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { EventStore, EventStoreError, RuntimeEvent } from '../src';

describe('EventStore', () => {
  const dbDir = path.join(__dirname, '.agentos');
  let dbPath: string;
  let store: EventStore;

  beforeEach(() => {
    dbPath = path.join(dbDir, `events-${crypto.randomUUID()}.db`);
    if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
    store = new EventStore(dbPath);
  });

  afterEach(() => {
    // Avoid EBUSY on Windows by not deleting the db files immediately,
    // or just let them sit since they are randomly named.
  });

  it('should append events and retain ordering', () => {
    const e1: RuntimeEvent = {
      id: crypto.randomUUID(),
      eventType: 'message.received',
      timestamp: new Date().toISOString(),
      requestId: 'req-1',
      sessionId: 'sess-1',
      source: 'test',
      payload: { msg: 'hello' },
      version: '1.0'
    };

    const e2: RuntimeEvent = {
      id: crypto.randomUUID(),
      eventType: 'message.responded',
      timestamp: new Date().toISOString(),
      requestId: 'req-1',
      sessionId: 'sess-1',
      source: 'test',
      payload: { msg: 'hi' },
      version: '1.0'
    };

    store.append(e1);
    store.append(e2);

    const loaded = store.loadEvents('sess-1');
    expect(loaded.length).toBe(2);
    expect(loaded[0].event.eventType).toBe('message.received');
    expect(loaded[1].event.eventType).toBe('message.responded');
    expect(loaded[0].metadata.sequenceNumber).toBeLessThan(loaded[1].metadata.sequenceNumber!);
  });

  it('should enforce unique event IDs', () => {
    const e1: RuntimeEvent = {
      id: 'unique-id',
      eventType: 'message.received',
      timestamp: new Date().toISOString(),
      requestId: 'req-1',
      sessionId: 'sess-1',
      source: 'test',
      payload: {},
      version: '1.0'
    };

    store.append(e1);
    expect(() => store.append(e1)).toThrow(EventStoreError);
  });

  it('should replay events to a handler', () => {
    const e1: RuntimeEvent = {
      id: crypto.randomUUID(),
      eventType: 'test.event',
      timestamp: new Date().toISOString(),
      requestId: 'req-1',
      sessionId: 'sess-2',
      source: 'test',
      payload: {},
      version: '1.0'
    };
    store.append(e1);

    const replayed: RuntimeEvent[] = [];
    store.replayEvents('sess-2', (e) => replayed.push(e));

    expect(replayed.length).toBe(1);
    expect(replayed[0].id).toBe(e1.id);
  });
});
