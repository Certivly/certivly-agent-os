import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as path from 'path';
import * as fs from 'fs';
import { LoggingEventBus } from '@agent-os/shared';
import { ChangeSetStore, computeSha256 } from '@agent-os/patch-engine';
import { handleApprove, handleReject } from '../src/bridge/ApprovalHandler';
import type { ChangeSet } from '@agent-os/patch-engine';

describe('Truthful Approval Package and Apply Contract (Action 4-08)', () => {
  const baseTmpDir = path.join(__dirname, '.tmp-approval-contract');
  let workspaceDir: string;
  let changesetsDir: string;
  let store: ChangeSetStore;
  let eventBus: LoggingEventBus;

  beforeEach(() => {
    if (!fs.existsSync(baseTmpDir)) {
      fs.mkdirSync(baseTmpDir, { recursive: true });
    }
    const testId = crypto.randomUUID();
    workspaceDir = path.join(baseTmpDir, `ws-${testId}`);
    changesetsDir = path.join(workspaceDir, '.agentos', 'changesets');
    fs.mkdirSync(workspaceDir, { recursive: true });
    fs.mkdirSync(changesetsDir, { recursive: true });

    store = new ChangeSetStore(changesetsDir);
    eventBus = new LoggingEventBus();
  });

  afterEach(() => {
    try {
      if (fs.existsSync(baseTmpDir)) {
        fs.rmSync(baseTmpDir, { recursive: true, force: true });
      }
    } catch {}
  });

  it('1. Approval applies exact files: save fake ChangeSet with 1 modified file, verify file on disk matches', async () => {
    const filePath = path.join(workspaceDir, 'hello.txt');
    const initialContent = 'Hello World\n';
    fs.writeFileSync(filePath, initialContent, 'utf8');

    const updatedContent = 'Hello Antigravity\n';
    const beforeHash = computeSha256(initialContent);
    const afterHash = computeSha256(updatedContent);

    const changeSetId = 'cs-exact-1';
    const changeSet: ChangeSet = {
      id: changeSetId,
      workspaceRoot: workspaceDir,
      createdAt: new Date().toISOString(),
      files: [
        {
          path: 'hello.txt',
          kind: 'modify',
          diff: '--- a/hello.txt\n+++ b/hello.txt\n@@ -1 +1 @@\n-Hello World\n+Hello Antigravity\n',
          before: beforeHash,
          after: afterHash,
          afterContent: updatedContent,
        },
      ],
    };

    store.save(changeSet);

    const emittedResponses: string[] = [];
    eventBus.subscribe('message.responded', (evt: any) => {
      if (evt.payload?.response) {
        emittedResponses.push(String(evt.payload.response));
      }
    });

    const result = await handleApprove(changeSetId, {
      eventBus,
      sessionId: 'sess-approval-1',
      workspaceRoot: workspaceDir,
      store,
    });

    expect(result.success).toBe(true);
    const diskContent = fs.readFileSync(filePath, 'utf8');
    expect(diskContent).toBe(updatedContent);
    expect(emittedResponses.some(r => r.includes('[Applied] 1 file(s) changed'))).toBe(true);
  });

  it('2. Missing changeSetId returns error message: verify message.responded contains [Approval Error]', async () => {
    const emittedResponses: string[] = [];
    eventBus.subscribe('message.responded', (evt: any) => {
      if (evt.payload?.response) {
        emittedResponses.push(String(evt.payload.response));
      }
    });

    const result = await handleApprove('nonexistent-id', {
      eventBus,
      sessionId: 'sess-approval-2',
      workspaceRoot: workspaceDir,
      store,
    });

    expect(result.success).toBe(false);
    expect(emittedResponses.some(r => r.includes('[Approval Error]') && r.includes('nonexistent-id'))).toBe(true);
  });

  it('3. Reject deletes the changeset: verify store.load(changeSetId) returns null', async () => {
    const changeSetId = 'cs-reject-me';
    const changeSet: ChangeSet = {
      id: changeSetId,
      workspaceRoot: workspaceDir,
      createdAt: new Date().toISOString(),
      files: [
        {
          path: 'rejected.txt',
          kind: 'add',
          diff: '--- /dev/null\n+++ b/rejected.txt\n@@ -0,0 +1 @@\n+should not exist\n',
          afterContent: 'should not exist',
        },
      ],
    };

    store.save(changeSet);
    expect(store.load(changeSetId)).not.toBeNull();

    const emittedResponses: string[] = [];
    eventBus.subscribe('message.responded', (evt: any) => {
      if (evt.payload?.response) {
        emittedResponses.push(String(evt.payload.response));
      }
    });

    await handleReject(changeSetId, {
      eventBus,
      sessionId: 'sess-approval-3',
      store,
    });

    expect(store.load(changeSetId)).toBeNull();
    expect(emittedResponses.some(r => r.includes('[Rejected] ChangeSet cs-reject-me discarded.'))).toBe(true);
  });

  it('4. Double-apply is safe: applying changeset twice does not corrupt workspace and returns clear error', async () => {
    const filePath = path.join(workspaceDir, 'counter.txt');
    const initialContent = 'count: 0\n';
    fs.writeFileSync(filePath, initialContent, 'utf8');

    const updatedContent = 'count: 1\n';
    const beforeHash = computeSha256(initialContent);
    const afterHash = computeSha256(updatedContent);

    const changeSetId = 'cs-double-apply';
    const changeSet: ChangeSet = {
      id: changeSetId,
      workspaceRoot: workspaceDir,
      createdAt: new Date().toISOString(),
      files: [
        {
          path: 'counter.txt',
          kind: 'modify',
          diff: '--- a/counter.txt\n+++ b/counter.txt\n@@ -1 +1 @@\n-count: 0\n+count: 1\n',
          before: beforeHash,
          after: afterHash,
          afterContent: updatedContent,
        },
      ],
    };

    store.save(changeSet);

    // First apply succeeds
    const firstResult = await handleApprove(changeSetId, {
      eventBus,
      sessionId: 'sess-double-1',
      workspaceRoot: workspaceDir,
      store,
    });
    expect(firstResult.success).toBe(true);
    expect(fs.readFileSync(filePath, 'utf8')).toBe(updatedContent);

    // Second apply detects hash mismatch / conflict and does NOT corrupt file
    const secondResult = await handleApprove(changeSetId, {
      eventBus,
      sessionId: 'sess-double-2',
      workspaceRoot: workspaceDir,
      store,
    });

    expect(secondResult.success).toBe(false);
    expect(secondResult.error).toContain('[Approval Error]');
    // File content remains uncorrupted
    expect(fs.readFileSync(filePath, 'utf8')).toBe(updatedContent);
  });
});
