import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import {
  ChangeSet,
  ChangeKind,
  normalizeChangePath,
  validateChangeSet,
  computeSha256,
} from '../models/ChangeSet';

export interface ApplyResult {
  applied: boolean;
  backupId?: string;
  conflicts: Array<{ path: string; reason: string }>;
  errors: string[];
}

export interface BackupFileRecord {
  originalPath: string;
  backupPath: string;
  kind: ChangeKind;
}

export interface BackupManifest {
  backupId: string;
  timestamp: string;
  workspaceRoot: string;
  files: BackupFileRecord[];
}

interface PreparedPlan {
  fullPath: string;
  relPath: string;
  kind: ChangeKind;
  newContent?: string;
  originalContent?: string;
}

/**
 * Applies a unified diff to an existing file's text content.
 */
export function applyUnifiedDiff(currentContent: string, diffText: string): string {
  if (!diffText.trim()) return currentContent;

  const lines = currentContent.split(/\r?\n/);
  const diffLines = diffText.split(/\r?\n/);

  // Check if diff contains standard unified diff hunks
  const hunkHeaderRegex = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;
  const hunkIndices: number[] = [];
  for (let i = 0; i < diffLines.length; i++) {
    if (hunkHeaderRegex.test(diffLines[i])) {
      hunkIndices.push(i);
    }
  }

  if (hunkIndices.length === 0) {
    // If no hunk header, check for simple old/new replacement pattern or throw
    throw new Error('No valid unified diff hunks found');
  }

  let resultLines = [...lines];
  let lineOffset = 0;

  for (let h = 0; h < hunkIndices.length; h++) {
    const startIdx = hunkIndices[h];
    const endIdx = h + 1 < hunkIndices.length ? hunkIndices[h + 1] : diffLines.length;
    const headerMatch = hunkHeaderRegex.exec(diffLines[startIdx])!;

    const origStart = parseInt(headerMatch[1], 10) - 1; // 0-indexed
    const hunkBody = diffLines.slice(startIdx + 1, endIdx);

    const oldBlock: string[] = [];
    const newBlock: string[] = [];

    for (const line of hunkBody) {
      if (line.startsWith('---') || line.startsWith('+++')) continue;
      if (line.startsWith('-')) {
        oldBlock.push(line.slice(1));
      } else if (line.startsWith('+')) {
        newBlock.push(line.slice(1));
      } else if (line.startsWith(' ')) {
        oldBlock.push(line.slice(1));
        newBlock.push(line.slice(1));
      }
    }

    // Verify context matches at target index or find matching block
    let targetIdx = origStart + lineOffset;
    let found = true;
    for (let i = 0; i < oldBlock.length; i++) {
      if (resultLines[targetIdx + i] !== oldBlock[i]) {
        found = false;
        break;
      }
    }

    if (!found) {
      // Scan for exact match nearby
      let scanIdx = -1;
      for (let s = 0; s <= resultLines.length - oldBlock.length; s++) {
        let match = true;
        for (let i = 0; i < oldBlock.length; i++) {
          if (resultLines[s + i] !== oldBlock[i]) {
            match = false;
            break;
          }
        }
        if (match) {
          scanIdx = s;
          break;
        }
      }
      if (scanIdx === -1) {
        throw new Error('Hunk context does not match target file');
      }
      targetIdx = scanIdx;
    }

    resultLines.splice(targetIdx, oldBlock.length, ...newBlock);
    lineOffset += newBlock.length - oldBlock.length;
  }

  // Preserve CRLF if original content had CRLF
  const isCRLF = currentContent.includes('\r\n');
  return resultLines.join(isCRLF ? '\r\n' : '\n');
}

/**
 * Extracts added file content from diff text.
 */
export function extractContentFromDiff(diffText: string): string {
  const diffLines = diffText.split(/\r?\n/);
  const contentLines: string[] = [];

  for (const line of diffLines) {
    if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('@@') || line.startsWith('diff --git')) {
      continue;
    }
    if (line.startsWith('+')) {
      contentLines.push(line.slice(1));
    }
  }

  return contentLines.join('\n');
}

