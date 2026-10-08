import { Tool } from '../interface';
import * as fs from 'fs';
import * as path from 'path';
import { WorkspaceManager, workspaceManager } from '../workspace';
import type { WorkspaceTool, ToolContext, ToolResult } from '../types';
import { generateUnifiedDiff, computeSha256 } from '@agent-os/shared';

export interface FilePatchPlan {
  targetPath: string;
  relPath: string;
  isNewFile: boolean;
  isDelete: boolean;
  newContent?: string;
  originalContent?: string;
}

interface BackupRecord {
  targetPath: string;
  existed: boolean;
  originalContent?: string;
}

export const applyPatchTool: WorkspaceTool & Tool = {
  name: 'apply_patch',
  description: 'Apply unified diff or structured patch to workspace files atomically',
  spec: {
    name: 'apply_patch',
    description: 'Apply unified diff or structured patch to workspace files atomically (all-or-nothing)',
    parameters: {
      type: 'object',
      properties: {
        patch: { type: 'string', description: 'Patch string in unified diff or Codex format' },
      },
      required: ['patch'],
    },
    readOnly: false,
  },
  requiresApproval: () => true,
  execute: async (args: Record<string, unknown>, context?: ToolContext): Promise<ToolResult & any> => {
    const rawPatch = args.patch as string;
    if (typeof rawPatch !== 'string' || !rawPatch.trim()) {
      return { content: 'Error: Patch must be a non-empty string', isError: true };
    }

    const ws = context?.workspaceRoot ? new WorkspaceManager(context.workspaceRoot) : workspaceManager;

    try {
      const plan = parseAndValidatePatch(rawPatch, ws);
      if (plan.length === 0) {
        return { content: 'Error: No valid file patches found in patch text', isError: true };
      }

      // Execute all file writes atomically with rollback on any failure
      const backups: BackupRecord[] = [];
      try {
        for (const item of plan) {
          const existed = fs.existsSync(item.targetPath);
          let original: string | undefined;
          if (existed) {
            original = fs.readFileSync(item.targetPath, 'utf8');
          }
          backups.push({ targetPath: item.targetPath, existed, originalContent: original });

          if (item.isDelete) {
            if (existed) {
              fs.unlinkSync(item.targetPath);
            }
          } else {
            const parentDir = path.dirname(item.targetPath);
            if (!fs.existsSync(parentDir)) {
              fs.mkdirSync(parentDir, { recursive: true });
            }
            fs.writeFileSync(item.targetPath, item.newContent ?? '', 'utf8');
          }
        }
      } catch (writeErr: any) {
        // Rollback all modified files to original state in reverse order
        for (let i = backups.length - 1; i >= 0; i--) {
          const b = backups[i];
          try {
            if (b.existed && b.originalContent !== undefined) {
              fs.writeFileSync(b.targetPath, b.originalContent, 'utf8');
            } else if (!b.existed && fs.existsSync(b.targetPath)) {
              fs.unlinkSync(b.targetPath);
            }
          } catch {
            // rollback best effort
          }
        }
        throw new Error(`Disk write failed during patch application, all changes rolled back: ${writeErr.message}`);
      }

      const changes = plan.map(p => {
        const kind = p.isDelete ? 'delete' : p.isNewFile ? 'add' : 'modify';
        const beforeContent = p.originalContent;
        const afterContent = p.isDelete ? undefined : p.newContent;
        const diff = generateUnifiedDiff(beforeContent ?? '', afterContent ?? '', p.relPath);
        return {
          path: p.relPath,
          kind,
          diff,
          before: beforeContent ? computeSha256(beforeContent) : undefined,
          after: afterContent !== undefined ? computeSha256(afterContent) : undefined,
          beforeContent,
          afterContent,
        };
      });

      return {
        content: `Successfully applied patch to ${plan.length} file(s): ${plan.map(p => p.relPath).join(', ')}`,
        metadata: {
          filesModified: plan.map(p => p.relPath),
          count: plan.length,
          changes,
          diff: changes.map(c => c.diff).filter(Boolean).join('\n'),
          plans: plan.map(p => ({
            path: p.relPath,
            isNewFile: p.isNewFile,
            isDelete: p.isDelete,
          })),
        },
        isError: false,
      };
    } catch (err: any) {
      return {
        content: `Error applying patch: ${err.message}`,
        isError: true,
      };
    }
  },
};

