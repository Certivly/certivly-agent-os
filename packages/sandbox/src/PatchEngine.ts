import { FilePatch, WorkspaceSnapshot } from './models';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export class PatchEngine {
  constructor(private beforeDir: string, private afterDir: string) {}

  public generatePatch(before: WorkspaceSnapshot, after: WorkspaceSnapshot): FilePatch[] {
    const patches: FilePatch[] = [];
    
    // Sort files deterministically
    const beforeFiles = new Map(before.files.map(f => [f.path, f.sha256]));
    const afterFiles = new Map(after.files.map(f => [f.path, f.sha256]));
    
    const allPaths = Array.from(new Set([...beforeFiles.keys(), ...afterFiles.keys()])).sort();

    for (const filePath of allPaths) {
      const bHash = beforeFiles.get(filePath);
      const aHash = afterFiles.get(filePath);

      if (bHash !== aHash) {
        const bPath = path.join(this.beforeDir, filePath);
        const aPath = path.join(this.afterDir, filePath);
        
        // Handle deletions
        if (!aHash) {
          const bContent = fs.readFileSync(bPath, 'utf-8');
          patches.push({
            filePath,
            beforeHash: bHash || '',
            afterHash: '',
            diff: this.generateRawDiff(bPath, null, filePath, bContent, '')
          });
          continue;
        }

        // Handle additions
        if (!bHash) {
          const aContent = fs.readFileSync(aPath, 'utf-8');
          patches.push({
            filePath,
            beforeHash: '',
            afterHash: aHash || '',
            diff: this.generateRawDiff(null, aPath, filePath, '', aContent)
          });
          continue;
        }

        // Handle modifications
        try {
          const diffOutput = execSync(`git diff --no-index "${bPath}" "${aPath}"`, { encoding: 'utf-8' });
          // git diff returns 1 if diff exists, so it will throw. 
          // We handle this in catch block since it's expected.
          patches.push({
            filePath,
            beforeHash: bHash || '',
            afterHash: aHash || '',
            diff: diffOutput
          });
        } catch (error: any) {
          // git diff --no-index returns exit code 1 when there are differences
          let diffOutput = error.stdout || '';
          
          // Clean up the diff header to use relative paths instead of absolute paths
          diffOutput = diffOutput.replace(new RegExp(`a/${bPath.replace(/\\/g, '/')}|--- "${bPath.replace(/\\/g, '/')}"|--- ${bPath.replace(/\\/g, '/')}`,'g'), `--- a/${filePath}`);
          diffOutput = diffOutput.replace(new RegExp(`b/${aPath.replace(/\\/g, '/')}|\\+\\+\\+ "${aPath.replace(/\\/g, '/')}"|\\+\\+\\+ ${aPath.replace(/\\/g, '/')}`,'g'), `+++ b/${filePath}`);
          
          patches.push({
            filePath,
            beforeHash: bHash || '',
            afterHash: aHash || '',
            diff: diffOutput
          });
        }
      }
    }

    return patches;
  }

  private generateRawDiff(bPath: string | null, aPath: string | null, filePath: string, bContent: string, aContent: string): string {
    // Fallback simple structural diff for new/deleted files if git diff --no-index is too complex to wire
    const header = `--- ${bPath ? `a/${filePath}` : '/dev/null'}\n+++ ${aPath ? `b/${filePath}` : '/dev/null'}\n`;
    const body = bContent ? bContent.split('\n').map(l => `-${l}`).join('\n') : aContent.split('\n').map(l => `+${l}`).join('\n');
    return header + body;
  }
}

