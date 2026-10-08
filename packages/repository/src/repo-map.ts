import * as path from 'path';
import { RepositoryGraphSnapshot, SymbolNode, DependencyEdge, CallEdge } from './models';
import { RepositoryIndexer } from './indexer';
import { EventStore } from '@agent-os/events';

export interface SymbolQueryResult {
  name: string;
  type: string;
  filePath: string;
  startLine: number;
  endLine: number;
  lineRange: string;
  signature: string;
  visibility: string;
  callers: string[];
  callees: string[];
}

export interface ReferenceQueryResult {
  callerSymbolId: string;
  calleeName: string;
  filePath: string;
  line: number;
}

export function tokenizeQuery(query: string): string[] {
  if (!query) return [];
  return query
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-zA-Z0-9_]+/)
    .filter(t => t.length > 1);
}

export function computeCentralityScores(snapshot: RepositoryGraphSnapshot): Map<string, number> {
  const scores = new Map<string, number>();

  for (const fileId of snapshot.files.keys()) {
    scores.set(fileId, 1.0);
  }

  // Count dependencies
  for (const dep of snapshot.dependencies) {
    scores.set(dep.sourceFileId, (scores.get(dep.sourceFileId) || 1.0) + 1.0);
    if (snapshot.files.has(dep.targetFileId)) {
      scores.set(dep.targetFileId, (scores.get(dep.targetFileId) || 1.0) + 2.0);
    }
  }

  // Count call edges
  for (const call of snapshot.calls) {
    if (snapshot.files.has(call.filePath)) {
      scores.set(call.filePath, (scores.get(call.filePath) || 1.0) + 1.5);
    }
  }

  return scores;
}

export interface RepoMapOptions {
  query?: string;
  maxTokens?: number;
  recentFiles?: string[];
}

export interface RankedFile {
  fileId: string;
  relPath: string;
  score: number;
}

export function rankFiles(
  snapshot: RepositoryGraphSnapshot,
  options?: RepoMapOptions
): RankedFile[] {
  const queryTokens = options?.query ? tokenizeQuery(options.query) : [];
  const queryLower = options?.query?.toLowerCase() || '';
  const recentFiles = options?.recentFiles || [];
  const centralityScores = computeCentralityScores(snapshot);

  const rankedFiles: RankedFile[] = [];

  for (const [fileId, fileNode] of snapshot.files.entries()) {
    let score = centralityScores.get(fileId) || 1.0;
    const relPath = fileNode.path;
    const relPathLower = relPath.toLowerCase();
    const baseNameLower = path.basename(relPath, path.extname(relPath)).toLowerCase();

    // 1. Recency Signal
    if (
      recentFiles.includes(fileId) ||
      recentFiles.includes(relPath) ||
      recentFiles.some((rf) => rf.toLowerCase() === relPathLower)
    ) {
      score += 30.0;
    }

    // 2. Test Affinity Signal
    // Check if query or recent files reference a test file related to this source file, or vice versa
    const ext = path.extname(relPathLower);
    const withoutExt = relPathLower.slice(0, -ext.length);
    const isTestFile = withoutExt.endsWith('.test') || withoutExt.endsWith('.spec') || relPathLower.includes('/__tests__/');

    if (!isTestFile) {
      // Source file: check if its test counterpart is in query or recentFiles
      const testNames = [
        `${baseNameLower}.test`,
        `${baseNameLower}.spec`,
        `${withoutExt}.test`,
        `${withoutExt}.spec`,
      ];
      const testReferenced = testNames.some(
        (t) =>
          queryLower.includes(t) ||
          recentFiles.some((rf) => rf.toLowerCase().includes(t))
      );
      if (testReferenced) {
        score += 35.0;
      }
    } else {
      // Test file: check if its source counterpart is in query or recentFiles
      const sourceBase = baseNameLower.replace(/\.(test|spec)$/, '');
      if (
        queryLower.includes(sourceBase) ||
        recentFiles.some((rf) => rf.toLowerCase().includes(sourceBase))
      ) {
        score += 25.0;
      }
    }

    // 3. Text Match Signals (BM25-like)
    if (queryTokens.length > 0) {
      let queryMatchBonus = 0;

      for (const token of queryTokens) {
        // Path match
        if (baseNameLower === token) {
          queryMatchBonus += 40.0;
        } else if (baseNameLower.includes(token)) {
          queryMatchBonus += 15.0;
        } else if (relPathLower.includes(token)) {
          queryMatchBonus += 5.0;
        }

        // Symbol names in this file
        const symbolIds = snapshot.fileSymbols.get(fileId) || [];
        for (const sId of symbolIds) {
          const sym = snapshot.symbols.get(sId);
          if (sym) {
            const symNameLower = sym.name.toLowerCase();
            const isExported = sym.visibility === 'public';

            if (symNameLower === token) {
              // Exact symbol match gives a decisive boost
              queryMatchBonus += 60.0;
              if (isExported) {
                queryMatchBonus += 25.0;
              }
            } else if (symNameLower.startsWith(token) || symNameLower.endsWith(token)) {
              queryMatchBonus += 20.0;
            } else if (symNameLower.includes(token)) {
              queryMatchBonus += 10.0;
            }
          }
        }

        // Imports / Dependencies match
        const fileDeps = snapshot.dependencies.filter((d) => d.sourceFileId === fileId);
        for (const dep of fileDeps) {
          const targetBase = path.basename(dep.targetFileId).toLowerCase();
          if (targetBase.includes(token)) {
            queryMatchBonus += 10.0;
          }
        }
      }

      score += queryMatchBonus;
    }

    rankedFiles.push({ fileId, relPath, score });
  }

  // Deterministic tie-breaking: score descending, then relative path ascending
  rankedFiles.sort((a, b) => b.score - a.score || a.relPath.localeCompare(b.relPath));

  return rankedFiles;
}

