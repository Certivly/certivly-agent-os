import { Database } from 'bun:sqlite';
import { drizzle, BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { eq, desc } from 'drizzle-orm';
import * as schema from './schema';
import * as fs from 'fs';
import * as path from 'path';
import { Memory, MemoryType } from './models';
import { AgentError } from '@agent-os/shared';

export class MemoryStoreError extends AgentError {
  constructor(message: string) {
    super(message, 'MemoryStoreError');
  }
}

export class MemoryStore {
  private db: BunSQLiteDatabase<typeof schema>;

  constructor(dbPath: string) {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const sqlite = new Database(dbPath);
    
    sqlite.run(`
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        topic TEXT NOT NULL,
        content TEXT NOT NULL,
        confidence REAL NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        source_event_ids TEXT NOT NULL,
        source_session_ids TEXT NOT NULL,
        source_request_ids TEXT NOT NULL,
        source_context_ids TEXT NOT NULL,
        tags TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1
      );
    `);
    
    sqlite.run(`CREATE INDEX IF NOT EXISTS idx_memories_topic ON memories(topic);`);
    sqlite.run(`CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);`);

    this.db = drizzle(sqlite, { schema });
  }

  private mapFromDb(record: any): Memory {
    return {
      id: record.id,
      type: record.type as MemoryType,
      topic: record.topic,
      content: record.content,
      confidence: record.confidence,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      sourceEventIds: typeof record.sourceEventIds === 'string' ? JSON.parse(record.sourceEventIds) : record.sourceEventIds,
      sourceSessionIds: typeof record.sourceSessionIds === 'string' ? JSON.parse(record.sourceSessionIds) : record.sourceSessionIds,
      sourceRequestIds: typeof record.sourceRequestIds === 'string' ? JSON.parse(record.sourceRequestIds) : record.sourceRequestIds,
      sourceContextIds: typeof record.sourceContextIds === 'string' ? JSON.parse(record.sourceContextIds) : record.sourceContextIds,
      tags: typeof record.tags === 'string' ? JSON.parse(record.tags) : record.tags,
      version: record.version
    };
  }

  public save(memory: Memory): void {
    try {
      const existing = this.db.select().from(schema.memories).where(eq(schema.memories.id, memory.id)).get();
      if (existing) {
        this.db.update(schema.memories).set({
          type: memory.type,
          topic: memory.topic,
          content: memory.content,
          confidence: memory.confidence,
          updatedAt: memory.updatedAt,
          sourceEventIds: JSON.stringify(memory.sourceEventIds),
          sourceSessionIds: JSON.stringify(memory.sourceSessionIds),
          sourceRequestIds: JSON.stringify(memory.sourceRequestIds),
          sourceContextIds: JSON.stringify(memory.sourceContextIds),
          tags: JSON.stringify(memory.tags),
          version: memory.version + 1
        }).where(eq(schema.memories.id, memory.id)).run();
      } else {
        this.db.insert(schema.memories).values({
          id: memory.id,
          type: memory.type,
          topic: memory.topic,
          content: memory.content,
          confidence: memory.confidence,
          createdAt: memory.createdAt,
          updatedAt: memory.updatedAt,
          sourceEventIds: JSON.stringify(memory.sourceEventIds),
          sourceSessionIds: JSON.stringify(memory.sourceSessionIds),
          sourceRequestIds: JSON.stringify(memory.sourceRequestIds),
          sourceContextIds: JSON.stringify(memory.sourceContextIds),
          tags: JSON.stringify(memory.tags),
          version: memory.version
        }).run();
      }
    } catch (e: any) {
      throw new MemoryStoreError(`Failed to save memory: ${e.message}`);
    }
  }

  public getMemory(id: string): Memory | undefined {
    const record = this.db.select().from(schema.memories).where(eq(schema.memories.id, id)).get();
    return record ? this.mapFromDb(record) : undefined;
  }

  public getMemoriesByTopic(topic: string): Memory[] {
    const records = this.db.select().from(schema.memories)
      .where(eq(schema.memories.topic, topic))
      .orderBy(desc(schema.memories.createdAt))
      .all();
    return records.map(r => this.mapFromDb(r));
  }

  public getMemoriesByType(type: MemoryType): Memory[] {
    const records = this.db.select().from(schema.memories)
      .where(eq(schema.memories.type, type))
      .orderBy(desc(schema.memories.createdAt))
      .all();
    return records.map(r => this.mapFromDb(r));
  }

  public search(query: string, limit = 5): Memory[] {
    // Pull recent memories and filter by keyword relevance
    const all = this.db.select().from(schema.memories)
      .orderBy(desc(schema.memories.createdAt))
      .limit(200)
      .all();

    const lower = query.toLowerCase();
    const words = lower.split(/\s+/).filter(w => w.length > 3);

    return all
      .map(r => this.mapFromDb(r))
      .filter(m => {
        const text = (m.topic + ' ' + m.content).toLowerCase();
        return words.some(w => text.includes(w));
      })
      .slice(0, limit);
  }
}