function cleanPathPrefix(p: string): string {
  let cleaned = p.trim().replace(/^['"]|['"]$/g, '');
  if (cleaned.startsWith('a/') || cleaned.startsWith('b/')) {
    cleaned = cleaned.slice(2);
  }
  return cleaned;
}

function stripEnvelopes(patch: string): string {
  let text = patch.trim();
  // Strip markdown code fences if wrapping the entire patch
  if (text.startsWith('```')) {
    text = text.replace(/^```[a-zA-Z0-9_-]*\r?\n/, '');
    text = text.replace(/\r?\n```\s*$/, '');
    text = text.trim();
  }
  return text;
}

export function parseAndValidatePatch(rawPatch: string, ws: WorkspaceManager): FilePatchPlan[] {
  const cleanPatch = stripEnvelopes(rawPatch);

  // Check if structured Codex-style format: contains "*** File:" / "*** Add File:" / etc or "<<<<"
  if (
    cleanPatch.includes('*** File:') ||
    cleanPatch.includes('*** Add File:') ||
    cleanPatch.includes('*** Update File:') ||
    cleanPatch.includes('*** Delete File:') ||
    cleanPatch.includes('<<<<')
  ) {
    return parseCodexPatch(cleanPatch, ws);
  }

  // Otherwise parse as Unified Diff format
  return parseUnifiedPatch(cleanPatch, ws);
}

function parseCodexPatch(patch: string, ws: WorkspaceManager): FilePatchPlan[] {
  const plans: FilePatchPlan[] = [];
  const lines = patch.split(/\r?\n/);

  interface RawSection {
    type: 'File' | 'Add' | 'Update' | 'Delete';
    rawPath: string;
    bodyLines: string[];
  }

  const sections: RawSection[] = [];
  let currentSection: RawSection | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '*** Begin Patch' || trimmed === '*** End Patch') {
      continue;
    }

    const headerMatch = line.match(/^\s*\*\*\*\s*(File|Add File|Update File|Delete File):\s*(.+)$/);
    if (headerMatch) {
      if (currentSection) {
        sections.push(currentSection);
      }
      const rawType = headerMatch[1];
      const type: 'File' | 'Add' | 'Update' | 'Delete' =
        rawType === 'Add File' ? 'Add' :
        rawType === 'Update File' ? 'Update' :
        rawType === 'Delete File' ? 'Delete' : 'File';

      currentSection = {
        type,
        rawPath: cleanPathPrefix(headerMatch[2]),
        bodyLines: [],
      };
    } else if (currentSection) {
      currentSection.bodyLines.push(line);
    }
  }

  if (currentSection) {
    sections.push(currentSection);
  }

  for (const section of sections) {
    const targetRel = section.rawPath;
    if (!targetRel || targetRel.startsWith('***')) continue;

    const normalized = targetRel.replace(/\\/g, '/');
    if (normalized === '.git' || normalized.startsWith('.git/')) {
      throw new Error(`Security Violation: Patch modifies protected path '${targetRel}'`);
    }

    let targetPath: string;
    try {
      targetPath = ws.resolveReal(targetRel);
    } catch (e: any) {
      throw new Error(`Security Violation for '${targetRel}': ${e.message}`);
    }

    if (section.type === 'Delete') {
      if (!fs.existsSync(targetPath)) {
        throw new Error(`File '${targetRel}' does not exist to delete`);
      }
      const originalContent = fs.readFileSync(targetPath, 'utf8');
      plans.push({
        targetPath,
        relPath: targetRel,
        isNewFile: false,
        isDelete: true,
        originalContent,
      });
      continue;
    }

    const fileExists = fs.existsSync(targetPath);
    const sectionBody = section.bodyLines.join('\n');
    const hunkRegex = /<<<<\r?\n([\s\S]*?)====\r?\n([\s\S]*?)>>>>/g;

    // Check if new file creation
    if (!fileExists || section.type === 'Add') {
      // If there are hunks of form <<<<\n====\nnewContent\n>>>>
      let newContent = '';
      const hunks: string[] = [];
      let match;
      while ((match = hunkRegex.exec(sectionBody)) !== null) {
        hunks.push(match[2]);
      }

      if (hunks.length > 0) {
        newContent = hunks.join('\n');
      } else if (section.type === 'Add') {
        newContent = sectionBody.trim() ? sectionBody + '\n' : '';
      } else {
        throw new Error(`File '${targetRel}' does not exist for patch`);
      }

      plans.push({
        targetPath,
        relPath: targetRel,
        isNewFile: true,
        isDelete: false,
        newContent,
        originalContent: '',
      });
      continue;
    }

    // Existing file modification
    const originalContent = fs.readFileSync(targetPath, 'utf8');
    const isCRLF = originalContent.includes('\r\n');
    let content = originalContent;

    let anyHunk = false;
    let match;
    while ((match = hunkRegex.exec(sectionBody)) !== null) {
      anyHunk = true;
      let oldBlock = match[1];
      let newBlock = match[2];

      if (isCRLF) {
        oldBlock = oldBlock.replace(/\r?\n/g, '\r\n');
        newBlock = newBlock.replace(/\r?\n/g, '\r\n');
      } else {
        oldBlock = oldBlock.replace(/\r\n/g, '\n');
        newBlock = newBlock.replace(/\r\n/g, '\n');
      }

      // Safe substring replacement: never use string.replace() directly because $', $&, $`, $$ corrupt text
      const idx = content.indexOf(oldBlock);
      if (idx === -1) {
        throw new Error(`Patch hunk oldText not found in '${targetRel}'`);
      }
      content = content.slice(0, idx) + newBlock + content.slice(idx + oldBlock.length);
    }

    if (!anyHunk) {
      throw new Error(`No valid hunks found in section for '${targetRel}'`);
    }

    plans.push({
      targetPath,
      relPath: targetRel,
      isNewFile: false,
      isDelete: false,
      newContent: content,
      originalContent,
    });
  }

  return plans;
}