export function generateRepoMap(
  snapshot: RepositoryGraphSnapshot,
  options?: RepoMapOptions
): string {
  const maxTokens = options?.maxTokens || 2048;
  const maxChars = maxTokens * 4;

  const rankedFiles = rankFiles(snapshot, options);

  const outputSections: string[] = [];
  let currentLength = 0;

  for (const rf of rankedFiles) {
    const symbolIds = snapshot.fileSymbols.get(rf.fileId) || [];
    const symbols = symbolIds.map(id => snapshot.symbols.get(id)).filter(Boolean) as SymbolNode[];

    const lines: string[] = [];
    lines.push(`## ${rf.relPath}`);

    // Dependencies hint
    const fileDeps = snapshot.dependencies.filter(d => d.sourceFileId === rf.fileId);
    if (fileDeps.length > 0) {
      const depTargets = fileDeps.map(d => path.basename(d.targetFileId)).slice(0, 5).join(', ');
      lines.push(`  imports: ${depTargets}`);
    }

    // Symbols
    for (const sym of symbols) {
      const sig = sym.signature ? sym.signature.trim() : `${sym.type.toLowerCase()} ${sym.name}`;
      lines.push(`  ${sig} (lines ${sym.startLine}-${sym.endLine})`);
    }

    const sectionText = lines.join('\n');
    if (currentLength + sectionText.length > maxChars && outputSections.length > 0) {
      outputSections.push(`\n... [remaining files truncated to fit token budget] ...`);
      break;
    }

    outputSections.push(sectionText);
    currentLength += sectionText.length + 2;
  }

  return outputSections.join('\n\n');
}

export function findSymbol(snapshot: RepositoryGraphSnapshot, name: string): SymbolQueryResult[] {
  const nameLower = name.trim().toLowerCase();
  const results: SymbolQueryResult[] = [];

  for (const sym of snapshot.symbols.values()) {
    if (sym.name.toLowerCase() === nameLower || sym.name.toLowerCase().includes(nameLower)) {
      // Find callers
      const callers: string[] = [];
      for (const call of snapshot.calls) {
        if (call.calleeName.toLowerCase() === sym.name.toLowerCase() || call.calleeSymbolId === sym.symbolId) {
          if (!callers.includes(call.callerSymbolId)) {
            callers.push(call.callerSymbolId);
          }
        }
      }

      // Find callees from this symbol's file
      const callees: string[] = [];
      for (const call of snapshot.calls) {
        if (call.callerSymbolId === sym.symbolId) {
          if (!callees.includes(call.calleeName)) {
            callees.push(call.calleeName);
          }
        }
      }

      results.push({
        name: sym.name,
        type: sym.type,
        filePath: sym.filePath,
        startLine: sym.startLine,
        endLine: sym.endLine,
        lineRange: `${sym.startLine}-${sym.endLine}`,
        signature: sym.signature,
        visibility: sym.visibility,
        callers,
        callees,
      });
    }
  }

  results.sort((a, b) => a.filePath.localeCompare(b.filePath) || a.startLine - b.startLine);
  return results;
}

export function findReferences(snapshot: RepositoryGraphSnapshot, symbol: string): ReferenceQueryResult[] {
  const symLower = symbol.trim().toLowerCase();
  const references: ReferenceQueryResult[] = [];

  for (const call of snapshot.calls) {
    if (call.calleeName.toLowerCase() === symLower || call.calleeSymbolId.toLowerCase().includes(symLower)) {
      references.push({
        callerSymbolId: call.callerSymbolId,
        calleeName: call.calleeName,
        filePath: call.filePath,
        line: call.line,
      });
    }
  }

  references.sort((a, b) => a.filePath.localeCompare(b.filePath) || a.line - b.line);
  return references;
}

