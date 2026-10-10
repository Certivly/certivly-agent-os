import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export type SessionStatus = 'active' | 'paused' | 'completed' | 'failed' | 'archived' | 'deleted';

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  title: text('title'),
  status: text('status').$type<SessionStatus>().default('active'),
  parentId: text('parent_id'),
  tags: text('tags'), // JSON string array
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
});

export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => sessions.id),
  role: text('role').notNull(), // 'user', 'assistant', 'system', 'tool'
  content: text('content').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
});

export const toolCalls = sqliteTable('tool_calls', {
  id: text('id').primaryKey(),
  messageId: text('message_id').notNull().references(() => messages.id),
  name: text('name').notNull(),
  args: text('args').notNull(), // JSON string
  result: text('result'), // JSON string, nullable initially
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
});

export type RunStatus = 'running' | 'completed' | 'failed' | 'cancelled';

export const runs = sqliteTable('runs', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => sessions.id),
  status: text('status').$type<RunStatus>().notNull().default('running'),
  userInput: text('user_input'),
  finalText: text('final_text'),
  verification: text('verification'),
  approvalDecisions: text('approval_decisions'),
  tracePath: text('trace_path'),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
});

export const checkpoints = sqliteTable('checkpoints', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => sessions.id),
  description: text('description').notNull(),
  messageId: text('message_id'),
  state: text('state').notNull(), // JSON string
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
});
