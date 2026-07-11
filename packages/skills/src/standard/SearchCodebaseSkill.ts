import { Skill, SkillContext, SkillResult, SkillLevel } from '../models';

export interface SearchCodebaseInput {
  query: string;
  maxResults?: number;
}

/**
 * SearchCodebaseSkill — ANALYZE-level skill that searches the repository graph
 * for files and symbols matching a query string.
 * Uses the RepositoryGraphSnapshot from SkillContext (no I/O required).
 */
export class SearchCodebaseSkill implements Skill {
  readonly id = 'SearchCodebaseSkill';
  readonly name = 'Search Codebase';
  readonly version = 1;
  readonly level = SkillLevel.ANALYZE;
  readonly inputSchema = {
    query: 'string',
    maxResults: 'number?'
  };
  readonly outputSchema = {
    files: 'string[]',
    symbols: 'string[]',
    matchCount: 'number'
  };
  readonly requires = [];

  public async execute(ctx: SkillContext, input: SearchCodebaseInput): Promise<SkillResult> {
    const query = (input?.query ?? '').toLowerCase();
    const maxResults = input?.maxResults ?? 20;
    const graph = ctx.repository;

    const matchedFiles: string[] = [];
    const matchedSymbols: string[] = [];

    if (query) {
      // Search file paths
      for (const [fileId, fileNode] of graph.files) {
        const filePath: string = (fileNode as any).path ?? fileId;
        if (filePath.toLowerCase().includes(query)) {
          matchedFiles.push(filePath);
          if (matchedFiles.length >= maxResults) break;
        }
      }

      // Search symbol names
      for (const [, symbolNode] of graph.symbols) {
        const symName: string = (symbolNode as any).name ?? '';
        if (symName.toLowerCase().includes(query)) {
          matchedSymbols.push(symName);
          if (matchedSymbols.length >= maxResults) break;
        }
      }
    }

    return {
      success: true,
      data: {
        query,
        files: matchedFiles,
        symbols: matchedSymbols,
        matchCount: matchedFiles.length + matchedSymbols.length
      },
      events: [],
      wicerReferences: [],
      graphReferences: matchedFiles.slice(0, 5),
      narrativeHints: {
        activity: `Found ${matchedFiles.length} files and ${matchedSymbols.length} symbols matching "${query}"`,
        phase: 'SEARCH'
      }
    };
  }
}
