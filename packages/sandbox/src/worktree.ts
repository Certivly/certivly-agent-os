import { Sandbox, ExecutionResult, FilePatch } from './models';
import { PatchEngine } from './patch';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';

const execAsync = promisify(exec);

export class GitWorktreeSandbox implements Sandbox {
  public readonly id: string;
  private readonly sourceWorkspaceDir: string;
  private readonly sandboxDir: string;
  private readonly branchName: string;

  constructor(id: string, sourceWorkspaceDir: string) {
    this.id = id;
    this.sourceWorkspaceDir = sourceWorkspaceDir;
    this.sandboxDir = path.join(sourceWorkspaceDir, '.agentos', 'sandboxes', id);
    this.branchName = `sandbox-${id}`;
  }

  public async create(): Promise<void> {
    // Ensure the parent directory exists
    await fs.mkdir(path.dirname(this.sandboxDir), { recursive: true });

    // Create a new git worktree with a new branch based on current HEAD
    await execAsync(`git worktree add -b "${this.branchName}" "${this.sandboxDir}"`, {
      cwd: this.sourceWorkspaceDir
    });
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
    return await PatchEngine.generatePatchesFromGit(this.sandboxDir);
  }

  public async destroy(): Promise<void> {
    // Remove the worktree using git
    await execAsync(`git worktree remove --force "${this.sandboxDir}"`, {
      cwd: this.sourceWorkspaceDir
    });

    // Delete the branch created for this sandbox
    await execAsync(`git branch -D "${this.branchName}"`, {
      cwd: this.sourceWorkspaceDir
    });
  }
}