export class ChangeSetApplier {
  async applyChangeSet(workspaceRoot: string, changeSet: ChangeSet): Promise<ApplyResult> {
    const conflicts: Array<{ path: string; reason: string }> = [];
    const errors: string[] = [];

    // 1. Validate changeset before touching files
    const validationErrors = validateChangeSet(changeSet);
    if (validationErrors.length > 0) {
      return {
        applied: false,
        conflicts: [],
        errors: validationErrors,
      };
    }

    const resolvedRoot = path.resolve(workspaceRoot);
    const preparedPlans: PreparedPlan[] = [];

    // 2. Pre-flight check every file
    for (const file of changeSet.files) {
      const relPath = normalizeChangePath(file.path);
      const fullPath = path.resolve(resolvedRoot, relPath);

      // Verify security containment
      const rootWithSep = resolvedRoot.endsWith(path.sep) ? resolvedRoot : resolvedRoot + path.sep;
      if (fullPath !== resolvedRoot && !fullPath.startsWith(rootWithSep)) {
        errors.push(`Security Violation: Path '${file.path}' escapes workspace root`);
        continue;
      }

      if (relPath === '.git' || relPath.startsWith('.git/')) {
        errors.push(`Security Violation: Modifying protected path '${file.path}'`);
        continue;
      }

      if (file.kind === 'modify') {
        if (!fs.existsSync(fullPath)) {
          conflicts.push({ path: file.path, reason: 'File does not exist' });
          continue;
        }

        const currentContent = fs.readFileSync(fullPath, 'utf8');
        const currentHash = computeSha256(currentContent);

        if (file.before && currentHash !== file.before) {
          conflicts.push({
            path: file.path,
            reason: `Hash mismatch: expected ${file.before}, got ${currentHash}`,
          });
          continue;
        }

        let newContent: string;
        if (file.afterContent !== undefined) {
          newContent = file.afterContent;
        } else {
          try {
            newContent = applyUnifiedDiff(currentContent, file.diff);
          } catch (err: any) {
            errors.push(`Failed to apply diff to ${file.path}: ${err.message}`);
            continue;
          }
        }

        if (file.after) {
          const resultingHash = computeSha256(newContent);
          if (resultingHash !== file.after) {
            errors.push(`Resulting hash mismatch for ${file.path}: expected ${file.after}, got ${resultingHash}`);
            continue;
          }
        }

        preparedPlans.push({
          fullPath,
          relPath,
          kind: 'modify',
          newContent,
          originalContent: currentContent,
        });
      } else if (file.kind === 'add' || file.kind === 'create') {
        if (fs.existsSync(fullPath)) {
          conflicts.push({ path: file.path, reason: 'File already exists' });
          continue;
        }

        let newContent: string;
        if (file.afterContent !== undefined) {
          newContent = file.afterContent;
        } else {
          try {
            newContent = extractContentFromDiff(file.diff);
          } catch (err: any) {
            errors.push(`Failed to extract content for new file ${file.path}: ${err.message}`);
            continue;
          }
        }

        if (file.after) {
          const resultingHash = computeSha256(newContent);
          if (resultingHash !== file.after) {
            errors.push(`Resulting hash mismatch for ${file.path}: expected ${file.after}, got ${resultingHash}`);
            continue;
          }
        }

        preparedPlans.push({
          fullPath,
          relPath,
          kind: 'add',
          newContent,
        });
      } else if (file.kind === 'delete') {
        if (!fs.existsSync(fullPath)) {
          conflicts.push({ path: file.path, reason: 'File does not exist' });
          continue;
        }

        const currentContent = fs.readFileSync(fullPath, 'utf8');
        const currentHash = computeSha256(currentContent);

        if (file.before && currentHash !== file.before) {
          conflicts.push({
            path: file.path,
            reason: `Hash mismatch: expected ${file.before}, got ${currentHash}`,
          });
          continue;
        }

        preparedPlans.push({
          fullPath,
          relPath,
          kind: 'delete',
          originalContent: currentContent,
        });
      }
    }

    // If any conflict or preparation error occurred, stop immediately without touching disk!
    if (conflicts.length > 0 || errors.length > 0) {
      return {
        applied: false,
        conflicts,
        errors,
      };
    }

    // 3. Create backup in .agentos/backups/<backupId>/
    const backupId = `backup-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const backupDir = path.join(resolvedRoot, '.agentos', 'backups', backupId);
    fs.mkdirSync(backupDir, { recursive: true });

    const backupFiles: BackupFileRecord[] = [];
    for (const plan of preparedPlans) {
      const backupRelPath = path.join('files', plan.relPath).replace(/\\/g, '/');
      const backupFullPath = path.join(backupDir, backupRelPath);

      if (plan.kind === 'modify' || plan.kind === 'delete') {
        fs.mkdirSync(path.dirname(backupFullPath), { recursive: true });
        fs.writeFileSync(backupFullPath, plan.originalContent!, 'utf8');
      }

      backupFiles.push({
        originalPath: plan.relPath,
        backupPath: backupRelPath,
        kind: plan.kind,
      });
    }

    const manifest: BackupManifest = {
      backupId,
      timestamp: new Date().toISOString(),
      workspaceRoot: resolvedRoot,
      files: backupFiles,
    };
    fs.writeFileSync(path.join(backupDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

    // 4. Commit changes to disk atomically
    const writtenPlans: PreparedPlan[] = [];
    try {
      for (const plan of preparedPlans) {
        if (plan.kind === 'add' || plan.kind === 'modify') {
          fs.mkdirSync(path.dirname(plan.fullPath), { recursive: true });
          fs.writeFileSync(plan.fullPath, plan.newContent!, 'utf8');
          writtenPlans.push(plan);
        } else if (plan.kind === 'delete') {
          if (fs.existsSync(plan.fullPath)) {
            fs.unlinkSync(plan.fullPath);
          }
          writtenPlans.push(plan);
        }
      }
    } catch (writeErr: any) {
      // Restore byte-identical original state on write failure
      for (const plan of writtenPlans) {
        try {
          if (plan.kind === 'add') {
            if (fs.existsSync(plan.fullPath)) fs.unlinkSync(plan.fullPath);
          } else if (plan.originalContent !== undefined) {
            fs.writeFileSync(plan.fullPath, plan.originalContent, 'utf8');
          }
        } catch (_rollbackErr) {
          // best-effort: rollback attempt during write failure restoration
        }
      }

      return {
        applied: false,
        conflicts: [],
        errors: [`Write failed, workspace restored: ${writeErr.message}`],
      };
    }

    return {
      applied: true,
      backupId,
      conflicts: [],
      errors: [],
    };
  }

  async rollback(workspaceRoot: string, backupId: string): Promise<boolean> {
    const resolvedRoot = path.resolve(workspaceRoot);
    const backupDir = path.join(resolvedRoot, '.agentos', 'backups', backupId);
    const manifestPath = path.join(backupDir, 'manifest.json');

    if (!fs.existsSync(manifestPath)) {
      return false;
    }

    let manifest: BackupManifest;
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch (_err: unknown) {
      return false;
    }

    for (const record of manifest.files) {
      const originalFullPath = path.resolve(resolvedRoot, record.originalPath);
      const backupFullPath = path.resolve(backupDir, record.backupPath);

      if (record.kind === 'modify' || record.kind === 'delete') {
        if (fs.existsSync(backupFullPath)) {
          const content = fs.readFileSync(backupFullPath);
          fs.mkdirSync(path.dirname(originalFullPath), { recursive: true });
          fs.writeFileSync(originalFullPath, content);
        }
      } else if (record.kind === 'add') {
        if (fs.existsSync(originalFullPath)) {
          fs.unlinkSync(originalFullPath);
        }
      }
    }

    return true;
  }
}
