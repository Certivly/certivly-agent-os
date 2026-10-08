import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { GitWorktreeSandbox } from '../src/worktree';
import { SandboxManager } from '../src/SandboxManager';
import { EventStore } from '@agent-os/events';

const execFileAsync = promisify(execFile);

describe('Action 2.09: Sandbox Worktree Fidelity', () => {
  const tmpRepo = path.resolve(__dirname, '.tmp-worktree-fidelity-' + Date.now());
  const tmpNonGit = path.resolve(__dirname, '.tmp-nongit-' + Date.now());

  beforeEach(async () => {
    // 1. Setup git repo
    await fs.mkdir(tmpRepo, { recursive: true });
    await execFileAsync('git', ['init'], { cwd: tmpRepo });
    await execFileAsync('git', ['config', 'user.email', 'test@example.com'], { cwd: tmpRepo });
    await execFileAsync('git', ['config', 'user.name', 'Test User'], { cwd: tmpRepo });

    // Committed file
    await fs.writeFile(path.join(tmpRepo, 'committed.txt'), 'committed content v1');
    // .gitignore
    await fs.writeFile(path.join(tmpRepo, '.gitignore'), 'ignored.secret\n*.log\nnode_modules\n');
    await execFileAsync('git', ['add', 'committed.txt', '.gitignore'], { cwd: tmpRepo });
    await execFileAsync('git', ['commit', '-m', 'Initial commit'], { cwd: tmpRepo });

    // Tracked uncommitted edit
    await fs.writeFile(path.join(tmpRepo, 'committed.txt'), 'committed content v2 (uncommitted edit)');

    // Untracked non-ignored file
    await fs.writeFile(path.join(tmpRepo, 'untracked.txt'), 'untracked content');

    // Ignored file
    await fs.writeFile(path.join(tmpRepo, 'ignored.secret'), 'super-secret-token');
    await fs.writeFile(path.join(tmpRepo, 'debug.log'), 'log output');

    // Dummy node_modules dir
    const nmDir = path.join(tmpRepo, 'node_modules', 'dummy-pkg');
    await fs.mkdir(nmDir, { recursive: true });
    await fs.writeFile(path.join(nmDir, 'index.js'), 'module.exports = {};');

    // 2. Setup non-git directory
    await fs.mkdir(tmpNonGit, { recursive: true });
    await fs.writeFile(path.join(tmpNonGit, 'plain.txt'), 'plain file in non-git directory');
  });

  afterEach(async () => {
    try {
      await fs.rm(tmpRepo, { recursive: true, force: true });
      await fs.rm(tmpNonGit, { recursive: true, force: true });
    } catch {}
  });

  it('1. committed file appears in worktree sandbox', async () => {
    const sandbox = new GitWorktreeSandbox('test-committed', tmpRepo);
    await sandbox.create();
    try {
      const exists = await sandbox.readFile('committed.txt');
      expect(exists).toBeDefined();
    } finally {
      await sandbox.destroy();
    }
  });

  it('2. tracked uncommitted edit appears with modified content', async () => {
    const sandbox = new GitWorktreeSandbox('test-uncommitted-edit', tmpRepo);
    await sandbox.create();
    try {
      const content = await sandbox.readFile('committed.txt');
      expect(content).toBe('committed content v2 (uncommitted edit)');
    } finally {
      await sandbox.destroy();
    }
  });

  it('3. untracked non-ignored file appears in sandbox', async () => {
    const sandbox = new GitWorktreeSandbox('test-untracked', tmpRepo);
    await sandbox.create();
    try {
      const content = await sandbox.readFile('untracked.txt');
      expect(content).toBe('untracked content');
    } finally {
      await sandbox.destroy();
    }
  });

  it('4. ignored file does not appear in sandbox', async () => {
    const sandbox = new GitWorktreeSandbox('test-ignored', tmpRepo);
    await sandbox.create();
    try {
      expect(sandbox.readFile('ignored.secret')).rejects.toThrow();
      expect(sandbox.readFile('debug.log')).rejects.toThrow();
    } finally {
      await sandbox.destroy();
    }
  });

  it('5. node_modules link exists when source has it', async () => {
    const sandbox = new GitWorktreeSandbox('test-nm-link', tmpRepo);
    await sandbox.create();
    try {
      const pkgContent = await sandbox.readFile('node_modules/dummy-pkg/index.js');
      expect(pkgContent).toBe('module.exports = {};');
    } finally {
      await sandbox.destroy();
    }
  });

  it('6. non-git directory falls back to copy strategy gracefully', async () => {
    const eventStore = new EventStore(path.join(tmpNonGit, 'events.db'));
    const manager = new SandboxManager(eventStore, tmpNonGit);

    // Create sandbox with default worktree strategy targeting non-git repo
    const sandbox = await manager.createSandbox('worktree');
    try {
      const content = await sandbox.readFile('plain.txt');
      expect(content).toBe('plain file in non-git directory');
    } finally {
      await manager.destroySandbox(sandbox.id);
    }
  });
});
