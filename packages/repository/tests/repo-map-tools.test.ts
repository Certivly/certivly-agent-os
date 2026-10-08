import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as path from 'path';
import * as fs from 'fs';
import {
  RepositoryIndexer,
  generateRepoMap,
  findSymbol,
  findReferences,
  repoMapTool,
  findSymbolTool,
  findReferencesTool,
} from '../src';
import { EventStore } from '@agent-os/events';

describe('Action 2.12: Repo Map And Symbol Tools', () => {
  const tmpRepo = path.resolve(__dirname, '.tmp-repo-map-' + Date.now());
  let eventStore: EventStore;
  let indexer: RepositoryIndexer;

  beforeEach(() => {
    fs.mkdirSync(path.join(tmpRepo, 'src', 'approval'), { recursive: true });
    fs.mkdirSync(path.join(tmpRepo, 'src', 'utils'), { recursive: true });

    eventStore = new EventStore(path.join(tmpRepo, 'events.db'));
    indexer = new RepositoryIndexer(eventStore);

    // 1. Approval file with classes, functions, and calls
    fs.writeFileSync(
      path.join(tmpRepo, 'src', 'approval', 'ApprovalCoordinator.ts'),
      `export class ApprovalCoordinator {
  public requestApproval(action: string): boolean {
    return true;
  }
}

export function createApprovalManager(): ApprovalCoordinator {
  return new ApprovalCoordinator();
}
`
    );

    // 2. Caller file calling approval
    fs.writeFileSync(
      path.join(tmpRepo, 'src', 'approval', 'approval-flow.ts'),
      `import { createApprovalManager } from './ApprovalCoordinator';

export function runApprovalFlow(): void {
  const mgr = createApprovalManager();
  mgr.requestApproval("deploy");
}
`
    );

    // 3. Unrelated utils file
    fs.writeFileSync(
      path.join(tmpRepo, 'src', 'utils', 'string-helper.ts'),
      `export function capitalize(s: string): string {
  return s.toUpperCase();
}
`
    );
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpRepo, { recursive: true, force: true });
    } catch {}
  });

  it('1. repo_map("approval") returns approval-related files ranked first', async () => {
    const snapshot = await indexer.indexRepository(tmpRepo);
    const mapOutput = generateRepoMap(snapshot, { query: 'approval' });

    console.log('\n--- Sample repo_map("approval") Output ---');
    console.log(mapOutput);
    console.log('-------------------------------------------\n');

    expect(mapOutput).toContain('ApprovalCoordinator.ts');
    expect(mapOutput).toContain('approval-flow.ts');

    // The approval files must appear before unrelated utils
    const approvalIdx = mapOutput.indexOf('ApprovalCoordinator.ts');
    const utilsIdx = mapOutput.indexOf('string-helper.ts');
    expect(approvalIdx).toBeLessThan(utilsIdx);
  });

  it('2. respects maxTokens token budget', async () => {
    const snapshot = await indexer.indexRepository(tmpRepo);
    // Strict token budget of 50 tokens (~200 chars)
    const mapOutput = generateRepoMap(snapshot, { maxTokens: 50 });

    expect(mapOutput.length).toBeLessThanOrEqual(500);
    expect(mapOutput).toContain('truncated');
  });

  it('3. find_symbol finds known function with metadata and line range', async () => {
    const snapshot = await indexer.indexRepository(tmpRepo);
    const symbols = findSymbol(snapshot, 'createApprovalManager');

    expect(symbols.length).toBeGreaterThan(0);
    const sym = symbols[0];
    expect(sym.name).toBe('createApprovalManager');
    expect(sym.type).toBe('Function');
    expect(sym.filePath).toContain('ApprovalCoordinator.ts');
    expect(sym.startLine).toBeGreaterThan(0);
  });

  it('4. find_references finds caller', async () => {
    const snapshot = await indexer.indexRepository(tmpRepo);
    const refs = findReferences(snapshot, 'createApprovalManager');

    expect(refs.length).toBeGreaterThan(0);
    const ref = refs[0];
    expect(ref.calleeName).toBe('createApprovalManager');
    expect(ref.filePath).toContain('approval-flow.ts');
  });

  it('5. non-exact query terms still match via tokenized BM25 search', async () => {
    const snapshot = await indexer.indexRepository(tmpRepo);
    // Query contains additional term "system coordinator" which doesn't match string exactly
    const mapOutput = generateRepoMap(snapshot, { query: 'system coordinator' });

    expect(mapOutput).toContain('ApprovalCoordinator.ts');
  });

  it('6. executes repo_mapTool, findSymbolTool, and findReferencesTool via WorkspaceTool contract', async () => {
    // repo_map tool
    const repoMapRes = await repoMapTool.execute({ query: 'approval' }, { workspaceRoot: tmpRepo });
    expect(repoMapRes.success).toBe(true);
    expect(repoMapRes.content).toContain('ApprovalCoordinator.ts');

    // find_symbol tool
    const findSymbolRes = await findSymbolTool.execute({ name: 'createApprovalManager' }, { workspaceRoot: tmpRepo });
    expect(findSymbolRes.success).toBe(true);
    expect(findSymbolRes.content).toContain('ApprovalCoordinator.ts');

    // find_references tool
    const findRefsRes = await findReferencesTool.execute({ symbol: 'createApprovalManager' }, { workspaceRoot: tmpRepo });
    expect(findRefsRes.success).toBe(true);
    expect(findRefsRes.content).toContain('approval-flow.ts');
  });
});
