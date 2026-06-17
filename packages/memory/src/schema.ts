import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const memories = sqliteTable('memories', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  topic: text('topic').notNull(),
  content: text('content').notNull(),
  confidence: real('confidence').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  sourceEventIds: text('source_event_ids', { mode: 'json' }).$type<string[]>().notNull(),
  sourceSessionIds: text('source_session_ids', { mode: 'json' }).$type<string[]>().notNull(),
  sourceRequestIds: text('source_request_ids', { mode: 'json' }).$type<string[]>().notNull(),
  sourceContextIds: text('source_context_ids', { mode: 'json' }).$type<string[]>().notNull(),
  tags: text('tags', { mode: 'json' }).$type<string[]>().notNull(),
  version: integer('version').notNull().default(1),
});
