import { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { eq } from 'drizzle-orm';
import * as schema from './schema';
import { getDb } from './db';
import { SessionError } from '@agent-os/shared';

export interface MessageData {
  id: string;
  role: string;
  content: string;
}

export interface ToolCallData {
  id: string;
  messageId: string;
  name: string;
  args: string;
  result?: string | null;
}

export class SessionManager {
  private db: BunSQLiteDatabase<typeof schema>;
  private sqlite: import('bun:sqlite').Database;

  constructor(dbPath: string) {
    const { db, sqlite } = getDb(dbPath);
    this.db = db;
    this.sqlite = sqlite;
  }

  public close(): void {
    try {
      this.sqlite.close();
    } catch {}
  }



  public createSession(id: string): void {

    try {
      this.db.insert(schema.sessions).values({ id }).run();
    } catch (e: any) {
      throw new SessionError(`Failed to create session: ${e.message}`);
    }
  }

  public getSession(id: string) {
    const session = this.db.select().from(schema.sessions).where(eq(schema.sessions.id, id)).get();
    if (!session) {
      throw new SessionError(`Session ${id} not found`);
    }
    return session;
  }

  public addMessage(sessionId: string, message: MessageData): void {
    try {
      this.db.insert(schema.messages).values({
        id: message.id,
        sessionId,
        role: message.role,
        content: message.content,
      }).run();
    } catch (e: any) {
      throw new SessionError(`Failed to add message: ${e.message}`);
    }
  }

  public addToolCall(toolCall: ToolCallData): void {
    try {
      this.db.insert(schema.toolCalls).values({
        id: toolCall.id,
        messageId: toolCall.messageId,
        name: toolCall.name,
        args: toolCall.args,
        result: toolCall.result,
      }).run();
    } catch (e: any) {
      throw new SessionError(`Failed to add tool call: ${e.message}`);
    }
  }

  public updateToolCallResult(id: string, result: string): void {
    try {
      this.db.update(schema.toolCalls)
        .set({ result })
        .where(eq(schema.toolCalls.id, id))
        .run();
    } catch (e: any) {
      throw new SessionError(`Failed to update tool call: ${e.message}`);
    }
  }

  public getMessages(sessionId: string) {
    return this.db.select().from(schema.messages)
      .where(eq(schema.messages.sessionId, sessionId))
      .all();
  }

  public createRun(run: {
    id: string;
    sessionId: string;
    status?: schema.RunStatus;
    userInput?: string;
    tracePath?: string;
  }): void {
    try {
      this.db.insert(schema.runs).values({
        id: run.id,
        sessionId: run.sessionId,
        status: run.status ?? 'running',
        userInput: run.userInput,
        tracePath: run.tracePath,
      }).run();
    } catch (e: any) {
      throw new SessionError(`Failed to create run: ${e.message}`);
    }
  }

  public updateRun(id: string, updates: Partial<{
    status: schema.RunStatus;
    userInput?: string;
    finalText?: string;
    verification?: string;
    approvalDecisions?: string;
    tracePath?: string;
  }>): void {
    try {
      this.db.update(schema.runs)
        .set({
          ...updates,
          updatedAt: new Date(),
        })
        .where(eq(schema.runs.id, id))
        .run();
    } catch (e: any) {
      throw new SessionError(`Failed to update run: ${e.message}`);
    }
  }

  public getRun(id: string) {
    const run = this.db.select().from(schema.runs).where(eq(schema.runs.id, id)).get();
    return run ?? null;
  }

  public getRuns(sessionId: string) {
    return this.db.select().from(schema.runs)
      .where(eq(schema.runs.sessionId, sessionId))
      .all();
  }

  public getIncompleteRun(sessionId: string) {
    const run = this.db.select().from(schema.runs)
      .where(eq(schema.runs.sessionId, sessionId))
      .all()
      .find(r => r.status === 'running');
    return run ?? null;
  }

  public getToolCallsForSession(sessionId: string) {
    const msgs = this.getMessages(sessionId);
    if (msgs.length === 0) return [];
    const msgIds = new Set(msgs.map(m => m.id));
    return this.db.select().from(schema.toolCalls).all().filter(tc => msgIds.has(tc.messageId));
  }
}

