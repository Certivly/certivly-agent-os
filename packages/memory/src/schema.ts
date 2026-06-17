import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const memories = sqliteTable('memories', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  topic: text('topic').notNull(),
  content: text('content').notNull(),
  confidence: real('confidence').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  sourceEventIds: text('source_event_ids').notNull(), // JSON array
  sourceSessionIds: text('source_session_ids').notNull(), // JSON array
  sourceRequestIds: text('source_request_ids').notNull(), // JSON array
  tags: text('tags').notNull(), // JSON array
  version: integer('version').notNull().default(1),
});
