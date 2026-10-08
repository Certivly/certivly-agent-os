import { Sandbox, ExecutionResult, ExecutionOptions, FilePatch, WorkspaceSnapshot } from './models';
import { PatchEngine } from './PatchEngine';
import { WorkspaceSnapshotBuilder } from './WorkspaceSnapshot';
import { executeInDir } from './exec-helper';
import { SKIP_DIRS } from './worktree';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';

export class LocalWorkspaceSandbox implements Sandbox {
  public readonly id: string;
  private readonly sourceWorkspaceDir: string;
  private readonly sandboxDir: string;
  private initialSnapshot?: WorkspaceSnapshot;

  constructor(id: string, sourceWorkspaceDir: string) {
    this.id = id;
    this.sourceWorkspaceDir = path.resolve(sourceWorkspaceDir);
    this.sandboxDir = path.join(this.sourceWorkspaceDir, '.agentos', 'sandboxes', id);
  }

  public getSandboxDir(): string {
    return this.sandboxDir;
  }

  public async create(): Promise<void> {
    await fs.mkdir(this.sandboxDir, { recursive: true });

    // Copy non-ignored files
    await this.copyWorkspaceFiles(this.sourceWorkspaceDir, this.sandboxDir);

    // Link node_modules if present in source
    const srcNodeModules = path.join(this.sourceWorkspaceDir, 'node_modules');
    const destNodeModules = path.join(this.sandboxDir, 'node_modules');
    if (fsSync.existsSync(srcNodeModules) && !fsSync.existsSync(destNodeModules)) {
      try {
        if (process.platform === 'win32') {
          await fs.symlink(srcNodeModules, destNodeModules, 'junction');
        } else {
          await fs.symlink(srcNodeModules, destNodeModules, 'dir');
        }
      } catch (_err) {
        // best-effort: node_modules symlink/junction creation may fail due to filesystem permissions
      }
    }

    this.initialSnapshot = await WorkspaceSnapshotBuilder.capture(this.sandboxDir);
  }

  private async copyWorkspaceFiles(srcDir: string, destDir: string): Promise<void> {
    const entries = await fs.readdir(srcDir, { withFileTypes: true });

    for (const entry of entries) {
      if (SKIP_DIRS.includes(entry.name)) {
        continue;
      }

      const srcPath = path.join(srcDir, entry.name);
      const destPath = path.join(destDir, entry.name);

      if (entry.isDirectory()) {
        await fs.mkdir(destPath, { recursive: true });
        await this.copyWorkspaceFiles(srcPath, destPath);
      } else if (entry.isFile()) {
        await fs.mkdir(path.dirname(destPath), { recursive: true });
        await fs.copyFile(srcPath, destPath);
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
    const patches = await this.generatePatch();
    return patches.map(p => p.diff).join('\n');
  }

  public async generatePatch(): Promise<FilePatch[]> {
    if (!this.initialSnapshot) throw new Error('Sandbox not created');
    const finalSnapshot = await WorkspaceSnapshotBuilder.capture(this.sandboxDir);
    const engine = new PatchEngine(this.sourceWorkspaceDir, this.sandboxDir);
    return engine.generatePatch(this.initialSnapshot, finalSnapshot);
  }

  public async destroy(): Promise<void> {
    await fs.rm(this.sandboxDir, { recursive: true, force: true });
  }
}
