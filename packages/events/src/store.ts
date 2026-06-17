import { Database } from 'bun:sqlite';
import { drizzle, BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { eq, asc } from 'drizzle-orm';
import * as schema from './schema';
import * as fs from 'fs';
import * as path from 'path';
import { RuntimeEvent, EventEnvelope } from './models';
import { AgentError, logger } from '@agent-os/shared';
import { metrics } from '@agent-os/metrics';

export class EventStoreError extends AgentError {
  constructor(message: string) {
    super(message, 'EventStoreError');
  }
}

export class EventStore {
  private db: BunSQLiteDatabase<typeof schema>;

  constructor(dbPath: string) {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const sqlite = new Database(dbPath);
    
    sqlite.run(`
      CREATE TABLE IF NOT EXISTS events (
        sequence_number INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        event_type TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        request_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        source TEXT NOT NULL,
        payload TEXT NOT NULL,
        version TEXT NOT NULL,
        persisted_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      );
    `);
    
    // Create indices for faster replay and filtering
    sqlite.run(`CREATE INDEX IF NOT EXISTS idx_events_session_id ON events(session_id);`);
    sqlite.run(`CREATE INDEX IF NOT EXISTS idx_events_event_type ON events(event_type);`);

    this.db = drizzle(sqlite, { schema });
  }

  public append(event: RuntimeEvent): void {
    try {
      this.db.insert(schema.events).values({
        id: event.id,
        eventType: event.eventType,
        timestamp: event.timestamp,
        requestId: event.requestId,
        sessionId: event.sessionId,
        source: event.source,
        payload: JSON.stringify(event.payload),
        version: event.version,
        persistedAt: Date.now()
      }).run();
      
      // Observability Metric
      metrics.counter('events_written').inc();
    } catch (e: any) {
      if (e.message.includes('UNIQUE constraint failed')) {
        throw new EventStoreError(`Event with id ${event.id} already exists`);
      }
      throw new EventStoreError(`Failed to append event: ${e.message}`);
    }
  }

  public loadEvents(sessionId: string): EventEnvelope[] {
    try {
      const records = this.db.select()
        .from(schema.events)
        .where(eq(schema.events.sessionId, sessionId))
        .orderBy(asc(schema.events.sequenceNumber))
        .all();

      let expectedSequence = -1;
      for (const record of records) {
        if (expectedSequence !== -1 && record.sequenceNumber !== expectedSequence + 1) {
          if (record.sequenceNumber <= expectedSequence) {
            metrics.counter('event_replay_failures').inc();
            throw new EventStoreError(`Integrity failure: duplicate or out of order event detected at sequence ${record.sequenceNumber}`);
          } else {
            metrics.counter('event_replay_failures').inc();
            throw new EventStoreError(`Integrity failure: sequence gap detected. Expected ${expectedSequence + 1}, got ${record.sequenceNumber}`);
          }
        }
        expectedSequence = record.sequenceNumber;
      }

      return records.map(r => ({
        event: {
          id: r.id,
          eventType: r.eventType,
          timestamp: r.timestamp,
          requestId: r.requestId,
          sessionId: r.sessionId,
          source: r.source,
          payload: JSON.parse(r.payload),
          version: r.version
        },
        metadata: {
          persistedAt: new Date(r.persistedAt || 0).toISOString(),
          sequenceNumber: r.sequenceNumber
        }
      }));
    } catch (e: any) {
      if (e instanceof EventStoreError) throw e;
      throw new EventStoreError(`Failed to load events: ${e.message}`);
    }
  }

  public replayEvents(sessionId: string, handler: (event: RuntimeEvent) => void): void {
    const envelopes = this.loadEvents(sessionId);
    for (const env of envelopes) {
      handler(env.event);
    }
  }
}
