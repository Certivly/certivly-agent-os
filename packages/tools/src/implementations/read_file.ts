import { Tool } from '../interface';
import * as fs from 'fs';
import * as readline from 'readline';
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

    // Binary check on first 1KB
    try {
      const fd = fs.openSync(targetPath, 'r');
      const checkBuf = Buffer.alloc(Math.min(stats.size, 1024));
      const bytesRead = fs.readSync(fd, checkBuf, 0, checkBuf.length, 0);
      fs.closeSync(fd);

      if (isBinary(checkBuf.subarray(0, bytesRead))) {
        return { content: `Error: Cannot read binary file: ${rawPath}`, isError: true };
      }
    } catch (e: any) {
      return { content: `Error reading file header: ${e.message}`, isError: true };
    }

    const maxBytes = typeof args.maxBytes === 'number' && args.maxBytes > 0 ? args.maxBytes : DEFAULT_MAX_BYTES;
    const start = typeof args.startLine === 'number' && args.startLine > 0 ? args.startLine : 1;
    const end = typeof args.endLine === 'number' && args.endLine > 0 ? args.endLine : Infinity;

    try {
      const readStream = fs.createReadStream(targetPath, { encoding: 'utf8' });
      const rl = readline.createInterface({
        input: readStream,
        crlfDelay: Infinity,
      });

      let currentLine = 0;
      let byteCount = 0;
      let truncated = false;
      const numberedLines: string[] = [];

      for await (const line of rl) {
        currentLine++;
        if (currentLine < start) continue;
        if (currentLine > end) {
          break;
        }

        const formatted = `${currentLine} | ${line}`;
        const lineBytes = Buffer.byteLength(formatted, 'utf8') + 1;

        if (byteCount + lineBytes > maxBytes) {
          truncated = true;
          break;
        }

        numberedLines.push(formatted);
        byteCount += lineBytes;
      }

      rl.close();
      readStream.destroy();

      if (currentLine < start && numberedLines.length === 0) {
        return {
          content: `[File has ${currentLine} lines. Requested startLine ${start} is beyond end of file.]`,
          isError: false,
        };
      }

      let resultText = numberedLines.join('\n');
      if (truncated) {
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
