import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const events = sqliteTable('events', {
  sequenceNumber: integer('sequence_number').primaryKey({ autoIncrement: true }),
  id: text('id').notNull().unique(),
  eventType: text('event_type').notNull(),
  timestamp: text('timestamp').notNull(),
  requestId: text('request_id').notNull(),
  sessionId: text('session_id').notNull(),
  source: text('source').notNull(),
  payload: text('payload').notNull(), // JSON string
  version: text('version').notNull(),
  persistedAt: integer('persisted_at').default(Date.now()),
});
