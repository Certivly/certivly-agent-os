import * as path from 'path';
import type { WorkspaceTool, ToolContext, ToolResult } from '../types';
import { WorkspaceManager, workspaceManager } from '../workspace';
import {
  getOrCreateIndexSnapshot,
  RepositoryGraphSnapshot,
  RepositoryQueryEngine,
  SymbolNode,
} from '@agent-os/repository';
import { indexerMap } from './repo_map';

export const searchSymbolsTool: WorkspaceTool = {
  spec: {
    name: 'search_symbols',
    description: 'Search symbol definitions (functions, classes, methods, interfaces, types, enums) and call-graph references in the repository using the AST symbol graph.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Symbol name or pattern to search for (e.g. "AgentRuntime", "verifyToken", "execute")',
        },
        kind: {
          type: 'string',
          enum: ['Class', 'Function', 'Method', 'Interface', 'Type', 'Enum'],
          description: 'Optional symbol type filter (e.g. "Class", "Function", "Interface")',
        },
        filePath: {
          type: 'string',
          description: 'Optional file path or substring to restrict results to (e.g. "src/auth")',
        },
        includeCallers: {
          type: 'boolean',
          description: 'Whether to include callers/references of the matched symbols from the call graph (default: false)',
        },
        maxResults: {
          type: 'number',
          description: 'Maximum number of results to return (default: 25)',
        },
      },
      required: ['query'],
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

    if (!entry.snapshot || entry.snapshot.symbols.size === 0) {
      const msg = 'No symbols found in repository index.';
      return { content: msg, output: msg, isError: false };
    }

    const queryRaw = typeof args.query === 'string' ? args.query.trim() : '';
    if (!queryRaw) {
      const msg = 'Query must be a non-empty string.';
      return { content: msg, output: msg, isError: true };
    }

    const queryLower = queryRaw.toLowerCase();
    const kindFilter = typeof args.kind === 'string' ? args.kind.toLowerCase() : undefined;
    const filePathFilter = typeof args.filePath === 'string' ? args.filePath.toLowerCase().replace(/\\/g, '/') : undefined;
    const includeCallers = Boolean(args.includeCallers);
    const maxResults = typeof args.maxResults === 'number' && args.maxResults > 0 ? args.maxResults : 25;

    const matchedSymbols: SymbolNode[] = [];

    for (const symbol of entry.snapshot.symbols.values()) {
      const symNameLower = symbol.name.toLowerCase();
      if (!symNameLower.includes(queryLower)) {
        continue;
      }
      if (kindFilter && symbol.type.toLowerCase() !== kindFilter) {
        continue;
      }
      const normSymPath = symbol.filePath.replace(/\\/g, '/').toLowerCase();
      if (filePathFilter && !normSymPath.includes(filePathFilter)) {
        continue;
      }
      matchedSymbols.push(symbol);
    }

    if (matchedSymbols.length === 0) {
      const msg = `No symbols matching "${queryRaw}" found.`;
      return { content: msg, output: msg, isError: false };
    }

    // Sort exact match first, then prefix match, then short names
    matchedSymbols.sort((a, b) => {
      const aExact = a.name.toLowerCase() === queryLower;
      const bExact = b.name.toLowerCase() === queryLower;
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;

      const aPrefix = a.name.toLowerCase().startsWith(queryLower);
      const bPrefix = b.name.toLowerCase().startsWith(queryLower);
      if (aPrefix && !bPrefix) return -1;
      if (!aPrefix && bPrefix) return 1;

      return a.name.length - b.name.length;
    });

    const queryEngine = new RepositoryQueryEngine(entry.snapshot);
    const selected = matchedSymbols.slice(0, maxResults);

    const lines: string[] = [];
    lines.push(`## Symbols matching "${queryRaw}" (${selected.length} of ${matchedSymbols.length} shown)\n`);

    for (const sym of selected) {
      const relPath = path.relative(workspaceRoot, sym.filePath).replace(/\\/g, '/');
      lines.push(`- **${sym.type} \`${sym.name}\`**`);
      lines.push(`  - File: \`${relPath}:${sym.startLine}-${sym.endLine}\``);
      if (sym.signature) {
        lines.push(`  - Signature: \`${sym.signature}\``);
      }
      if (sym.visibility && sym.visibility !== 'unknown') {
        lines.push(`  - Visibility: ${sym.visibility}`);
      }

      if (includeCallers) {
        const callers = queryEngine.getCallersOfFunction(sym.symbolId);
        if (callers && callers.length > 0) {
          lines.push(`  - Callers (${callers.length}):`);
          for (const c of callers.slice(0, 5)) {
            const callerRel = path.relative(workspaceRoot, c.filePath).replace(/\\/g, '/');
            lines.push(`    - \`${callerRel}:${c.line}\``);
          }
          if (callers.length > 5) {
            lines.push(`    - ... and ${callers.length - 5} more`);
          }
        }
      }
      lines.push('');
    }

    const output = lines.join('\n').trim();
    return {
      content: output,
      output,
      isError: false,
    };
  },
};