// Global cached snapshots for workspace roots
const indexerCache = new Map<string, { snapshot: RepositoryGraphSnapshot; timestamp: number }>();

export async function getOrCreateIndexSnapshot(workspaceRoot: string): Promise<RepositoryGraphSnapshot> {
  const cached = indexerCache.get(workspaceRoot);
  const now = Date.now();
  if (cached && now - cached.timestamp < 30_000) {
    return cached.snapshot;
  }

  const eventStore = new EventStore(path.join(workspaceRoot, '.agentos', 'events.db'));
  const indexer = new RepositoryIndexer(eventStore);
  const snapshot = await indexer.indexRepository(workspaceRoot);
  indexerCache.set(workspaceRoot, { snapshot, timestamp: now });
  return snapshot;
}

export const repoMapTool = {
  name: 'repo_map',
  description: 'Generate ranked repo map showing relevant files, symbols, signatures, and dependencies',
  spec: {
    name: 'repo_map',
    description: 'Get ranked structural map of workspace files, symbols, signatures, and dependency relationships',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search term or query to rank relevance (optional)' },
        maxTokens: { type: 'number', description: 'Token budget for returned map (default 2048)' },
      },
    },
    readOnly: true,
  },
  requiresApproval: () => false,
  execute: async (args: Record<string, unknown>, context?: { workspaceRoot: string }): Promise<{ success: boolean; content: string; data?: any; isError?: boolean }> => {
    const ws = context?.workspaceRoot || process.cwd();
    const snapshot = await getOrCreateIndexSnapshot(ws);
    const content = generateRepoMap(snapshot, {
      query: args.query as string | undefined,
      maxTokens: typeof args.maxTokens === 'number' ? args.maxTokens : undefined,
    });
    return {
      success: true,
      content,
      isError: false,
    };
  },
};

export const findSymbolTool = {
  name: 'find_symbol',
  description: 'Find definitions, signatures, line ranges, and callers for a symbol',
  spec: {
    name: 'find_symbol',
    description: 'Find symbol definitions, kind, file path, line range, and callers/callees',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of function, class, interface, or type' },
      },
      required: ['name'],
    },
    readOnly: true,
  },
  requiresApproval: () => false,
  execute: async (args: Record<string, unknown>, context?: { workspaceRoot: string }): Promise<{ success: boolean; content: string; data?: any; isError?: boolean }> => {
    const name = args.name as string;
    if (!name) return { success: false, content: 'Symbol name is required', isError: true };

    const ws = context?.workspaceRoot || process.cwd();
    const snapshot = await getOrCreateIndexSnapshot(ws);
    const symbols = findSymbol(snapshot, name);

    if (symbols.length === 0) {
      return { success: true, content: `No symbols found matching '${name}'`, data: [] };
    }

    const formatted = symbols.map(s =>
      `Symbol: ${s.name} (${s.type})\nFile: ${s.filePath}:${s.lineRange}\nSignature: ${s.signature}\nCallers: ${s.callers.join(', ') || 'none'}\nCallees: ${s.callees.join(', ') || 'none'}`
    ).join('\n\n');

    return {
      success: true,
      content: formatted,
      data: symbols,
      isError: false,
    };
  },
};

export const findReferencesTool = {
  name: 'find_references',
  description: 'Find references and call sites for a symbol',
  spec: {
    name: 'find_references',
    description: 'Find call sites and references to a symbol across the repository',
    parameters: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Symbol name to search references for' },
      },
      required: ['symbol'],
    },
    readOnly: true,
  },
  requiresApproval: () => false,
  execute: async (args: Record<string, unknown>, context?: { workspaceRoot: string }): Promise<{ success: boolean; content: string; data?: any; isError?: boolean }> => {
    const symbol = args.symbol as string;
    if (!symbol) return { success: false, content: 'Symbol name is required', isError: true };

    const ws = context?.workspaceRoot || process.cwd();
    const snapshot = await getOrCreateIndexSnapshot(ws);
    const refs = findReferences(snapshot, symbol);

    if (refs.length === 0) {
      return { success: true, content: `No references found for '${symbol}'`, data: [] };
    }

    const formatted = refs.map(r =>
      `${r.filePath}:${r.line} in caller '${r.callerSymbolId}' -> calls ${r.calleeName}`
    ).join('\n');

    return {
      success: true,
      content: formatted,
      data: refs,
      isError: false,
    };
  },
};
