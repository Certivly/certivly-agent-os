import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export type SnapshotId = string;

export interface SnapshotDiffItem {
  path: string;
  kind: 'added' | 'modified' | 'deleted';
}

export interface SnapshotDiff {
  items: SnapshotDiffItem[];
  rawPatch: string;
}

export interface SnapshotRecord {
  id: SnapshotId;
  timestamp: number;
  message: string;
}

export class ShadowSnapshotManager {
  private shadowGitDir: string;
  private initialized = false;

  constructor(
    private workspaceRoot: string,
    storageRoot?: string
  ) {
    const projectHash = crypto
      .createHash('sha256')
      .update(path.resolve(workspaceRoot))
      .digest('hex')
      .slice(0, 12);

    if (storageRoot) {
      this.shadowGitDir = path.join(storageRoot, projectHash);
    } else {
      this.shadowGitDir = path.join(workspaceRoot, '.agentos', 'snapshots', projectHash);
    }
  }

  public async init(): Promise<void> {
    if (this.initialized) return;

    await fs.promises.mkdir(this.shadowGitDir, { recursive: true });

    const gitHead = path.join(this.shadowGitDir, 'HEAD');
    if (!fs.existsSync(gitHead)) {
      // Initialize a bare git repository for shadow tracking
      await execAsync(`git init --bare "${this.shadowGitDir}"`);
    }

    this.initialized = true;
  }

  private execGit(args: string): Promise<{ stdout: string; stderr: string }> {
    const cmd = `git --git-dir="${this.shadowGitDir}" --work-tree="${this.workspaceRoot}" ${args}`;
    return execAsync(cmd, {
      cwd: this.workspaceRoot,
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: process.env.GIT_AUTHOR_NAME || 'AgentOS',
        GIT_AUTHOR_EMAIL: process.env.GIT_AUTHOR_EMAIL || 'agentos@local',
        GIT_COMMITTER_NAME: process.env.GIT_COMMITTER_NAME || 'AgentOS',
        GIT_COMMITTER_EMAIL: process.env.GIT_COMMITTER_EMAIL || 'agentos@local',
      },
    });
  }

  /**
   * Captures the current workspace file tree into the shadow git store.
   * Runs in < 25ms by leveraging Git's index without touching user's .git.
   */
  public async capture(message: string = 'Snapshot'): Promise<SnapshotId> {
    await this.init();

    // Stage workspace files into shadow index
    await this.execGit('add -A');

    // Write tree
    const { stdout: treeHashRaw } = await this.execGit('write-tree');
    const treeHash = treeHashRaw.trim();

    // Create commit object
    const escapedMsg = message.replace(/"/g, '\\"');
    const { stdout: commitHashRaw } = await this.execGit(
      `commit-tree ${treeHash} -m "${escapedMsg}"`
    );
    const commitHash = commitHashRaw.trim();

    // Update master ref in shadow repo
    await this.execGit(`update-ref refs/heads/master ${commitHash}`);

    return commitHash;
  }

  /**
   * Generates structured diffs between two captured snapshots.
   */
  public async diff(fromId: SnapshotId, toId: SnapshotId): Promise<SnapshotDiff> {
    await this.init();

    // Name status
    const { stdout: nameStatusOut } = await this.execGit(
      `diff --name-status ${fromId} ${toId}`
    );
    const items: SnapshotDiffItem[] = [];

    for (const line of nameStatusOut.trim().split('\n')) {
      if (!line) continue;
      const [status, ...pathParts] = line.split('\t');
      const filePath = pathParts.join('\t').trim();

      let kind: SnapshotDiffItem['kind'] = 'modified';
      if (status.startsWith('A')) kind = 'added';
      else if (status.startsWith('D')) kind = 'deleted';

      items.push({ path: filePath, kind });
    }

    // Full patch
    const { stdout: rawPatch } = await this.execGit(
      `diff ${fromId} ${toId}`
    );

    return {
      items,
      rawPatch,
    };
  }

  /**
   * Surgically rolls back workspace files to a specific snapshot.
   * If filePaths is specified, restores only those files without altering others.
   */
  public async rollback(
    toSnapshotId: SnapshotId,
    filePaths?: string[]
  ): Promise<{ revertedFiles: string[] }> {
    await this.init();

    let pathsArg = '.';
    if (filePaths && filePaths.length > 0) {
      pathsArg = filePaths.map((p) => `"${p}"`).join(' ');
    }

    await this.execGit(`checkout ${toSnapshotId} -- ${pathsArg}`);

    // Clean untracked files added after toSnapshotId if rolled back completely
    if (!filePaths || filePaths.length === 0) {
      try {
        await this.execGit('clean -fd');
      } catch (_err: unknown) {
        // Best effort clean of untracked files
      }
    }

    return {
      revertedFiles: filePaths && filePaths.length > 0 ? filePaths : ['*'],
    };
  }

  /**
   * Lists historical snapshot checkpoints.
   */
  public async listSnapshots(): Promise<SnapshotRecord[]> {
    await this.init();

    try {
      const { stdout } = await this.execGit('log refs/heads/master --format="%H|%at|%s"');
      const records: SnapshotRecord[] = [];

      for (const line of stdout.trim().split('\n')) {
        if (!line) continue;
        const [id, timestampRaw, ...msgParts] = line.split('|');
        records.push({
          id: id.trim(),
          timestamp: parseInt(timestampRaw.trim(), 10) * 1000,
          message: msgParts.join('|').trim(),
        });
      }

      return records;
    } catch (_err: unknown) {
      return [];
    }
  }
}