function parseUnifiedPatch(patch: string, ws: WorkspaceManager): FilePatchPlan[] {
  const plans: FilePatchPlan[] = [];

  // Strip envelope markers if present
  let clean = patch;
  clean = clean.replace(/^\s*\*\*\*\s*Begin Patch\s*/i, '');
  clean = clean.replace(/\s*\*\*\*\s*End Patch\s*$/i, '');
  clean = clean.trim();

  // Split into per-file diff blocks
  const fileDiffBlocks = clean.split(/(?=diff --git|--- )/g).filter(b => b.trim().length > 0);

  for (const block of fileDiffBlocks) {
    const lines = block.split(/\r?\n/);
    let oldFile = '';
    let newFile = '';

    for (const line of lines) {
      if (line.startsWith('--- ')) {
        oldFile = cleanPathPrefix(line.slice(4).trim());
      } else if (line.startsWith('+++ ')) {
        newFile = cleanPathPrefix(line.slice(4).trim());
      }
    }

    const isDelete = newFile === '/dev/null';
    const isNew = oldFile === '/dev/null';
    const targetRel = isDelete ? oldFile : (newFile || oldFile);
    if (!targetRel || targetRel === '/dev/null') continue;

    // Validate security
    const normalized = targetRel.replace(/\\/g, '/');
    if (normalized === '.git' || normalized.startsWith('.git/')) {
      throw new Error(`Security Violation: Patch modifies protected path '${targetRel}'`);
    }

    let targetPath: string;
    try {
      targetPath = ws.resolveReal(targetRel);
    } catch (e: any) {
      throw new Error(`Security Violation for '${targetRel}': ${e.message}`);
    }

    const fileExists = fs.existsSync(targetPath);
    let originalContent = '';
    let isCRLF = false;

    if (fileExists) {
      originalContent = fs.readFileSync(targetPath, 'utf8');
      isCRLF = originalContent.includes('\r\n');
    }

    if (isDelete) {
      if (!fileExists) {
        throw new Error(`File '${targetRel}' does not exist to delete`);
      }
      plans.push({
        targetPath,
        relPath: targetRel,
        isNewFile: false,
        isDelete: true,
        originalContent,
      });
      continue;
    }

    // Apply hunks in memory safely
    const updatedContent = applyUnifiedHunks(originalContent, lines, isNew || !fileExists, isCRLF);

    plans.push({
      targetPath,
      relPath: targetRel,
      isNewFile: isNew || !fileExists,
      isDelete: false,
      newContent: updatedContent,
      originalContent,
    });
  }

  return plans;
}

function applyUnifiedHunks(original: string, diffLines: string[], isNew: boolean, isCRLF: boolean): string {
  const eol = isCRLF ? '\r\n' : '\n';

  if (isNew) {
    const addedLines: string[] = [];
    for (const l of diffLines) {
      if (l.startsWith('+') && !l.startsWith('+++')) {
        addedLines.push(l.slice(1));
      }
    }
    const joined = addedLines.join(eol);
    return joined ? joined + eol : '';
  }

  const originalLines = original.split(/\r?\n/);
  const resultLines: string[] = [...originalLines];

  let i = 0;
  while (i < diffLines.length) {
    const line = diffLines[i];
    if (line.startsWith('@@')) {
      const match = line.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
      if (!match) {
        i++;
        continue;
      }

      const origStart = parseInt(match[1], 10) - 1; // 0-indexed
      i++;

      const removedLines: string[] = [];
      const addedLines: string[] = [];

      while (
        i < diffLines.length &&
        !diffLines[i].startsWith('@@') &&
        !diffLines[i].startsWith('---') &&
        !diffLines[i].startsWith('diff --git') &&
        !diffLines[i].startsWith('***')
      ) {
        const hLine = diffLines[i];
        if (hLine.startsWith('-')) {
          removedLines.push(hLine.slice(1));
        } else if (hLine.startsWith('+')) {
          addedLines.push(hLine.slice(1));
        } else if (hLine.startsWith(' ')) {
          // context line
        }
        i++;
      }

      if (removedLines.length > 0) {
        const removedBlock = removedLines.join(eol);
        const currentText = resultLines.join(eol);
        const idx = currentText.indexOf(removedBlock);
        if (idx === -1) {
          throw new Error(`Hunk failed to match content in file`);
        }
        // Safe replacement via slice: never use string.replace() directly because $', $&, $`, $$ corrupt text
        const addedBlock = addedLines.join(eol);
        const replaced = currentText.slice(0, idx) + addedBlock + currentText.slice(idx + removedBlock.length);
        resultLines.length = 0;
        resultLines.push(...replaced.split(eol));
      } else if (addedLines.length > 0) {
        resultLines.splice(origStart, 0, ...addedLines);
      }
    } else {
      i++;
    }
  }

  return resultLines.join(eol);
}
