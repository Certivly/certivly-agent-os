import { Tool } from '../interface';
import * as fs from 'fs';
import * as path from 'path';
import { WorkspaceManager, workspaceManager } from '../workspace';
import type { WorkspaceTool, ToolContext, ToolResult } from '../types';

const DEFAULT_IGNORE = new Set(['.git', 'node_modules', '.agentos', 'dist', 'build', '.idea']);

function loadGitignoreRules(workspaceRoot: string): string[] {
  const gitignorePath = path.join(workspaceRoot, '.gitignore');
  if (!fs.existsSync(gitignorePath)) return [];
  try {
    return fs.readFileSync(gitignorePath, 'utf8')
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(l => l.length > 0 && !l.startsWith('#'));
  } catch (err: unknown) {
    const _msg = err instanceof Error ? err.message : String(err);
    return [];
  }
}

function shouldIgnore(relPath: string, isDir: boolean, ignoreRules: string[]): boolean {
  const normalized = relPath.replace(/\\/g, '/');
  const segments = normalized.split('/').filter(Boolean);

  for (const seg of segments) {
    if (DEFAULT_IGNORE.has(seg)) return true;
  }

  for (const rule of ignoreRules) {
    let clean = rule.replace(/\\/g, '/');
    const dirOnly = clean.endsWith('/');
    if (dirOnly) clean = clean.slice(0, -1);

    if (dirOnly && !isDir) continue;

    if (clean.startsWith('*')) {
      const ext = clean.slice(1);
      if (normalized.endsWith(ext)) return true;
    } else if (clean.endsWith('*')) {
      const prefix = clean.slice(0, -1);
      if (normalized.startsWith(prefix) || segments.some(s => s.startsWith(prefix))) return true;
    } else {
      if (normalized === clean || normalized.startsWith(clean + '/') || segments.includes(clean)) {
        return true;
      }
    }
  }

  return false;
}

function isBinary(buffer: Buffer): boolean {
  const checkLen = Math.min(buffer.length, 512);
  for (let i = 0; i < checkLen; i++) {
    if (buffer[i] === 0) return true;
  }
  return false;
}

export const grepTool: WorkspaceTool & Tool = {
  name: 'grep',
  description: 'Search for text pattern in files across workspace',
  spec: {
    name: 'grep',
    description: 'Search for literal text or regex pattern across workspace files',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Pattern to search for' },
        path: { type: 'string', description: 'Subdirectory or file path to search within (default ".")' },
        glob: { type: 'string', description: 'File extension or glob to filter by (e.g. "*.ts")' },
        regex: { type: 'boolean', description: 'Whether pattern is a regular expression (default false)' },
        context: { type: 'number', description: 'Number of context lines' },
        maxResults: { type: 'number', description: 'Maximum number of results to return (default 100)' },
      },
      required: ['pattern'],
    },
    readOnly: true,
  },
  requiresApproval: () => false,
  execute: async (args: Record<string, unknown>, context?: ToolContext): Promise<ToolResult & any> => {
    const pattern = args.pattern as string;
    if (typeof pattern !== 'string' || !pattern) {
      return { content: 'Error: pattern must be a non-empty string', isError: true };
    }

    const ws = context?.workspaceRoot ? new WorkspaceManager(context.workspaceRoot) : workspaceManager;
    const searchSubpath = (args.path as string) || '.';

    let rootSearchDir: string;
    try {
      rootSearchDir = ws.resolveReal(searchSubpath);
    } catch (e: any) {
      return { content: `Error: ${e.message}`, isError: true };
    }

    if (!fs.existsSync(rootSearchDir)) {
      return { content: `Error: Path not found: ${searchSubpath}`, isError: true };
    }

    const isRegex = Boolean(args.regex);
    let matcher: (line: string) => boolean;

    try {
      if (isRegex) {
        const re = new RegExp(pattern);
        matcher = (line: string) => re.test(line);
      } else {
        matcher = (line: string) => line.includes(pattern);
      }
    } catch (e: any) {
      return { content: `Error: Invalid regex pattern: ${e.message}`, isError: true };
    }

    const maxResults = typeof args.maxResults === 'number' && args.maxResults > 0 ? args.maxResults : 100;
    const gitignoreRules = loadGitignoreRules(ws.root);
    const matches: string[] = [];

    const walk = (currentPath: string) => {
      if (matches.length >= maxResults) return;

      const relFromWs = path.relative(ws.root, currentPath);
      let stats: fs.Stats;
      try {
        stats = fs.statSync(currentPath);
      } catch (err: unknown) {
        const _msg = err instanceof Error ? err.message : String(err);
        return;
      }

      const isDir = stats.isDirectory();
      if (relFromWs && shouldIgnore(relFromWs, isDir, gitignoreRules)) {
        return;
      }

      if (isDir) {
        let entries: string[];
        try {
          entries = fs.readdirSync(currentPath);
        } catch (err: unknown) {
          const _msg = err instanceof Error ? err.message : String(err);
          return;
        }

        for (const entry of entries) {
          if (matches.length >= maxResults) break;
          walk(path.join(currentPath, entry));
        }
      } else if (stats.isFile()) {
        if (args.glob && typeof args.glob === 'string') {
          const ext = args.glob.replace(/^\*/, '');
          if (!currentPath.endsWith(ext)) return;
        }

        try {
          const buf = fs.readFileSync(currentPath);
          if (isBinary(buf)) return;

          const text = buf.toString('utf8');
          const lines = text.split(/\r?\n/);
          const relFilePath = path.relative(ws.root, currentPath).replace(/\\/g, '/');

          for (let i = 0; i < lines.length; i++) {
            if (matcher(lines[i])) {
              matches.push(`${relFilePath}:${i + 1}:${lines[i]}`);
              if (matches.length >= maxResults) {
                break;
              }
            }
          }
        } catch (err: unknown) {
          // Ignore unreadable or locked files
          const _msg = err instanceof Error ? err.message : String(err);
        }
      }
    };

    walk(rootSearchDir);

    let output = matches.join('\n');
    if (matches.length >= maxResults) {
      output += `\n[... matches capped at ${maxResults} results ...]`;
    }

    return {
      content: output || 'No matches found',
      isError: false,
    };
  },
};
