import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

export class WorkspaceSnapshot {
  public snapshotId: string;
  public createdAt: number;
  public fileHashes: Record<string, string> = {};

  constructor(
    public repositoryVersion: string,
    private snapshotDir: string = ".agentos/snapshots",
    private workspaceDir: string = ".agentos/patch_test_workspace"
  ) {
    this.snapshotId = `snap_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.createdAt = Date.now();
  }

  public async captureFull(): Promise<void> {
    const snapDir = path.join(this.snapshotDir, this.snapshotId);
    if (!fs.existsSync(snapDir)) {
      fs.mkdirSync(snapDir, { recursive: true });
    }

    if (!fs.existsSync(this.workspaceDir)) return;

    const files = fs.readdirSync(this.workspaceDir);
    for (const file of files) {
      const srcPath = path.join(this.workspaceDir, file);
      if (fs.statSync(srcPath).isFile()) {
        const content = fs.readFileSync(srcPath);
        const hash = crypto.createHash("sha256").update(content).digest("hex");
        this.fileHashes[file] = hash;
        
        const backupPath = path.join(snapDir, file);
        fs.copyFileSync(srcPath, backupPath);
      }
    }
  }

  public async restore(): Promise<void> {
    const snapDir = path.join(this.snapshotDir, this.snapshotId);
    if (!fs.existsSync(snapDir)) return;

    // Delete current files that aren't in snapshot
    if (fs.existsSync(this.workspaceDir)) {
      const currentFiles = fs.readdirSync(this.workspaceDir);
      for (const file of currentFiles) {
        if (!this.fileHashes[file]) {
          fs.unlinkSync(path.join(this.workspaceDir, file));
        }
      }
    } else {
      fs.mkdirSync(this.workspaceDir, { recursive: true });
    }

    // Restore files from snapshot
    const backupFiles = fs.readdirSync(snapDir);
    for (const file of backupFiles) {
      fs.copyFileSync(path.join(snapDir, file), path.join(this.workspaceDir, file));
    }
  }
}
