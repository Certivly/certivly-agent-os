import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as path from 'path';
import * as fs from 'fs';
import { SandboxDiffCollector } from '../src/loop/SandboxDiffCollector';

describe('SandboxDiffCollector (Action 4-06)', () => {
  const baseTmpDir = path.join(__dirname, '.tmp-sandbox-diff-collector');
  let workspaceDir: string;
  let sandboxDir: string;

  beforeEach(() => {
    if (!fs.existsSync(baseTmpDir)) {
      fs.mkdirSync(baseTmpDir, { recursive: true });
    }
    const testId = crypto.randomUUID();
    workspaceDir = path.join(baseTmpDir, `ws-${testId}`);
    sandboxDir = path.join(baseTmpDir, `sb-${testId}`);
    fs.mkdirSync(workspaceDir, { recursive: true });
    fs.mkdirSync(sandboxDir, { recursive: true });
  });

  afterEach(() => {
    try {
      if (fs.existsSync(baseTmpDir)) {
        fs.rmSync(baseTmpDir, { recursive: true, force: true });
      }
    } catch {}
  });

  it('1. Non-empty diff: sandbox has modified file -> returns ChangeSet with 1 file entry and non-empty diff', () => {
    fs.writeFileSync(path.join(workspaceDir, 'hello.txt'), 'hello world\n', 'utf8');
    fs.writeFileSync(path.join(sandboxDir, 'hello.txt'), 'hello modified world\n', 'utf8');

    const result = SandboxDiffCollector.collect({
      workspaceRoot: workspaceDir,
      sandboxRoot: sandboxDir,
      runId: 'run-diff-modified',
    });

    expect(result).not.toBeNull();
    expect(result?.id).toBe('run-diff-modified');
    expect(result?.files).toHaveLength(1);

    const file = result!.files[0];
    expect(file.path).toBe('hello.txt');
    expect(file.kind).toBe('modify');
    expect(file.diff).toContain('hello modified world');
    expect(file.diff.trim().length).toBeGreaterThan(0);
  });

  it('2. Empty diff: sandbox and workspace identical -> returns null', () => {
    fs.writeFileSync(path.join(workspaceDir, 'same.txt'), 'identical content\n', 'utf8');
    fs.writeFileSync(path.join(sandboxDir, 'same.txt'), 'identical content\n', 'utf8');

    const result = SandboxDiffCollector.collect({
      workspaceRoot: workspaceDir,
      sandboxRoot: sandboxDir,
      runId: 'run-diff-empty',
    });

    expect(result).toBeNull();
  });

  it('3. New file detected: file in sandbox but not workspace -> kind create', () => {
    fs.writeFileSync(path.join(sandboxDir, 'created.txt'), 'brand new file content\n', 'utf8');

    const result = SandboxDiffCollector.collect({
      workspaceRoot: workspaceDir,
      sandboxRoot: sandboxDir,
      runId: 'run-diff-create',
    });

    expect(result).not.toBeNull();
    expect(result?.files).toHaveLength(1);

    const file = result!.files[0];
    expect(file.path).toBe('created.txt');
    expect(file.kind).toBe('create');
    expect(file.afterContent).toContain('brand new file content');
    expect(file.diff).toContain('brand new file content');
  });

  it('4. Deleted file detected: file in workspace but not sandbox -> kind delete', () => {
    fs.writeFileSync(path.join(workspaceDir, 'deleted.txt'), 'to be deleted\n', 'utf8');

    const result = SandboxDiffCollector.collect({
      workspaceRoot: workspaceDir,
      sandboxRoot: sandboxDir,
      runId: 'run-diff-delete',
    });

    expect(result).not.toBeNull();
    expect(result?.files).toHaveLength(1);

    const file = result!.files[0];
    expect(file.path).toBe('deleted.txt');
    expect(file.kind).toBe('delete');
    expect(file.diff).toContain('deleted.txt');
  });
});
