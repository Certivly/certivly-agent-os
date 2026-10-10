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

export const listDirTool: WorkspaceTool & Tool = {
  name: 'list_dir',
  description: 'List contents of directory up to depth',
  spec: {
    name: 'list_dir',
    description: 'List contents of a directory in the workspace with depth and ignore rules',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory path (default ".")' },
        depth: { type: 'number', description: 'Maximum depth to traverse (default 1)' },
      },
    },
    readOnly: true,
  },
  requiresApproval: () => false,
  execute: async (args: Record<string, unknown>, context?: ToolContext): Promise<ToolResult & any> => {
    const rawPath = (args.path as string) || '.';
    const depth = typeof args.depth === 'number' && args.depth >= 0 ? args.depth : 1;

    const ws = context?.workspaceRoot ? new WorkspaceManager(context.workspaceRoot) : workspaceManager;

    let targetDir: string;
    try {
      targetDir = ws.resolveReal(rawPath);
    } catch (e: any) {
      return { content: `Error: ${e.message}`, isError: true };
    }

    if (!fs.existsSync(targetDir)) {
      return { content: `Error: Directory not found: ${rawPath}`, isError: true };
    }

    const stats = fs.statSync(targetDir);
    if (!stats.isDirectory()) {
      return { content: `Error: Path is not a directory: ${rawPath}`, isError: true };
    }

    const gitignoreRules = loadGitignoreRules(ws.root);
    const entries: string[] = [];
    const maxEntries = 500;

    const walk = (currentDir: string, currentDepth: number) => {
      if (entries.length >= maxEntries) return;
      if (currentDepth > depth) return;

      let dirEntries: fs.Dirent[];
      try {
        dirEntries = fs.readdirSync(currentDir, { withFileTypes: true });
      } catch (err: unknown) {
        const _msg = err instanceof Error ? err.message : String(err);
        return;
      }

      // Sort entries alphabetically
      dirEntries.sort((a, b) => a.name.localeCompare(b.name));

      for (const entry of dirEntries) {
        if (entries.length >= maxEntries) break;

        const fullPath = path.join(currentDir, entry.name);
        const relPath = path.relative(targetDir, fullPath).replace(/\\/g, '/');
        const relFromWs = path.relative(ws.root, fullPath);

        const isDir = entry.isDirectory();
        if (shouldIgnore(relFromWs, isDir, gitignoreRules)) {
          continue;
        }

        const displayPath = isDir ? `${relPath}/` : relPath;
        entries.push(displayPath);

        if (isDir && currentDepth < depth) {
          walk(fullPath, currentDepth + 1);
        }
      }
    };

    walk(targetDir, 1);

    let output = entries.join('\n');
    if (entries.length >= maxEntries) {
      output += `\n[... directory listing capped at ${maxEntries} entries ...]`;
    }

    return {
      content: output,
      isError: false,
    };
  },
};
