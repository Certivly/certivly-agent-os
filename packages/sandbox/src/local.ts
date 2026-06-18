import { Sandbox, ExecutionResult, FilePatch } from './models';
import { PatchEngine } from './patch';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';

const execAsync = promisify(exec);

export class LocalWorkspaceSandbox implements Sandbox {
  public readonly id: string;
  private readonly sourceWorkspaceDir: string;
  private readonly sandboxDir: string;

  constructor(id: string, sourceWorkspaceDir: string) {
    this.id = id;
    this.sourceWorkspaceDir = sourceWorkspaceDir;
    // Store in .agentos/sandboxes/<id>
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
  }

  public async execute(command: string): Promise<ExecutionResult> {
    try {
      const { stdout, stderr } = await execAsync(command, { cwd: this.sandboxDir });
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

  public async generatePatches(): Promise<FilePatch[]> {
    // For local workspace sandbox, we'd have to diff against the source workspace.
    // For simplicity in Phase 8, we can either manually traverse or rely on a known set of modified files.
    // Ideally we should use git worktree sandbox instead of this for actual diffs.
    throw new Error('generatePatches is better supported in GitWorktreeSandbox');
  }

  public async destroy(): Promise<void> {
    await fs.rm(this.sandboxDir, { recursive: true, force: true });
  }
}
