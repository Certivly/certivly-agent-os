import * as path from 'path';
import type { WorkspaceTool, ToolContext, ToolResult } from '../types';
import { WorkspaceManager, workspaceManager } from '../workspace';
import {
  getOrCreateIndexSnapshot,
  RepositoryGraphSnapshot,
  rankFiles,
} from '@agent-os/repository';

export interface IndexerCacheEntry {
  snapshot: RepositoryGraphSnapshot;
  buildCount: number;
}

export const indexerMap = new Map<string, IndexerCacheEntry>();

export const repoMapTool: WorkspaceTool = {
  spec: {
    name: 'repo_map',
    description: 'Build a token-budgeted map of the repository ranked by a query. Returns file paths, top-level symbols, and import summaries relevant to the query.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search term or query to rank relevance (e.g. "approval flow", "sandbox worktree")',
        },
        maxTokens: {
          type: 'number',
          description: 'Token budget for returned map (default 4000)',
        },
        maxFiles: {
          type: 'number',
          description: 'Maximum number of ranked files to include (default 20)',
        },
      },
      required: [],
    },
    readOnly: true,
  },
  requiresApproval: () => false,
  execute: async (args: Record<string, unknown>, context?: ToolContext): Promise<ToolResult & { output: string }> => {
    const ws = context?.workspaceRoot ? new WorkspaceManager(context.workspaceRoot) : workspaceManager;
    const workspaceRoot = ws.root;

    let entry = indexerMap.get(workspaceRoot);
    if (!entry) {
      const snapshot = await getOrCreateIndexSnapshot(workspaceRoot);
      entry = { snapshot, buildCount: 1 };
      indexerMap.set(workspaceRoot, entry);
    }

    if (!entry.snapshot || entry.snapshot.files.size === 0) {
      return {
        content: 'No matching files found.',
        output: 'No matching files found.',
        isError: false,
      };
    }

    const query = typeof args.query === 'string' ? args.query.trim() : undefined;
    const maxTokens = typeof args.maxTokens === 'number' && args.maxTokens > 0 ? args.maxTokens : 4000;
    const maxFiles = typeof args.maxFiles === 'number' && args.maxFiles > 0 ? args.maxFiles : 20;

    const ranked = rankFiles(entry.snapshot, { query });
    if (ranked.length === 0) {
      return {
        content: 'No matching files found.',
        output: 'No matching files found.',
        isError: false,
      };
    }

    const lines: string[] = [];
    if (query) {
      lines.push(`## Repository Map (query: "${query}")\n`);
    } else {
      lines.push(`## Repository Map\n`);
    }

    const maxChars = maxTokens * 4;
    let currentLength = lines.join('\n').length;
    let truncated = false;

    const filesToInclude = ranked.slice(0, maxFiles);
    for (const rf of filesToInclude) {
      const symbolIds = entry.snapshot.fileSymbols.get(rf.fileId) || [];
      const symbols = symbolIds.map((id) => entry.snapshot.symbols.get(id)).filter(Boolean);

      let line = `- ${rf.relPath}`;
      if (symbols.length > 0) {
        const symDescriptions = symbols
          .slice(0, 5)
          .map((s: any) => `${s.type.toLowerCase()} ${s.name}`)
          .join(', ');
        line += ` — ${symDescriptions}`;
      }

      if (currentLength + line.length + 1 > maxChars && lines.length > 1) {
        truncated = true;
        break;
      }

      lines.push(line);
      currentLength += line.length + 1;
    }

    let output = lines.join('\n');
    if (truncated) {
      output += '\n...(truncated, use read_file for full content)';
    }

    return {
      content: output,
      output,
      isError: false,
    };
  },
};
