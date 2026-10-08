import { Tool } from '../interface';
import * as fs from 'fs';
import * as path from 'path';
import { WorkspaceManager, workspaceManager } from '../workspace';
import type { WorkspaceTool, ToolContext, ToolResult } from '../types';

const DEFAULT_MAX_BYTES = 64 * 1024; // 64 KB

function isBinary(buffer: Buffer): boolean {
  const checkLen = Math.min(buffer.length, 1024);
  for (let i = 0; i < checkLen; i++) {
    if (buffer[i] === 0) return true;
  }
  return false;
}

export const readFileTool: WorkspaceTool & Tool = {
  name: 'read_file',
  description: 'Read the contents of a file within the workspace with line numbers',
  spec: {
    name: 'read_file',
    description: 'Read the contents of a file within the workspace with line numbers',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path to file' },
        startLine: { type: 'number', description: '1-indexed start line' },
        endLine: { type: 'number', description: '1-indexed end line' },
        maxBytes: { type: 'number', description: 'Maximum bytes to read (default 64KB)' },
      },
      required: ['path'],
    },
    readOnly: true,
  },
  requiresApproval: () => false,
  execute: async (args: Record<string, unknown>, context?: ToolContext): Promise<ToolResult & any> => {
    const rawPath = args.path as string;
    if (!rawPath || typeof rawPath !== 'string') {
      return { content: 'Error: Path must be a non-empty string', isError: true };
    }

    const ws = context?.workspaceRoot ? new WorkspaceManager(context.workspaceRoot) : workspaceManager;

    let targetPath: string;
    try {
      targetPath = ws.resolveReal(rawPath);
    } catch (e: any) {
      return { content: `Error: ${e.message}`, isError: true };
    }

    if (!fs.existsSync(targetPath)) {
      return { content: `Error: File not found: ${rawPath}`, isError: true };
    }

    let stats: fs.Stats;
    try {
      stats = fs.statSync(targetPath);
    } catch (e: any) {
      return { content: `Error: Cannot stat file: ${e.message}`, isError: true };
    }

    if (!stats.isFile()) {
      return { content: `Error: Path is not a file: ${rawPath}`, isError: true };
    }

    const maxBytes = typeof args.maxBytes === 'number' && args.maxBytes > 0 ? args.maxBytes : DEFAULT_MAX_BYTES;

    try {
      const fd = fs.openSync(targetPath, 'r');
      const buffer = Buffer.alloc(Math.min(stats.size, maxBytes));
      const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, 0);
      fs.closeSync(fd);

      if (isBinary(buffer.subarray(0, bytesRead))) {
        return { content: `Error: Cannot read binary file: ${rawPath}`, isError: true };
      }

      const fileContent = buffer.toString('utf8', 0, bytesRead);
      const isTruncated = stats.size > maxBytes;

      const lines = fileContent.split(/\r?\n/);
      const totalLines = lines.length;

      let start = typeof args.startLine === 'number' && args.startLine > 0 ? args.startLine : 1;
      let end = typeof args.endLine === 'number' && args.endLine > 0 ? Math.min(args.endLine, totalLines) : totalLines;

      if (start > totalLines) {
        start = totalLines;
      }
      if (end < start) {
        end = start;
      }

      const numberedLines: string[] = [];
      for (let i = start; i <= end; i++) {
        numberedLines.push(`${i} | ${lines[i - 1]}`);
      }

      let resultText = numberedLines.join('\n');
      if (isTruncated) {
        resultText += '\n[... truncated file content ...]';
      }

      return {
        content: resultText,
        isError: false,
      };
    } catch (e: any) {
      return { content: `Error reading file: ${e.message}`, isError: true };
    }
  },
};
