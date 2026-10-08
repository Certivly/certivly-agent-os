import { describe, it, expect } from 'bun:test';
import { rankFiles, generateRepoMap } from '../src/repo-map';
import type { RepositoryGraphSnapshot, FileNode, SymbolNode, DependencyEdge, CallEdge } from '../src/models';

function createMockSnapshot(): RepositoryGraphSnapshot {
  const files = new Map<string, FileNode>();
  const symbols = new Map<string, SymbolNode>();
  const fileSymbols = new Map<string, string[]>();
  const dependencies: DependencyEdge[] = [];
  const calls: CallEdge[] = [];

  // Helper to add file
  const addFile = (id: string, relPath: string) => {
    files.set(id, {
      fileId: id,
      path: relPath,
      extension: 'ts',
      language: 'typescript',
      size: 100,
      hash: 'hash_' + id,
      lastModified: Date.now(),
      parentDirectory: 'src',
      imports: [],
    });
    fileSymbols.set(id, []);
  };

  // Helper to add symbol
  const addSymbol = (sym: SymbolNode) => {
    symbols.set(sym.symbolId, sym);
    const existing = fileSymbols.get(sym.filePath) || [];
    existing.push(sym.symbolId);
    fileSymbols.set(sym.filePath, existing);
  };

  // 1. Central file: utils.ts imported by many files
  addFile('f_utils', 'src/utils.ts');
  addFile('f_app', 'src/app.ts');
  addFile('f_service', 'src/service.ts');
  addFile('f_controller', 'src/controller.ts');

  // 2. Specific feature file: auth.ts with exact symbol authenticateUser
  addFile('f_auth', 'src/auth.ts');
  addSymbol({
    symbolId: 'sym_auth',
    name: 'authenticateUser',
    type: 'Function',
    filePath: 'f_auth',
    startLine: 1,
    endLine: 10,
    signature: 'function authenticateUser()',
    visibility: 'public',
  });

  // 3. Test pair: payment.ts and payment.test.ts
  addFile('f_payment', 'src/payment.ts');
  addFile('f_payment_test', 'src/payment.test.ts');

  // Many dependencies pointing to utils.ts (making it very central)
  dependencies.push({ sourceFileId: 'f_app', targetFileId: 'f_utils', importStatement: "import './utils'" });
  dependencies.push({ sourceFileId: 'f_service', targetFileId: 'f_utils', importStatement: "import './utils'" });
  dependencies.push({ sourceFileId: 'f_controller', targetFileId: 'f_utils', importStatement: "import './utils'" });

  return {
    version: 1,
    timestamp: new Date().toISOString(),
    files,
    symbols,
    fileSymbols,
    symbolDefinitions: new Map(),
    dependencies,
    calls,
  };
}

describe('Repo Map Ranking Signals', () => {
  it('1. exact symbol match beats unrelated central file', () => {
    const snapshot = createMockSnapshot();

    // Query for authenticateUser
    const ranked = rankFiles(snapshot, { query: 'authenticateUser' });

    expect(ranked[0].fileId).toBe('f_auth');
    expect(ranked[0].relPath).toBe('src/auth.ts');

    // Central utils.ts should be ranked lower than the exact match
    const utilsRank = ranked.findIndex((f) => f.fileId === 'f_utils');
    expect(utilsRank).toBeGreaterThan(0);
  });

  it('2. centrality breaks ties when queries do not match', () => {
    const snapshot = createMockSnapshot();

    // Without a specific query, central files should rank higher than unreferenced files
    const ranked = rankFiles(snapshot);

    // f_utils has 3 incoming dependency edges, so it should rank first among non-query files
    expect(ranked[0].fileId).toBe('f_utils');
  });

  it('3. test affinity boosts matching source', () => {
    const snapshot = createMockSnapshot();

    // Query mentioning payment.test.ts
    const ranked = rankFiles(snapshot, { query: 'debugging payment.test.ts failure' });

    // Both payment.test.ts and src/payment.ts should receive strong boosts
    const paymentSourceIndex = ranked.findIndex((f) => f.fileId === 'f_payment');
    expect(paymentSourceIndex).toBeLessThanOrEqual(1); // top 2
  });

  it('4. token budget respected by generateRepoMap', () => {
    const snapshot = createMockSnapshot();

    // Set very small token budget (e.g. 50 tokens = ~200 chars)
    const map = generateRepoMap(snapshot, { maxTokens: 50 });

    expect(map).toContain('... [remaining files truncated to fit token budget] ...');
    expect(map.length).toBeLessThan(1000);
  });

  it('5. ranking is deterministic across multiple calls with ties', () => {
    const snapshot = createMockSnapshot();

    const run1 = rankFiles(snapshot, { query: 'test' });
    const run2 = rankFiles(snapshot, { query: 'test' });

    expect(run1.map((r) => r.relPath)).toEqual(run2.map((r) => r.relPath));
    expect(run1.map((r) => r.score)).toEqual(run2.map((r) => r.score));
  });
});
