import { Database } from 'bun:sqlite';
import { drizzle, BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import * as schema from './schema';
import * as fs from 'fs';
import * as path from 'path';

export function getDb(dbPath: string): { db: BunSQLiteDatabase<typeof schema>; sqlite: Database } {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const sqlite = new Database(dbPath);
  
  // Basic migrations
  sqlite.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      title TEXT,
      status TEXT DEFAULT 'active',
      parent_id TEXT,
      tags TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    );
  `);

  // Migrate existing sessions table if missing columns
  const tableInfo = sqlite.query("PRAGMA table_info(sessions)").all() as Array<{ name: string }>;
  const colNames = new Set(tableInfo.map(c => c.name));
  if (!colNames.has('title')) {
    try {
      sqlite.run("ALTER TABLE sessions ADD COLUMN title TEXT;");
    } catch (_err) {
      void _err;
    }
  }
  if (!colNames.has('status')) {
    try {
      sqlite.run("ALTER TABLE sessions ADD COLUMN status TEXT DEFAULT 'active';");
    } catch (_err) {
      void _err;
    }
  }
  if (!colNames.has('parent_id')) {
    try {
      sqlite.run("ALTER TABLE sessions ADD COLUMN parent_id TEXT;");
    } catch (_err) {
      void _err;
    }
  }
  if (!colNames.has('tags')) {
    try {
      sqlite.run("ALTER TABLE sessions ADD COLUMN tags TEXT;");
    } catch (_err) {
      void _err;
    }
  }
  if (!colNames.has('updated_at')) {
    try {
      sqlite.run("ALTER TABLE sessions ADD COLUMN updated_at INTEGER DEFAULT (strftime('%s', 'now'));");
    } catch (_err) {
      void _err;
    }
  }

  sqlite.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    );
  `);
  sqlite.run(`
    CREATE TABLE IF NOT EXISTS tool_calls (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL,
      name TEXT NOT NULL,
      args TEXT NOT NULL,
      result TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (message_id) REFERENCES messages(id)
    );
  `);
  sqlite.run(`
    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      user_input TEXT,
      final_text TEXT,
      verification TEXT,
      approval_decisions TEXT,
      trace_path TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    );
  `);
  sqlite.run(`
    CREATE TABLE IF NOT EXISTS checkpoints (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      description TEXT NOT NULL,
      message_id TEXT,
      state TEXT NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    );
  `);

  sqlite.run(`CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);`);
  sqlite.run(`CREATE INDEX IF NOT EXISTS idx_tool_calls_message_id ON tool_calls(message_id);`);
  sqlite.run(`CREATE INDEX IF NOT EXISTS idx_checkpoints_session_id ON checkpoints(session_id);`);

  return { db: drizzle(sqlite, { schema }), sqlite };
}
