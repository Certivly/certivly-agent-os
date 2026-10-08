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

describe('Action 2.10: Sandbox Diff, Exec, And Cleanup', () => {
  const tmpRepo = path.resolve(__dirname, '.tmp-diff-exec-cleanup-' + Date.now());

  beforeEach(async () => {
    await fs.mkdir(tmpRepo, { recursive: true });
    await execFileAsync('git', ['init'], { cwd: tmpRepo });
    await execFileAsync('git', ['config', 'user.email', 'test@example.com'], { cwd: tmpRepo });
    await execFileAsync('git', ['config', 'user.name', 'Test User'], { cwd: tmpRepo });

    await fs.writeFile(path.join(tmpRepo, 'tracked.txt'), 'line 1\nline 2\n');
    await execFileAsync('git', ['add', 'tracked.txt'], { cwd: tmpRepo });
    await execFileAsync('git', ['commit', '-m', 'Initial commit'], { cwd: tmpRepo });
  });

  afterEach(async () => {
    try {
      await fs.rm(tmpRepo, { recursive: true, force: true });
    } catch {}
  });

  it('1. diff includes modified tracked file', async () => {
    const sandbox = new GitWorktreeSandbox('test-diff-mod', tmpRepo);
    await sandbox.create();
    try {
      await sandbox.writeFile('tracked.txt', 'line 1\nline 2 modified\n');
      const diff = await sandbox.getDiff();

      expect(diff).toContain('diff --git');
      expect(diff).toContain('a/tracked.txt');
      expect(diff).toContain('b/tracked.txt');
      expect(diff).toContain('-line 2');
      expect(diff).toContain('+line 2 modified');
    } finally {
      await sandbox.destroy();
    }
  });

  it('2. diff includes untracked file', async () => {
    const sandbox = new GitWorktreeSandbox('test-diff-untracked', tmpRepo);
    await sandbox.create();
    try {
      await sandbox.writeFile('new-file.txt', 'hello from untracked file\n');
      const diff = await sandbox.getDiff();

      expect(diff).toContain('new-file.txt');
      expect(diff).toContain('+hello from untracked file');
    } finally {
      await sandbox.destroy();
    }
  });

  it('3. binary diff does not crash', async () => {
    const sandbox = new GitWorktreeSandbox('test-diff-binary', tmpRepo);
    await sandbox.create();
    try {
      const binaryData = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x02, 0xff]);
      const binPath = path.join(sandbox.getSandboxDir(), 'image.png');
      await fs.writeFile(binPath, binaryData);

      const diff = await sandbox.getDiff();
      expect(typeof diff).toBe('string');
      expect(diff).toContain('image.png');
    } finally {
      await sandbox.destroy();
    }
  });

  it('4. timeout returns timeout result and kills process', async () => {
    const sandbox = new GitWorktreeSandbox('test-exec-timeout', tmpRepo);
    await sandbox.create();
    try {
      const start = Date.now();
      const res = await sandbox.execute('node -e "setTimeout(() => {}, 10000)"', {
        timeoutMs: 500,
      });
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(3500);
      expect(res.exitCode).toBe(124);
      expect(res.timedOut).toBe(true);
    } finally {
      await sandbox.destroy();
    }
  });

  it('5. secret env vars are stripped from execution', async () => {
    const sandbox = new GitWorktreeSandbox('test-exec-env', tmpRepo);
    await sandbox.create();

    const origApiKey = process.env.ANTHROPIC_API_KEY;
    const origToken = process.env.GITHUB_TOKEN;
    const origSecret = process.env.CLIENT_SECRET;
    const origPass = process.env.DB_PASSWORD;
    const origPublic = process.env.APP_PUBLIC_NAME;

    process.env.ANTHROPIC_API_KEY = 'super_secret_key';
    process.env.GITHUB_TOKEN = 'super_secret_token';
    process.env.CLIENT_SECRET = 'super_secret_secret';
    process.env.DB_PASSWORD = 'super_secret_password';
    process.env.APP_PUBLIC_NAME = 'visible_public_app';

    try {
      const res = await sandbox.execute(
        'node -e "console.log(JSON.stringify({ key: process.env.ANTHROPIC_API_KEY, tok: process.env.GITHUB_TOKEN, sec: process.env.CLIENT_SECRET, pwd: process.env.DB_PASSWORD, pub: process.env.APP_PUBLIC_NAME }))"'
      );

      expect(res.exitCode).toBe(0);
      const parsed = JSON.parse(res.stdout.trim());
      expect(parsed.key).toBeUndefined();
      expect(parsed.tok).toBeUndefined();
      expect(parsed.sec).toBeUndefined();
      expect(parsed.pwd).toBeUndefined();
      expect(parsed.pub).toBe('visible_public_app');
    } finally {
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.GITHUB_TOKEN;
      delete process.env.CLIENT_SECRET;
      delete process.env.DB_PASSWORD;
      delete process.env.APP_PUBLIC_NAME;
      if (origApiKey) process.env.ANTHROPIC_API_KEY = origApiKey;
      if (origToken) process.env.GITHUB_TOKEN = origToken;
      if (origSecret) process.env.CLIENT_SECRET = origSecret;
      if (origPass) process.env.DB_PASSWORD = origPass;
      if (origPublic) process.env.APP_PUBLIC_NAME = origPublic;

      await sandbox.destroy();
    }
  });

  it('6. withSandbox cleanup runs after callback throws', async () => {
    const eventStore = new EventStore(path.join(tmpRepo, 'events.db'));
    const manager = new SandboxManager(eventStore, tmpRepo);

    let recordedDir: string | undefined;

    expect(
      manager.withSandbox(async (sb) => {
        recordedDir = (sb as GitWorktreeSandbox).getSandboxDir();
        expect(fsSync.existsSync(recordedDir)).toBe(true);
        throw new Error('Planned error during sandbox work');
      })
    ).rejects.toThrow('Planned error during sandbox work');

    // Wait a brief moment and verify cleanup
    expect(recordedDir).toBeDefined();
    expect(fsSync.existsSync(recordedDir!)).toBe(false);
  });

  it('7. no worktree or branch remains after destroy', async () => {
    const sandboxId = 'test-cleanup-complete';
    const sandbox = new GitWorktreeSandbox(sandboxId, tmpRepo);
    await sandbox.create();

    const sandboxDir = sandbox.getSandboxDir();
    expect(fsSync.existsSync(sandboxDir)).toBe(true);

    const { stdout: branchesBefore } = await execFileAsync('git', ['branch'], { cwd: tmpRepo });
    expect(branchesBefore).toContain(`sandbox-${sandboxId}`);

    await sandbox.destroy();

    expect(fsSync.existsSync(sandboxDir)).toBe(false);

    const { stdout: branchesAfter } = await execFileAsync('git', ['branch'], { cwd: tmpRepo });
    expect(branchesAfter).not.toContain(`sandbox-${sandboxId}`);
  });
});
