import { FilePatch } from './models';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';

const execAsync = promisify(exec);

export class PatchEngine {
  /**
   * Generates a patch for a specific file given its original content and new content.
   */
  public static generateFilePatch(filePath: string, originalContent: string, newContent: string): FilePatch {
    const beforeHash = crypto.createHash('sha256').update(originalContent).digest('hex');
    const afterHash = crypto.createHash('sha256').update(newContent).digest('hex');
    
    // In a real implementation we would generate a unified diff.
    // For Phase 8 MVP we can return a structural placeholder or rely on `git diff` externally.
    const diff = `--- a/${filePath}\n+++ b/${filePath}\n@@ -1 +1 @@\n- (original content hash: ${beforeHash})\n+ (new content hash: ${afterHash})`;

    return {
      filePath,
      beforeHash,
      afterHash,
      diff
    };
  }

  /**
   * Generates patches using git inside a worktree.
   * Note: This requires the directory to be a git repository or worktree.
   */
  public static async generatePatchesFromGit(worktreePath: string): Promise<FilePatch[]> {
    try {
      // Get list of changed files
      const { stdout: diffNameStatus } = await execAsync('git diff --name-only', { cwd: worktreePath });
      const changedFiles = diffNameStatus.split('\n').filter(Boolean);

      const patches: FilePatch[] = [];

      for (const file of changedFiles) {
        // Get the diff
        const { stdout: diff } = await execAsync(`git diff -- "${file}"`, { cwd: worktreePath });
        
        // Compute hashes (approximation via current working tree vs HEAD)
        const { stdout: originalBlobHash } = await execAsync(`git ls-tree HEAD "${file}"`, { cwd: worktreePath });
        const beforeHash = originalBlobHash.split(/\\s+/)[2] || 'unknown';
        
        const currentContent = await fs.readFile(`${worktreePath}/${file}`, 'utf-8');
        const afterHash = crypto.createHash('sha256').update(currentContent).digest('hex');

        patches.push({
          filePath: file,
          beforeHash,
          afterHash,
          diff
        });
      }

      return patches;
    } catch (error) {
      throw new Error(`Failed to generate patches from git: ${error}`);
    }
  }
}
