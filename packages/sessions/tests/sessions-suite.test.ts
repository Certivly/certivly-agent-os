import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { SessionManager } from '../src';

describe('Sessions Package Complete Suite', () => {
  let dbPath: string;
  let manager: SessionManager;

  beforeEach(() => {
    dbPath = path.join(process.cwd(), `temp-test-sessions-${crypto.randomUUID()}.db`);
    manager = new SessionManager(dbPath);
  });

  afterEach(() => {
    manager.close();
    if (fs.existsSync(dbPath)) {
      try { fs.unlinkSync(dbPath); } catch {}
    }
  });

  it('creates, retrieves, and updates session metadata (title, status, tags)', () => {
    manager.createSession('sess-100', {
      title: 'Initial Fix Plan',
      tags: ['refactor', 'v2'],
    });

    const session = manager.getSession('sess-100');
    expect(session.id).toBe('sess-100');
    expect(session.title).toBe('Initial Fix Plan');
    expect(session.status).toBe('active');
    expect(session.parsedTags).toEqual(['refactor', 'v2']);

    manager.updateSession('sess-100', {
      title: 'Completed Fix Plan',
      status: 'completed',
      tags: ['refactor', 'v2', 'done'],
    });

    const updated = manager.getSession('sess-100');
    expect(updated.title).toBe('Completed Fix Plan');
    expect(updated.status).toBe('completed');
    expect(updated.parsedTags).toContain('done');
  });

  it('forks / branches a session at a specific message with tool calls preserved', () => {
    manager.createSession('sess-parent', { title: 'Parent Work' });

    manager.addMessage('sess-parent', { id: 'm1', role: 'user', content: 'Explore repo' });
    manager.addMessage('sess-parent', { id: 'm2', role: 'assistant', content: 'Let me list files' });
    manager.addToolCall({
      id: 'tc1',
      messageId: 'm2',
      name: 'list_dir',
      args: JSON.stringify({ path: '.' }),
      result: 'file1.ts, file2.ts',
    });
    manager.addMessage('sess-parent', { id: 'm3', role: 'user', content: 'Now modify file1' });

    // Fork at message m2
    const forkedId = manager.forkSession('sess-parent', {
      fromMessageId: 'm2',
      newSessionId: 'sess-branch-1',
      title: 'Alternative Approach',
    });

    expect(forkedId).toBe('sess-branch-1');
    const forkedSession = manager.getSession('sess-branch-1');
    expect(forkedSession.parentId).toBe('sess-parent');
    expect(forkedSession.title).toBe('Alternative Approach');

    const branchMessages = manager.getMessages('sess-branch-1');
    expect(branchMessages.length).toBe(2); // Only m1 and m2 copied
    expect(branchMessages[0].content).toBe('Explore repo');
    expect(branchMessages[1].content).toBe('Let me list files');

    const branchToolCalls = manager.getToolCallsForSession('sess-branch-1');
    expect(branchToolCalls.length).toBe(1);
    expect(branchToolCalls[0].name).toBe('list_dir');
  });

  it('saves and restores state checkpoints', () => {
    manager.createSession('sess-chk');
    manager.addMessage('sess-chk', { id: 'm-chk', role: 'user', content: 'test' });

    const chkId = manager.saveCheckpoint('sess-chk', 'Initial snapshot', {
      filesModified: ['src/index.ts'],
      memory: { currentGoal: 'refactor' },
    }, 'm-chk');

    expect(chkId).toBeDefined();

    const checkpoints = manager.getCheckpoints('sess-chk');
    expect(checkpoints.length).toBe(1);
    expect(checkpoints[0].description).toBe('Initial snapshot');
    expect(checkpoints[0].parsedState.filesModified).toEqual(['src/index.ts']);

    const single = manager.getCheckpoint(chkId);
    expect(single?.parsedState.memory.currentGoal).toBe('refactor');
  });

  it('searches and filters sessions by text query, status, and tags', () => {
    manager.createSession('s-search-1', { title: 'Fix database migration', tags: ['db', 'urgent'] });
    manager.addMessage('s-search-1', { id: 'm-s1', role: 'user', content: 'SQLite foreign key error' });

    manager.createSession('s-search-2', { title: 'Implement UI sidebar', tags: ['frontend'] });
    manager.addMessage('s-search-2', { id: 'm-s2', role: 'user', content: 'Sidebar layout styles' });

    const queryMatches = manager.searchSessions({ query: 'SQLite' });
    expect(queryMatches.length).toBe(1);
    expect(queryMatches[0].id).toBe('s-search-1');

    const tagMatches = manager.searchSessions({ tags: ['frontend'] });
    expect(tagMatches.length).toBe(1);
    expect(tagMatches[0].id).toBe('s-search-2');
  });

  it('exports session to JSON and Markdown transcript and imports from JSON', () => {
    manager.createSession('s-export', { title: 'Export Demo', tags: ['demo'] });
    manager.addMessage('s-export', { id: 'm-exp-1', role: 'user', content: 'Hello agent' });
    manager.addMessage('s-export', { id: 'm-exp-2', role: 'assistant', content: 'Hello user' });
    manager.addToolCall({
      id: 'tc-exp',
      messageId: 'm-exp-2',
      name: 'read_file',
      args: '{"file": "README.md"}',
      result: 'AgentOS Readme',
    });

    // Markdown export
    const md = manager.exportSession('s-export', 'markdown');
    expect(md).toContain('# Session: Export Demo');
    expect(md).toContain('### USER');
    expect(md).toContain('### ASSISTANT');
    expect(md).toContain('`read_file`');

    // JSON export
    const jsonStr = manager.exportSession('s-export', 'json');
    const parsed = JSON.parse(jsonStr);
    expect(parsed.session.id).toBe('s-export');
    expect(parsed.messages.length).toBe(2);

    // Import into a new manager / session
    const importedId = manager.importSession({
      session: { id: 's-imported', title: 'Imported Session', tags: JSON.stringify(['imported']) },
      messages: parsed.messages,
      toolCalls: parsed.toolCalls,
    });

    expect(importedId).toBe('s-imported');
    const importedMessages = manager.getMessages('s-imported');
    expect(importedMessages.length).toBe(2);
  });

  it('deletes a session and cascades deletes to related messages and tool calls', () => {
    manager.createSession('s-del');
    manager.addMessage('s-del', { id: 'm-del', role: 'user', content: 'delete me' });
    manager.addToolCall({ id: 'tc-del', messageId: 'm-del', name: 'noop', args: '{}' });

    manager.deleteSession('s-del');
    expect(() => manager.getSession('s-del')).toThrow();
    expect(manager.getMessages('s-del').length).toBe(0);
    expect(manager.getToolCallsForSession('s-del').length).toBe(0);
  });
});
