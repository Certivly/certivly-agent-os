import { Sandbox, ExecutionResult, ExecutionOptions, FilePatch, WorkspaceSnapshot } from './models';
import { PatchEngine } from './PatchEngine';
import { WorkspaceSnapshotBuilder } from './WorkspaceSnapshot';
import { execFileAsync, executeInDir } from './exec-helper';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';

export const SKIP_DIRS = ['.git', 'node_modules', '.agentos', 'dist', 'build', '.idea'];

export async function isGitRepository(dir: string): Promise<boolean> {
  try {
    const gitDir = path.join(dir, '.git');
    if (fsSync.existsSync(gitDir)) {
      return true;
    }
    const { stdout } = await execFileAsync('git', ['rev-parse', '--show-toplevel'], { cwd: dir });
    return path.resolve(stdout.trim()) === path.resolve(dir);
  } catch {
    return false;
  }
}

export class GitWorktreeSandbox implements Sandbox {
  public readonly id: string;
  private readonly sourceWorkspaceDir: string;
  private readonly sandboxDir: string;
  private readonly branchName: string;
  private initialSnapshot?: WorkspaceSnapshot;

  constructor(id: string, sourceWorkspaceDir: string) {
    this.id = id;
    this.sourceWorkspaceDir = path.resolve(sourceWorkspaceDir);
    this.sandboxDir = path.join(this.sourceWorkspaceDir, '.agentos', 'sandboxes', id);
    this.branchName = `sandbox-${id}`;
  }

  public getSandboxDir(): string {
    return this.sandboxDir;
  }

  public async create(): Promise<void> {
    await fs.mkdir(path.dirname(this.sandboxDir), { recursive: true });

    // 1. Create worktree from HEAD
    // If branch already exists, remove it first
    try {
      await execFileAsync('git', ['branch', '-D', this.branchName], { cwd: this.sourceWorkspaceDir });
    } catch (_err) {
      // best-effort: branch may not exist yet
    }

    await execFileAsync('git', ['worktree', 'add', '-b', this.branchName, this.sandboxDir, 'HEAD'], {
      cwd: this.sourceWorkspaceDir,
    });

    // 2. Synchronize working tree edits (both uncommitted tracked edits and untracked files)
    await this.syncWorkingTreeState();

    // 3. Link node_modules if present in source
    await this.linkNodeModules();

    this.initialSnapshot = await WorkspaceSnapshotBuilder.capture(this.sandboxDir);
  }

  private async syncWorkingTreeState(): Promise<void> {
    try {
      const { stdout } = await execFileAsync('git', ['status', '--porcelain=v1', '-u'], {
        cwd: this.sourceWorkspaceDir,
      });

      const lines = stdout.split(/\r?\n/).filter(l => l.trim().length > 0);

      for (const line of lines) {
        const status = line.slice(0, 2);
        let relPath = line.slice(3).trim();
        // Remove surrounding quotes if git printed them
        if (relPath.startsWith('"') && relPath.endsWith('"')) {
          relPath = relPath.slice(1, -1);
        }
        relPath = relPath.replace(/\\/g, '/');

        // Skip ignored directories
        const firstSegment = relPath.split('/')[0];
        if (SKIP_DIRS.includes(firstSegment)) {
          continue;
        }

        const srcPath = path.join(this.sourceWorkspaceDir, relPath);
        const destPath = path.join(this.sandboxDir, relPath);

        if (status.includes('D')) {
          // Tracked file deleted in working tree
          if (fsSync.existsSync(destPath)) {
            await fs.rm(destPath, { force: true, recursive: true });
          }
        } else {
          // Tracked edit or untracked non-ignored file
          if (fsSync.existsSync(srcPath)) {
            const stats = await fs.stat(srcPath);
            if (stats.isFile()) {
              await fs.mkdir(path.dirname(destPath), { recursive: true });
              await fs.copyFile(srcPath, destPath);
            }
          }
        }
      }
    } catch {
      // If git status fails, continue with worktree as created
    }
  }

  private async linkNodeModules(): Promise<void> {
    const srcNodeModules = path.join(this.sourceWorkspaceDir, 'node_modules');
    const destNodeModules = path.join(this.sandboxDir, 'node_modules');

    if (fsSync.existsSync(srcNodeModules) && !fsSync.existsSync(destNodeModules)) {
      try {
        if (process.platform === 'win32') {
          await fs.symlink(srcNodeModules, destNodeModules, 'junction');
        } else {
          await fs.symlink(srcNodeModules, destNodeModules, 'dir');
        }
      } catch {
        // Symlinking node_modules is best-effort
      }
    }
  }

  public async execute(command: string, options?: ExecutionOptions): Promise<ExecutionResult> {
    return executeInDir(command, this.sandboxDir, options);
  }

  public async readFile(filePath: string): Promise<string> {
    const fullPath = path.join(this.sandboxDir, filePath);
    return await fs.readFile(fullPath, 'utf-8');
  }

  public async writeFile(filePath: string, content: string): Promise<void> {
    const fullPath = path.join(this.sandboxDir, filePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, 'utf-8');
  }

  public async listFiles(dirPath: string = ''): Promise<string[]> {
    const fullPath = path.join(this.sandboxDir, dirPath);
    try {
      const entries = await fs.readdir(fullPath);
      return entries;
    } catch {
      return [];
    }
  }

  public async deleteFile(filePath: string): Promise<void> {
    const fullPath = path.join(this.sandboxDir, filePath);
    await fs.rm(fullPath, { force: true, recursive: true });
  }

  public async getDiff(): Promise<string> {
    try {
      // Mark all untracked files as intent-to-add so git diff includes them
      try {
        await execFileAsync('git', ['add', '-A', '--intent-to-add'], { cwd: this.sandboxDir });
      } catch (_err) {
        // best-effort: ignore if staging untracked files fails
      }

      const { stdout } = await execFileAsync('git', ['diff', '--binary'], {
        cwd: this.sandboxDir,
      });
      return stdout;
    } catch (e: any) {
      return e.stdout || '';
    }
  }

  public async generatePatch(): Promise<FilePatch[]> {
    if (!this.initialSnapshot) throw new Error('Sandbox not created');
    const finalSnapshot = await WorkspaceSnapshotBuilder.capture(this.sandboxDir);
    const engine = new PatchEngine(this.sourceWorkspaceDir, this.sandboxDir);
    return engine.generatePatch(this.initialSnapshot, finalSnapshot);
  }

  public async destroy(): Promise<void> {
    // 1. Remove worktree
    try {
      await execFileAsync('git', ['worktree', 'remove', '--force', this.sandboxDir], {
        cwd: this.sourceWorkspaceDir,
      });
    } catch {
      // If git worktree remove fails, remove directory manually
      try {
        await fs.rm(this.sandboxDir, { recursive: true, force: true });
      } catch (_rmErr) {
        // best-effort: directory removal fallback
      }
    }

    // 2. Remove sandbox branch even if worktree remove had issues
    try {
      await execFileAsync('git', ['branch', '-D', this.branchName], {
        cwd: this.sourceWorkspaceDir,
      });
    } catch (_branchErr) {
      // best-effort: branch may already be deleted
    }

    // 3. Prune worktrees
    try {
      await execFileAsync('git', ['worktree', 'prune'], { cwd: this.sourceWorkspaceDir });
    } catch (_pruneErr) {
      // best-effort: worktree prune cleanup
    }
  }
}
