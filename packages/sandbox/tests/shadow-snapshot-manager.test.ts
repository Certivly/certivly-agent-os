import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ShadowSnapshotManager } from '../src/snapshot/ShadowSnapshotManager';

describe('ShadowSnapshotManager (OpenCode Content-Addressed Snapshots & Rollback)', () => {
  let tmpRoot: string;
  let workspaceDir: string;
  let shadowStoreDir: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), `test-shadow-${Date.now()}-${Math.random().toString(36).slice(2, 6)}-`));
    workspaceDir = path.join(tmpRoot, 'workspace');
    shadowStoreDir = path.join(tmpRoot, 'shadow-store');
    fs.mkdirSync(workspaceDir, { recursive: true });
    fs.mkdirSync(shadowStoreDir, { recursive: true });
  });

  afterEach(() => {
    if (tmpRoot && fs.existsSync(tmpRoot)) {
      try {
        fs.rmSync(tmpRoot, { recursive: true, force: true });
      } catch (_e) {}
    }
  });

  it('1. captures initial snapshot and lists it in snapshot history', async () => {
    fs.writeFileSync(path.join(workspaceDir, 'file1.txt'), 'Initial file 1', 'utf8');
    fs.writeFileSync(path.join(workspaceDir, 'file2.txt'), 'Initial file 2', 'utf8');

    const manager = new ShadowSnapshotManager(workspaceDir, shadowStoreDir);
    const snap1 = await manager.capture('Initial turn 1');

    expect(snap1).toBeDefined();
    expect(snap1.length).toBe(40); // 40-char SHA-1 hash

    const list = await manager.listSnapshots();
    expect(list.length).toBe(1);
    expect(list[0].id).toBe(snap1);
    expect(list[0].message).toBe('Initial turn 1');
  });

  it('2. diffs two snapshots and detects added, modified, and deleted files', async () => {
    const f1 = path.join(workspaceDir, 'calc.ts');
    fs.writeFileSync(f1, 'export function add(a, b) { return a + b; }', 'utf8');

    const manager = new ShadowSnapshotManager(workspaceDir, shadowStoreDir);
    const snap1 = await manager.capture('Turn 1: Baseline');

    // Make edits: modify calc.ts, add utils.ts
    fs.writeFileSync(f1, 'export function add(a, b) { return a + b + 1; }', 'utf8');
    const f2 = path.join(workspaceDir, 'utils.ts');
    fs.writeFileSync(f2, 'export const PI = 3.14;', 'utf8');

    const snap2 = await manager.capture('Turn 2: Added bugs and utils');

    const diff = await manager.diff(snap1, snap2);
    expect(diff.items.length).toBe(2);

    const calcDiff = diff.items.find(i => i.path === 'calc.ts');
    const utilsDiff = diff.items.find(i => i.path === 'utils.ts');

    expect(calcDiff).toBeDefined();
    expect(calcDiff!.kind).toBe('modified');

    expect(utilsDiff).toBeDefined();
    expect(utilsDiff!.kind).toBe('added');
  });

  it('3. surgically rolls back a specific file without altering other modified files', async () => {
    const f1 = path.join(workspaceDir, 'target.ts');
    const f2 = path.join(workspaceDir, 'user-work.ts');

    fs.writeFileSync(f1, 'Original Target', 'utf8');
    fs.writeFileSync(f2, 'Original User Work', 'utf8');

    const manager = new ShadowSnapshotManager(workspaceDir, shadowStoreDir);
    const snap1 = await manager.capture('Turn 1: Saved');

    // Both files modified
    fs.writeFileSync(f1, 'Broken Target Modified By Agent', 'utf8');
    fs.writeFileSync(f2, 'User Continues Editing Their Work', 'utf8');

    // Rollback ONLY target.ts to snap1
    const rollbackRes = await manager.rollback(snap1, ['target.ts']);
    expect(rollbackRes.revertedFiles).toContain('target.ts');

    // target.ts must be restored to Original Target
    expect(fs.readFileSync(f1, 'utf8')).toBe('Original Target');

    // user-work.ts must NOT be touched and must preserve the user edits!
    expect(fs.readFileSync(f2, 'utf8')).toBe('User Continues Editing Their Work');
  });
});
