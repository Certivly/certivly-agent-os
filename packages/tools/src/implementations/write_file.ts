import * as fs from 'fs';
import * as path from 'path';
import { Tool } from '../interface';
import { WorkspaceManager, workspaceManager } from '../workspace';
import type { WorkspaceTool, ToolContext, ToolResult } from '../types';

export const writeFileTool: WorkspaceTool & Tool = {
  name: 'write_file',
  description: 'Write content to a file in workspace (refuses overwrite unless overwrite:true)',
  spec: {
    name: 'write_file',
    description: 'Write content to a file in workspace (refuses overwrite unless overwrite:true)',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path to file' },
        content: { type: 'string', description: 'Content to write' },
        overwrite: { type: 'boolean', description: 'Whether to overwrite existing file (default false)' },
      },
      required: ['path', 'content'],
    },
    readOnly: false,
  },
  requiresApproval: () => true,
  execute: async (args: Record<string, unknown>, context?: ToolContext): Promise<ToolResult & any> => {
    const rawPath = args.path as string;
    const content = args.content as string;
    const overwrite = Boolean(args.overwrite);

    if (typeof rawPath !== 'string' || !rawPath) {
      return { content: 'Error: Path must be a non-empty string', isError: true };
    }
    if (typeof content !== 'string') {
      return { content: 'Error: Content must be a string', isError: true };
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
      return { content: 'Error: Security Violation: Writing inside .git is prohibited', isError: true };
    }

    if (fs.existsSync(targetPath)) {
      if (!overwrite) {
        return { content: `Error: File '${rawPath}' already exists and overwrite is false`, isError: true };
      }
    } else {
      const parentDir = path.dirname(targetPath);
      if (!ws.isWithinWorkspace(parentDir)) {
        return { content: `Error: Security Violation: Parent directory outside workspace`, isError: true };
      }
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }
    }

    try {
      fs.writeFileSync(targetPath, content, 'utf8');
      return {
        content: `Successfully wrote to ${rawPath}`,
        metadata: { path: rawPath, bytesWritten: Buffer.byteLength(content, 'utf8') },
        isError: false,
      };
    } catch (e: any) {
      return { content: `Error writing file ${rawPath}: ${e.message}`, isError: true };
    }
  },
};
