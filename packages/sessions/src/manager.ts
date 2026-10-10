import { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { eq, desc, asc, like } from 'drizzle-orm';
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

export interface ForkSessionOptions {
  fromMessageId?: string;
  newSessionId?: string;
  title?: string;
  tags?: string[];
}

export interface SessionSearchOptions {
  query?: string;
  tags?: string[];
  status?: schema.SessionStatus;
  limit?: number;
  offset?: number;
}

export interface SessionSearchResult {
  id: string;
  title?: string | null;
  status?: string | null;
  tags: string[];
  createdAt: Date | null;
  messageCount: number;
  lastMessageSnippet?: string;
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
    } catch (_err) {
      // best-effort: SQLite database may already be closed
    }
  }

  public createSession(id: string, options?: { title?: string; parentId?: string; tags?: string[] }): void {
    try {
      this.db.insert(schema.sessions).values({
        id,
        title: options?.title ?? null,
        parentId: options?.parentId ?? null,
        tags: options?.tags ? JSON.stringify(options.tags) : null,
        status: 'active',
      }).run();
    } catch (e: any) {
      throw new SessionError(`Failed to create session: ${e.message}`);
    }
  }

  public getSession(id: string) {
    const session = this.db.select().from(schema.sessions).where(eq(schema.sessions.id, id)).get();
    if (!session) {
      throw new SessionError(`Session ${id} not found`);
    }
    return {
      ...session,
      parsedTags: session.tags ? JSON.parse(session.tags) as string[] : [],
    };
  }

  public updateSession(
    id: string,
    updates: Partial<{ title: string; status: schema.SessionStatus; tags: string[] }>
  ): void {
    try {
      const setVals: any = { updatedAt: new Date() };
      if (updates.title !== undefined) setVals.title = updates.title;
      if (updates.status !== undefined) setVals.status = updates.status;
      if (updates.tags !== undefined) setVals.tags = JSON.stringify(updates.tags);

      this.db.update(schema.sessions)
        .set(setVals)
        .where(eq(schema.sessions.id, id))
        .run();
    } catch (e: any) {
      throw new SessionError(`Failed to update session: ${e.message}`);
    }
  }

  public addMessage(sessionId: string, message: MessageData): void {
    try {
      this.db.insert(schema.messages).values({
        id: message.id,
        sessionId,
        role: message.role,
        content: message.content,
      }).run();
      
      // Update session updatedAt
      try {
        this.db.update(schema.sessions)
          .set({ updatedAt: new Date() })
          .where(eq(schema.sessions.id, sessionId))
          .run();
      } catch (_err) {
        void _err;
      }
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
      .orderBy(asc(schema.messages.createdAt))
      .all();
  }

  /**
   * Forks an existing session into a new branch.
   * Copies all messages up to fromMessageId (or all messages if not specified)
   * and copies all associated tool calls.
   */
  public forkSession(sourceSessionId: string, options: ForkSessionOptions = {}): string {
    const parentSession = this.getSession(sourceSessionId);
    const newSessionId = options.newSessionId ?? `fork_${sourceSessionId}_${Date.now()}`;
    const newTitle = options.title ?? `Fork of ${parentSession.title || sourceSessionId}`;

    const allMessages = this.getMessages(sourceSessionId);
    let messagesToCopy = allMessages;
    if (options.fromMessageId) {
      const idx = allMessages.findIndex(m => m.id === options.fromMessageId);
      if (idx !== -1) {
        messagesToCopy = allMessages.slice(0, idx + 1);
      }
    }

    this.createSession(newSessionId, {
      title: newTitle,
      parentId: sourceSessionId,
      tags: options.tags ?? parentSession.parsedTags,
    });

    for (const msg of messagesToCopy) {
      const newMsgId = `fork_${msg.id}_${Date.now()}`;
      this.addMessage(newSessionId, {
        id: newMsgId,
        role: msg.role,
        content: msg.content,
      });

      // Copy tool calls for this message
      const toolCalls = this.db.select().from(schema.toolCalls).where(eq(schema.toolCalls.messageId, msg.id)).all();
      for (const tc of toolCalls) {
        this.addToolCall({
          id: `fork_${tc.id}_${Date.now()}`,
          messageId: newMsgId,
          name: tc.name,
          args: tc.args,
          result: tc.result,
        });
      }
    }

    return newSessionId;
  }

  /**
   * Checkpoint management
   */
  public saveCheckpoint(sessionId: string, description: string, state: any, messageId?: string): string {
    const id = `chk_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    try {
      this.db.insert(schema.checkpoints).values({
        id,
        sessionId,
        description,
        messageId: messageId ?? null,
        state: JSON.stringify(state),
      }).run();
      return id;
    } catch (e: any) {
      throw new SessionError(`Failed to save checkpoint: ${e.message}`);
    }
  }

  public getCheckpoints(sessionId: string) {
    const records = this.db.select().from(schema.checkpoints)
      .where(eq(schema.checkpoints.sessionId, sessionId))
      .orderBy(desc(schema.checkpoints.createdAt))
      .all();

    return records.map(r => ({
      ...r,
      parsedState: JSON.parse(r.state),
    }));
  }

  public getCheckpoint(checkpointId: string) {
    const record = this.db.select().from(schema.checkpoints).where(eq(schema.checkpoints.id, checkpointId)).get();
    if (!record) return null;
    return {
      ...record,
      parsedState: JSON.parse(record.state),
    };
  }

  /**
   * Search and filter sessions
   */
  public searchSessions(options: SessionSearchOptions = {}): SessionSearchResult[] {
    const allSessions = this.listAllSessions();
    const results: SessionSearchResult[] = [];

    for (const s of allSessions) {
      const parsedTags: string[] = s.tags ? JSON.parse(s.tags) : [];

      if (options.status && s.status !== options.status) continue;
      if (options.tags && options.tags.length > 0) {
        const hasTag = options.tags.some(t => parsedTags.includes(t));
        if (!hasTag) continue;
      }

      const msgs = this.getMessages(s.id);

      if (options.query) {
        const q = options.query.toLowerCase();
        const titleMatch = (s.title ?? '').toLowerCase().includes(q);
        const msgMatch = msgs.some(m => m.content.toLowerCase().includes(q));
        if (!titleMatch && !msgMatch) continue;
      }

      const lastMsg = msgs.length > 0 ? msgs[msgs.length - 1].content : undefined;
      const snippet = lastMsg ? (lastMsg.length > 100 ? lastMsg.slice(0, 97) + '...' : lastMsg) : undefined;

      results.push({
        id: s.id,
        title: s.title,
        status: s.status,
        tags: parsedTags,
        createdAt: s.createdAt,
        messageCount: msgs.length,
        lastMessageSnippet: snippet,
      });
    }

    // Sort by createdAt desc
    results.sort((a, b) => {
      const ta = a.createdAt?.getTime() ?? 0;
      const tb = b.createdAt?.getTime() ?? 0;
      return tb - ta;
    });

    const offset = options.offset ?? 0;
    const limit = options.limit ?? results.length;
    return results.slice(offset, offset + limit);
  }

  /**
   * Export session to JSON or Markdown
   */
  public exportSession(sessionId: string, format: 'json' | 'markdown' = 'json'): string {
    const session = this.getSession(sessionId);
    const messages = this.getMessages(sessionId);
    const toolCalls = this.getToolCallsForSession(sessionId);
    const runs = this.getRuns(sessionId);
    const checkpoints = this.getCheckpoints(sessionId);

    if (format === 'json') {
      return JSON.stringify({
        session,
        messages,
        toolCalls,
        runs,
        checkpoints,
      }, null, 2);
    }

    // Format markdown transcript
    let md = `# Session: ${session.title || session.id}\n`;
    md += `**ID**: \`${session.id}\` | **Status**: ${session.status || 'active'} | **Created**: ${session.createdAt?.toISOString()}\n`;
    if (session.parsedTags.length > 0) {
      md += `**Tags**: ${session.parsedTags.join(', ')}\n`;
    }
    md += `\n---\n\n`;

    const toolCallsByMessage = new Map<string, typeof toolCalls>();
    for (const tc of toolCalls) {
      const list = toolCallsByMessage.get(tc.messageId) ?? [];
      list.push(tc);
      toolCallsByMessage.set(tc.messageId, list);
    }

    for (const msg of messages) {
      md += `### ${msg.role.toUpperCase()} (\`${msg.id}\`)\n\n`;
      md += `${msg.content}\n\n`;

      const tcs = toolCallsByMessage.get(msg.id);
      if (tcs && tcs.length > 0) {
        md += `#### Tool Calls\n`;
        for (const tc of tcs) {
          md += `\`${tc.name}\`:\n\`\`\`json\n${tc.args}\n\`\`\`\n`;
          if (tc.result) {
            md += `Result:\n\`\`\`\n${tc.result}\n\`\`\`\n`;
          }
        }
        md += `\n`;
      }
    }

    return md;
  }

  /**
   * Import session from JSON
   */
  public importSession(jsonData: string | object): string {
    const data = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
    const s = data.session;
    if (!s || !s.id) throw new SessionError('Invalid session import data: missing session.id');

    this.createSession(s.id, {
      title: s.title,
      parentId: s.parentId,
      tags: s.parsedTags ?? (s.tags ? JSON.parse(s.tags) : undefined),
    });

    const messageIdMap = new Map<string, string>();

    if (data.messages && Array.isArray(data.messages)) {
      for (const m of data.messages) {
        const existing = this.db.select().from(schema.messages).where(eq(schema.messages.id, m.id)).get();
        const msgId = existing ? `imp_${m.id}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}` : m.id;
        messageIdMap.set(m.id, msgId);

        this.addMessage(s.id, {
          id: msgId,
          role: m.role,
          content: m.content,
        });
      }
    }

    if (data.toolCalls && Array.isArray(data.toolCalls)) {
      for (const tc of data.toolCalls) {
        const existing = this.db.select().from(schema.toolCalls).where(eq(schema.toolCalls.id, tc.id)).get();
        const tcId = existing ? `imp_${tc.id}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}` : tc.id;
        const targetMessageId = messageIdMap.get(tc.messageId) ?? tc.messageId;

        this.addToolCall({
          id: tcId,
          messageId: targetMessageId,
          name: tc.name,
          args: tc.args,
          result: tc.result,
        });
      }
    }

    return s.id;
  }

  /**
   * Delete session and all related records
   */
  public deleteSession(sessionId: string): void {
    try {
      const msgs = this.getMessages(sessionId);
      for (const m of msgs) {
        this.db.delete(schema.toolCalls).where(eq(schema.toolCalls.messageId, m.id)).run();
      }
      this.db.delete(schema.messages).where(eq(schema.messages.sessionId, sessionId)).run();
      this.db.delete(schema.runs).where(eq(schema.runs.sessionId, sessionId)).run();
      this.db.delete(schema.checkpoints).where(eq(schema.checkpoints.sessionId, sessionId)).run();
      this.db.delete(schema.sessions).where(eq(schema.sessions.id, sessionId)).run();
    } catch (e: any) {
      throw new SessionError(`Failed to delete session: ${e.message}`);
    }
  }

  // --- Run management (preserved from original) ---

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

  public listAllRuns() {
    return this.db.select().from(schema.runs).all();
  }

  public listAllSessions() {
    return this.db.select().from(schema.sessions).all();
  }
}
