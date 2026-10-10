import { Tool } from '../interface';
import * as fs from 'fs';
import * as path from 'path';
import { WorkspaceManager, workspaceManager } from '../workspace';
import type { WorkspaceTool, ToolContext, ToolResult } from '../types';
import { generateUnifiedDiff, computeSha256 } from '@agent-os/shared';
import { TruncatedWriteGuard } from '../guards/TruncatedWriteGuard';

export const editFileTool: WorkspaceTool & Tool = {
  name: 'edit_file',
  description: 'Make targeted edits to a file by replacing old text with new text',
  spec: {
    name: 'edit_file',
    description: 'Replace exact occurrences of oldText with newText in a workspace file',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path to file' },
        oldText: { type: 'string', description: 'Exact text to find and replace' },
        newText: { type: 'string', description: 'Replacement text' },
        replaceAll: { type: 'boolean', description: 'Whether to replace all occurrences (default false)' },
        allowTruncation: { type: 'boolean', description: 'Explicitly allow large deletions that leave unclosed brackets' },
      },
      required: ['path', 'oldText', 'newText'],
    },
    readOnly: false,
  },
  requiresApproval: () => true,
  execute: async (args: Record<string, unknown>, context?: ToolContext): Promise<ToolResult & any> => {
    const rawPath = args.path as string;
    const oldText = args.oldText as string;
    const newText = args.newText as string;
    const replaceAll = Boolean(args.replaceAll);

    if (typeof rawPath !== 'string' || !rawPath) {
      return { content: 'Error: Path must be a non-empty string', isError: true };
    }
    if (typeof oldText !== 'string') {
      return { content: 'Error: oldText must be a string', isError: true };
    }
    if (typeof newText !== 'string') {
      return { content: 'Error: newText must be a string', isError: true };
    }

    const ws = context?.workspaceRoot ? new WorkspaceManager(context.workspaceRoot) : workspaceManager;

    let targetPath: string;
    try {
      targetPath = ws.resolveReal(rawPath);
    } catch (e: any) {
      return { content: `Error: ${e.message}`, isError: true };
    }

    // Check .git protection
    const rel = path.relative(ws.root, targetPath).replace(/\\/g, '/');
    if (rel === '.git' || rel.startsWith('.git/')) {
      return { content: 'Error: Security Violation: Editing inside .git is prohibited', isError: true };
    }

    if (!fs.existsSync(targetPath)) {
      return { content: `Error: File not found: ${rawPath}`, isError: true };
    }

    const fileBuffer = fs.readFileSync(targetPath);
    let originalContent = fileBuffer.toString('utf8');

    // Detect line endings
    const isCRLF = originalContent.includes('\r\n');

    // Normalize oldText and newText to match file's line ending
    let normalizedOld = oldText;
    let normalizedNew = newText;
    if (isCRLF) {
      normalizedOld = oldText.replace(/\r?\n/g, '\r\n');
      normalizedNew = newText.replace(/\r?\n/g, '\r\n');
    } else {
      normalizedOld = oldText.replace(/\r\n/g, '\n');
      normalizedNew = newText.replace(/\r\n/g, '\n');
    }

    // Count occurrences
    const occurrences = originalContent.split(normalizedOld).length - 1;

    if (occurrences === 0) {
      const lineCount = originalContent.split(/\r?\n/).length;
      return {
        content: `Error: oldText not found in '${rawPath}'. The file has ${lineCount} lines. Please check whitespace and context.`,
        isError: true,
      };
    }

    if (occurrences > 1 && !replaceAll) {
      return {
        content: `Error: Multiple occurrences (${occurrences}) of oldText found in '${rawPath}'. Specify more context or pass replaceAll: true.`,
        isError: true,
      };
    }

    if (!args.allowTruncation && normalizedOld.split('\n').length >= TruncatedWriteGuard.MIN_EXISTING_LINES) {
      const truncationCheck = TruncatedWriteGuard.detectTruncatedRewrite(normalizedOld, normalizedNew, false);
      if (truncationCheck.isTruncated) {
        return {
          content: `Refusing edit to '${rawPath}': ${truncationCheck.reason} If this deletion is intentional, pass allowTruncation: true.`,
          isError: true,
        };
      }
    }

    let updatedContent: string;
    if (replaceAll) {
      updatedContent = originalContent.split(normalizedOld).join(normalizedNew);
    } else {
      const idx = originalContent.indexOf(normalizedOld);
      updatedContent = originalContent.slice(0, idx) + normalizedNew + originalContent.slice(idx + normalizedOld.length);
    }

    try {
      fs.writeFileSync(targetPath, updatedContent, 'utf8');
      const diff = generateUnifiedDiff(originalContent, updatedContent, rawPath);
      return {
        content: `Successfully replaced ${replaceAll ? occurrences : 1} occurrence(s) in ${rawPath}`,
        metadata: {
          path: rawPath,
          replacementCount: replaceAll ? occurrences : 1,
          kind: 'modify',
          diff,
          before: computeSha256(originalContent),
          after: computeSha256(updatedContent),
          beforeContent: originalContent,
          afterContent: updatedContent,
        },
        isError: false,
      };
    } catch (e: any) {
      return { content: `Error writing edited file ${rawPath}: ${e.message}`, isError: true };
    }
  },
};
