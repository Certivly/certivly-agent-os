import { Tool } from '../interface';
import * as fs from 'fs';
import * as path from 'path';
import { WorkspaceManager, workspaceManager } from '../workspace';
import type { WorkspaceTool, ToolContext, ToolResult } from '../types';

interface FilePatchPlan {
  targetPath: string;
  relPath: string;
  isNewFile: boolean;
  newContent: string;
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
    const patch = args.patch as string;
    if (typeof patch !== 'string' || !patch.trim()) {
      return { content: 'Error: Patch must be a non-empty string', isError: true };
    }

    const ws = context?.workspaceRoot ? new WorkspaceManager(context.workspaceRoot) : workspaceManager;

    try {
      const plan = parseAndValidatePatch(patch, ws);
      if (plan.length === 0) {
        return { content: 'Error: No valid file patches found in patch text', isError: true };
      }

      // Execute all file writes atomically (all plans were already validated in memory)
      for (const item of plan) {
        const parentDir = path.dirname(item.targetPath);
        if (!fs.existsSync(parentDir)) {
          fs.mkdirSync(parentDir, { recursive: true });
        }
        fs.writeFileSync(item.targetPath, item.newContent, 'utf8');
      }

      return {
        content: `Successfully applied patch to ${plan.length} file(s): ${plan.map(p => p.relPath).join(', ')}`,
        metadata: { filesModified: plan.map(p => p.relPath), count: plan.length },
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

function parseAndValidatePatch(patch: string, ws: WorkspaceManager): FilePatchPlan[] {
  const plans: FilePatchPlan[] = [];

  // Check if Codex format: contains "*** File:" or "<<<<"
  if (patch.includes('*** File:') || patch.includes('<<<<')) {
    return parseCodexPatch(patch, ws);
  }

  // Parse Unified Diff format
  const fileDiffBlocks = patch.split(/(?=diff --git|--- )/g).filter(b => b.trim().length > 0);

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

    const targetRel = newFile && newFile !== '/dev/null' ? newFile : oldFile;
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

    const isNew = oldFile === '/dev/null' || !fs.existsSync(targetPath);
    let originalContent = '';
    let isCRLF = false;

    if (!isNew) {
      originalContent = fs.readFileSync(targetPath, 'utf8');
      isCRLF = originalContent.includes('\r\n');
    }

    // Apply hunks in memory
    const updatedContent = applyUnifiedHunks(originalContent, lines, isNew, isCRLF);

    plans.push({
      targetPath,
      relPath: targetRel,
      isNewFile: isNew,
      newContent: updatedContent,
    });
  }

  return plans;
}

function applyUnifiedHunks(original: string, diffLines: string[], isNew: boolean, isCRLF: boolean): string {
  if (isNew) {
    const addedLines: string[] = [];
    for (const l of diffLines) {
      if (l.startsWith('+') && !l.startsWith('+++')) {
        addedLines.push(l.slice(1));
      }
    }
    return addedLines.join(isCRLF ? '\r\n' : '\n');
  }

  const originalLines = original.split(/\r?\n/);
  const resultLines: string[] = [...originalLines];

  // Parse hunks
  let i = 0;
  while (i < diffLines.length) {
    const line = diffLines[i];
    if (line.startsWith('@@')) {
      // Parse @@ -start,count +start,count @@
      const match = line.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
      if (!match) {
        i++;
        continue;
      }

      const origStart = parseInt(match[1], 10) - 1; // 0-indexed
      i++;

      const removedLines: string[] = [];
      const addedLines: string[] = [];

      while (i < diffLines.length && !diffLines[i].startsWith('@@') && !diffLines[i].startsWith('---') && !diffLines[i].startsWith('diff --git')) {
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

      // Find match position in resultLines
      if (removedLines.length > 0) {
        const removedBlock = removedLines.join('\n');
        const currentText = resultLines.join('\n');
        if (!currentText.includes(removedBlock)) {
          throw new Error(`Hunk failed to match content in file`);
        }
        const replaced = currentText.replace(removedBlock, addedLines.join('\n'));
        resultLines.length = 0;
        resultLines.push(...replaced.split('\n'));
      } else if (addedLines.length > 0) {
        resultLines.splice(origStart, 0, ...addedLines);
      }
    } else {
      i++;
    }
  }

  return resultLines.join(isCRLF ? '\r\n' : '\n');
}

function parseCodexPatch(patch: string, ws: WorkspaceManager): FilePatchPlan[] {
  const plans: FilePatchPlan[] = [];
  const fileSections = patch.split(/\*\*\* File:\s*/g).filter(s => s.trim().length > 0);

  for (const section of fileSections) {
    const lines = section.split(/\r?\n/);
    const targetRel = lines[0].trim();
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

    if (!fs.existsSync(targetPath)) {
      throw new Error(`File '${targetRel}' does not exist for patch`);
    }

    let content = fs.readFileSync(targetPath, 'utf8');
    const isCRLF = content.includes('\r\n');

    // Extract <<<< ... ==== ... >>>> blocks
    const sectionBody = lines.slice(1).join('\n');
    const hunkRegex = /<<<<\r?\n([\s\S]*?)====\r?\n([\s\S]*?)>>>>/g;
    let match;
    let anyHunk = false;

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

      if (!content.includes(oldBlock)) {
        throw new Error(`Patch hunk oldText not found in '${targetRel}'`);
      }

      content = content.replace(oldBlock, newBlock);
    }

    if (!anyHunk) {
      throw new Error(`No valid hunks found in section for '${targetRel}'`);
    }

    plans.push({
      targetPath,
      relPath: targetRel,
      isNewFile: false,
      newContent: content,
    });
  }

  return plans;
}
