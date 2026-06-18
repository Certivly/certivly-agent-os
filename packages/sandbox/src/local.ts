import { Sandbox, ExecutionResult, ExecutionOptions, FilePatch, WorkspaceSnapshot } from './models';
import { PatchEngine } from './PatchEngine';
import { WorkspaceSnapshotBuilder } from './WorkspaceSnapshot';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';

const execAsync = promisify(exec);

export class LocalWorkspaceSandbox implements Sandbox {
  public readonly id: string;
  private readonly sourceWorkspaceDir: string;
  private readonly sandboxDir: string;
  private initialSnapshot?: WorkspaceSnapshot;

  constructor(id: string, sourceWorkspaceDir: string) {
    this.id = id;
    this.sourceWorkspaceDir = sourceWorkspaceDir;
    this.sandboxDir = path.join(sourceWorkspaceDir, '.agentos', 'sandboxes', id);
  }

  public async create(): Promise<void> {
    await fs.mkdir(this.sandboxDir, { recursive: true });

    const entries = await fs.readdir(this.sourceWorkspaceDir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === '.agentos') {
        continue;
      }
      
      const sourcePath = path.join(this.sourceWorkspaceDir, entry.name);
      const destPath = path.join(this.sandboxDir, entry.name);
      
      await fs.cp(sourcePath, destPath, { recursive: true });
    }

    this.initialSnapshot = await WorkspaceSnapshotBuilder.capture(this.sandboxDir);
  }

  public async execute(command: string, options?: ExecutionOptions): Promise<ExecutionResult> {
    try {
      const cwd = options?.cwd ? path.join(this.sandboxDir, options.cwd) : this.sandboxDir;
      const env = { ...process.env, ...options?.env };
      const { stdout, stderr } = await execAsync(command, { cwd, env, timeout: options?.timeoutMs });
      return { stdout, stderr, exitCode: 0 };
    } catch (error: any) {
      return {
        stdout: error.stdout || '',
        stderr: error.stderr || error.message || '',
        exitCode: error.code || 1
      };
    }
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

