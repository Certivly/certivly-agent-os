import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { WorkspaceSnapshot, SnapshotFile } from './models';

export class WorkspaceSnapshotBuilder {
  /**
   * Captures an immutable snapshot of a given directory.
   * @param dirPath The directory to snapshot (usually the sandbox root).
   * @param excludeDirs Directories to ignore (e.g. node_modules, .git).
   */
  public static async capture(dirPath: string, excludeDirs: string[] = ['node_modules', '.git']): Promise<WorkspaceSnapshot> {
    const files = await this.scanDir(dirPath, dirPath, excludeDirs);
    return {
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      files
    };
  }

  private static async scanDir(rootDir: string, currentDir: string, excludeDirs: string[]): Promise<SnapshotFile[]> {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    let files: SnapshotFile[] = [];

    for (const entry of entries) {
      if (excludeDirs.includes(entry.name)) continue;

      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        const subFiles = await this.scanDir(rootDir, fullPath, excludeDirs);
        files = files.concat(subFiles);
      } else if (entry.isFile()) {
        const relativePath = path.relative(rootDir, fullPath);
        // Normalize path separators to forward slash for consistency
        const normalizedPath = relativePath.split(path.sep).join('/');
        
        try {
          const content = await fs.readFile(fullPath);
          const sha256 = crypto.createHash('sha256').update(content).digest('hex');
          files.push({
            path: normalizedPath,
            sha256
          });
        } catch (error) {
          // Skip files that can't be read (e.g. permission issues or locks)
          console.warn(`Could not read file for snapshot: ${fullPath}`, error);
        }
      }
    }

    return files;
  }
}
