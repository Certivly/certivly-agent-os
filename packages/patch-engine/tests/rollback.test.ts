import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as path from 'path';
import * as fs from 'fs';
import {
  ChangeSet,
  ChangeSetApplier,
  PatchRollback,
  computeSha256,
} from '../index';

describe('Action 2.08: Patch Rollback And Approval Apply Path', () => {
  const tmpWorkspace = path.resolve(__dirname, '.tmp-rollback-' + Date.now());
  const applier = new ChangeSetApplier();
  const patchRollback = new PatchRollback();

  beforeEach(() => {
    fs.mkdirSync(tmpWorkspace, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpWorkspace, { recursive: true, force: true });
  });

  it('1. rollback modify restores original content exactly', async () => {
    const fileRel = 'src/counter.ts';
    const fullPath = path.join(tmpWorkspace, fileRel);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    const originalContent = 'export const count = 1;\n';
    fs.writeFileSync(fullPath, originalContent, 'utf8');

    const modifyCs: ChangeSet = {
      id: 'cs-mod-rollback',
      workspaceRoot: tmpWorkspace,
      createdAt: new Date().toISOString(),
      files: [
        {
          path: fileRel,
          kind: 'modify',
          before: computeSha256(originalContent),
          afterContent: 'export const count = 2;\n',
          diff: 'diff text',
        },
      ],
    };

    const applyRes = await applier.applyChangeSet(tmpWorkspace, modifyCs);
    expect(applyRes.applied).toBe(true);
    expect(fs.readFileSync(fullPath, 'utf8')).toBe('export const count = 2;\n');

    // Rollback
    const rolledBack = await applier.rollback(tmpWorkspace, applyRes.backupId!);
    expect(rolledBack).toBe(true);
    expect(fs.readFileSync(fullPath, 'utf8')).toBe(originalContent);
  });

  it('2. rollback add removes newly created file', async () => {
    const fileRel = 'src/feature.ts';
    const fullPath = path.join(tmpWorkspace, fileRel);
    expect(fs.existsSync(fullPath)).toBe(false);

    const addCs: ChangeSet = {
      id: 'cs-add-rollback',
      workspaceRoot: tmpWorkspace,
      createdAt: new Date().toISOString(),
      files: [
        {
          path: fileRel,
          kind: 'add',
          afterContent: 'export const feature = "brand-new";\n',
          diff: 'diff text',
        },
      ],
    };

    const applyRes = await applier.applyChangeSet(tmpWorkspace, addCs);
    expect(applyRes.applied).toBe(true);
    expect(fs.existsSync(fullPath)).toBe(true);

    // Rollback via patchRollback
    const rolledBack = await patchRollback.rollbackChangeSet(tmpWorkspace, applyRes.backupId!);
    expect(rolledBack).toBe(true);
    expect(fs.existsSync(fullPath)).toBe(false);
  });

  it('3. rollback delete restores deleted file with original content', async () => {
    const fileRel = 'src/legacy.ts';
    const fullPath = path.join(tmpWorkspace, fileRel);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    const originalContent = 'export function legacyFunction() { return 42; }\n';
    fs.writeFileSync(fullPath, originalContent, 'utf8');

    const delCs: ChangeSet = {
      id: 'cs-del-rollback',
      workspaceRoot: tmpWorkspace,
      createdAt: new Date().toISOString(),
      files: [
        {
          path: fileRel,
          kind: 'delete',
          before: computeSha256(originalContent),
          diff: 'diff text',
        },
      ],
    };

    const applyRes = await applier.applyChangeSet(tmpWorkspace, delCs);
    expect(applyRes.applied).toBe(true);
    expect(fs.existsSync(fullPath)).toBe(false);

    // Rollback
    const rolledBack = await applier.rollback(tmpWorkspace, applyRes.backupId!);
    expect(rolledBack).toBe(true);
    expect(fs.existsSync(fullPath)).toBe(true);
    expect(fs.readFileSync(fullPath, 'utf8')).toBe(originalContent);
  });

  it('4. rollback twice succeeds idempotently', async () => {
    const fileRel = 'src/config.json';
    const fullPath = path.join(tmpWorkspace, fileRel);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    const originalContent = '{"debug": false}\n';
    fs.writeFileSync(fullPath, originalContent, 'utf8');

    const modCs: ChangeSet = {
      id: 'cs-idempotent-rollback',
      workspaceRoot: tmpWorkspace,
      createdAt: new Date().toISOString(),
      files: [
        {
          path: fileRel,
          kind: 'modify',
          before: computeSha256(originalContent),
          afterContent: '{"debug": true}\n',
          diff: 'diff text',
        },
      ],
    };

    const applyRes = await applier.applyChangeSet(tmpWorkspace, modCs);
    expect(applyRes.applied).toBe(true);

    // First rollback
    const r1 = await applier.rollback(tmpWorkspace, applyRes.backupId!);
    expect(r1).toBe(true);
    expect(fs.readFileSync(fullPath, 'utf8')).toBe(originalContent);

    // Second rollback (idempotent)
    const r2 = await applier.rollback(tmpWorkspace, applyRes.backupId!);
    expect(r2).toBe(true);
    expect(fs.readFileSync(fullPath, 'utf8')).toBe(originalContent);
  });

  it('5. failed apply on third file leaves workspace byte-identical', async () => {
    const f1Path = path.join(tmpWorkspace, 'src', 'file1.ts');
    const f2Path = path.join(tmpWorkspace, 'src', 'file2.ts');
    fs.mkdirSync(path.join(tmpWorkspace, 'src'), { recursive: true });

    const c1 = 'content one\n';
    const c2 = 'content two\n';
    fs.writeFileSync(f1Path, c1, 'utf8');
    fs.writeFileSync(f2Path, c2, 'utf8');

    const hash1 = computeSha256(c1);
    const hash2 = computeSha256(c2);

    // ChangeSet: file 1 (modify valid), file 2 (delete valid), file 3 (modify with conflict)
    const multiCs: ChangeSet = {
      id: 'cs-atomic-fail-all',
      workspaceRoot: tmpWorkspace,
      createdAt: new Date().toISOString(),
      files: [
        {
          path: 'src/file1.ts',
          kind: 'modify',
          before: hash1,
          afterContent: 'updated one\n',
          diff: 'diff 1',
        },
        {
          path: 'src/file2.ts',
          kind: 'delete',
          before: hash2,
          diff: 'diff 2',
        },
        {
          path: 'src/file3.ts', // Does not exist, will cause conflict!
          kind: 'modify',
          before: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          afterContent: 'updated three\n',
          diff: 'diff 3',
        },
      ],
    };

    const res = await applier.applyChangeSet(tmpWorkspace, multiCs);
    expect(res.applied).toBe(false);
    expect(res.conflicts.length).toBe(1);

    // Verify workspace is completely byte-identical
    expect(fs.readFileSync(f1Path, 'utf8')).toBe(c1);
    expect(fs.readFileSync(f2Path, 'utf8')).toBe(c2);
    expect(fs.existsSync(path.join(tmpWorkspace, 'src', 'file3.ts'))).toBe(false);
  });

  it('6. backup manifest includes all files with kind, originalPath, and backupPath', async () => {
    const f1Rel = 'src/a.ts';
    const f2Rel = 'src/b.ts';
    const f1Path = path.join(tmpWorkspace, f1Rel);
    const f2Path = path.join(tmpWorkspace, f2Rel);
    fs.mkdirSync(path.join(tmpWorkspace, 'src'), { recursive: true });

    fs.writeFileSync(f1Path, 'alpha\n', 'utf8');
    fs.writeFileSync(f2Path, 'beta\n', 'utf8');

    const cs: ChangeSet = {
      id: 'cs-manifest-check',
      workspaceRoot: tmpWorkspace,
      createdAt: new Date().toISOString(),
      files: [
        {
          path: f1Rel,
          kind: 'modify',
          before: computeSha256('alpha\n'),
          afterContent: 'alpha updated\n',
          diff: 'diff',
        },
        {
          path: f2Rel,
          kind: 'delete',
          before: computeSha256('beta\n'),
          diff: 'diff',
        },
        {
          path: 'src/c.ts',
          kind: 'add',
          afterContent: 'gamma\n',
          diff: 'diff',
        },
      ],
    };

    const res = await applier.applyChangeSet(tmpWorkspace, cs);
    expect(res.applied).toBe(true);

    const manifestPath = path.join(tmpWorkspace, '.agentos', 'backups', res.backupId!, 'manifest.json');
    expect(fs.existsSync(manifestPath)).toBe(true);

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    expect(manifest.backupId).toBe(res.backupId);
    expect(manifest.workspaceRoot).toBe(tmpWorkspace);
    expect(manifest.timestamp).toBeDefined();
    expect(manifest.files).toHaveLength(3);

    const f1Record = manifest.files.find((f: any) => f.originalPath === f1Rel);
    expect(f1Record).toBeDefined();
    expect(f1Record.kind).toBe('modify');
    expect(f1Record.backupPath).toContain('files/src/a.ts');

    const f2Record = manifest.files.find((f: any) => f.originalPath === f2Rel);
    expect(f2Record).toBeDefined();
    expect(f2Record.kind).toBe('delete');

    const f3Record = manifest.files.find((f: any) => f.originalPath === 'src/c.ts');
    expect(f3Record).toBeDefined();
    expect(f3Record.kind).toBe('add');
  });
});
