import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as path from 'path';
import * as fs from 'fs';
import {
  ChangeSet,
  ChangeSetApplier,
  computeSha256,
} from '../index';

describe('Action 2.07: ChangeSetApplier With Hash Conflict Detection', () => {
  const tmpWorkspace = path.resolve(__dirname, '.tmp-changeset-apply-' + Date.now());
  const applier = new ChangeSetApplier();

  beforeEach(() => {
    fs.mkdirSync(tmpWorkspace, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpWorkspace, { recursive: true, force: true });
  });

  it('1. modifies file when before hash matches', async () => {
    const filePath = path.join(tmpWorkspace, 'src', 'app.ts');
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const originalContent = 'export const version = "1.0.0";\n';
    fs.writeFileSync(filePath, originalContent, 'utf8');

    const beforeHash = computeSha256(originalContent);
    const newContent = 'export const version = "1.0.1";\n';
    const afterHash = computeSha256(newContent);

    const changeSet: ChangeSet = {
      id: 'cs-mod-1',
      workspaceRoot: tmpWorkspace,
      createdAt: new Date().toISOString(),
      files: [
        {
          path: 'src/app.ts',
          kind: 'modify',
          before: beforeHash,
          after: afterHash,
          afterContent: newContent,
          diff: '--- a/src/app.ts\n+++ b/src/app.ts\n@@ -1 +1 @@\n-export const version = "1.0.0";\n+export const version = "1.0.1";\n',
        },
      ],
    };

    const res = await applier.applyChangeSet(tmpWorkspace, changeSet);

    expect(res.applied).toBe(true);
    expect(res.conflicts).toHaveLength(0);
    expect(res.errors).toHaveLength(0);
    expect(res.backupId).toBeDefined();

    // Verify file content updated
    const updatedContent = fs.readFileSync(filePath, 'utf8');
    expect(updatedContent).toBe(newContent);

    // Verify backup manifest exists in .agentos/backups/<backupId>/
    const backupDir = path.join(tmpWorkspace, '.agentos', 'backups', res.backupId!);
    expect(fs.existsSync(path.join(backupDir, 'manifest.json'))).toBe(true);
  });

  it('2. adds new file and fails if it already exists', async () => {
    const targetRel = 'src/new-feature.ts';
    const content = 'export const feature = true;\n';
    const afterHash = computeSha256(content);

    const addChangeSet: ChangeSet = {
      id: 'cs-add-1',
      workspaceRoot: tmpWorkspace,
      createdAt: new Date().toISOString(),
      files: [
        {
          path: targetRel,
          kind: 'add',
          after: afterHash,
          afterContent: content,
          diff: '--- /dev/null\n+++ b/src/new-feature.ts\n@@ -0,0 +1 @@\n+export const feature = true;\n',
        },
      ],
    };

    // First application succeeds
    const res1 = await applier.applyChangeSet(tmpWorkspace, addChangeSet);
    expect(res1.applied).toBe(true);
    const addedPath = path.join(tmpWorkspace, targetRel);
    expect(fs.readFileSync(addedPath, 'utf8')).toBe(content);

    // Second application fails because file already exists
    const res2 = await applier.applyChangeSet(tmpWorkspace, addChangeSet);
    expect(res2.applied).toBe(false);
    expect(res2.conflicts.length).toBeGreaterThan(0);
    expect(res2.conflicts[0].reason).toContain('File already exists');
  });

  it('3. deletes file when before hash matches', async () => {
    const fileRel = 'src/obsolete.ts';
    const fullPath = path.join(tmpWorkspace, fileRel);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    const content = 'export const old = 42;\n';
    fs.writeFileSync(fullPath, content, 'utf8');

    const deleteChangeSet: ChangeSet = {
      id: 'cs-del-1',
      workspaceRoot: tmpWorkspace,
      createdAt: new Date().toISOString(),
      files: [
        {
          path: fileRel,
          kind: 'delete',
          before: computeSha256(content),
          diff: '--- a/src/obsolete.ts\n+++ /dev/null\n@@ -1 +0,0 @@\n-export const old = 42;\n',
        },
      ],
    };

    const res = await applier.applyChangeSet(tmpWorkspace, deleteChangeSet);
    expect(res.applied).toBe(true);
    expect(fs.existsSync(fullPath)).toBe(false);
  });

  it('4. detects conflict after user edit changes file hash', async () => {
    const fileRel = 'src/service.ts';
    const fullPath = path.join(tmpWorkspace, fileRel);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });

    const originalContent = 'function connect() {}\n';
    fs.writeFileSync(fullPath, originalContent, 'utf8');
    const oldHash = computeSha256(originalContent);

    // User edits file concurrently
    const userEditedContent = 'function connect(port = 8080) {}\n';
    fs.writeFileSync(fullPath, userEditedContent, 'utf8');

    const staleChangeSet: ChangeSet = {
      id: 'cs-conflict-1',
      workspaceRoot: tmpWorkspace,
      createdAt: new Date().toISOString(),
      files: [
        {
          path: fileRel,
          kind: 'modify',
          before: oldHash,
          afterContent: 'function connect(secure = true) {}\n',
          diff: 'stale diff',
        },
      ],
    };

    const res = await applier.applyChangeSet(tmpWorkspace, staleChangeSet);
    expect(res.applied).toBe(false);
    expect(res.conflicts.length).toBe(1);
    expect(res.conflicts[0].reason).toContain('Hash mismatch');
    // Ensure user edits were NOT overwritten
    expect(fs.readFileSync(fullPath, 'utf8')).toBe(userEditedContent);
  });

  it('5. atomic failure leaves workspace completely unchanged', async () => {
    // File 1: valid modify target
    const file1Rel = 'src/file1.ts';
    const file1Path = path.join(tmpWorkspace, file1Rel);
    fs.mkdirSync(path.dirname(file1Path), { recursive: true });
    const content1 = 'original file 1\n';
    fs.writeFileSync(file1Path, content1, 'utf8');

    // File 2: conflict target (hash mismatch)
    const file2Rel = 'src/file2.ts';
    const file2Path = path.join(tmpWorkspace, file2Rel);
    const content2 = 'original file 2\n';
    fs.writeFileSync(file2Path, content2, 'utf8');

    // ChangeSet touches file1, adds file3, but has conflict on file2
    const multiFileChangeSet: ChangeSet = {
      id: 'cs-atomic-fail-1',
      workspaceRoot: tmpWorkspace,
      createdAt: new Date().toISOString(),
      files: [
        {
          path: file1Rel,
          kind: 'modify',
          before: computeSha256(content1),
          afterContent: 'modified file 1\n',
          diff: 'diff 1',
        },
        {
          path: 'src/file3.ts',
          kind: 'add',
          afterContent: 'new file 3\n',
          diff: 'diff 3',
        },
        {
          path: file2Rel,
          kind: 'modify',
          before: '0000000000000000000000000000000000000000000000000000000000000000', // Stale/wrong hash
          afterContent: 'modified file 2\n',
          diff: 'diff 2',
        },
      ],
    };

    const res = await applier.applyChangeSet(tmpWorkspace, multiFileChangeSet);
    expect(res.applied).toBe(false);
    expect(res.conflicts.length).toBe(1);

    // Assert file1 remains untouched
    expect(fs.readFileSync(file1Path, 'utf8')).toBe(content1);
    // Assert file3 was never created
    expect(fs.existsSync(path.join(tmpWorkspace, 'src', 'file3.ts'))).toBe(false);
    // Assert file2 remains untouched
    expect(fs.readFileSync(file2Path, 'utf8')).toBe(content2);
  });

  it('6. rejects traversal paths', async () => {
    const traversalChangeSet: ChangeSet = {
      id: 'cs-traversal-1',
      workspaceRoot: tmpWorkspace,
      createdAt: new Date().toISOString(),
      files: [
        {
          path: '../../outside.txt',
          kind: 'modify',
          diff: 'diff',
        },
      ],
    };

    const res = await applier.applyChangeSet(tmpWorkspace, traversalChangeSet);
    expect(res.applied).toBe(false);
    expect(res.errors.length).toBeGreaterThan(0);
    expect(res.errors[0]).toContain("path traversal '..' is not allowed");
  });

  it('7. rejects .git/ paths', async () => {
    const gitChangeSet: ChangeSet = {
      id: 'cs-git-1',
      workspaceRoot: tmpWorkspace,
      createdAt: new Date().toISOString(),
      files: [
        {
          path: '.git/config',
          kind: 'modify',
          diff: 'diff',
        },
      ],
    };

    const res = await applier.applyChangeSet(tmpWorkspace, gitChangeSet);
    expect(res.applied).toBe(false);
    expect(res.errors.length).toBeGreaterThan(0);
    expect(res.errors[0]).toContain("modifying '.git/' paths is forbidden");
  });
});
