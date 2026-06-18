import { RepositoryGraphSnapshot } from './models';

export type RepositoryGraphDiff = {
  symbolsAdded: string[];
  symbolsRemoved: string[];

  dependenciesAdded: string[];
  dependenciesRemoved: string[];

  callsAdded: string[];
  callsRemoved: string[];
};

export class GraphDiffEngine {
  public static computeDiff(before: RepositoryGraphSnapshot, after: RepositoryGraphSnapshot): RepositoryGraphDiff {
    const symbolsAdded = Array.from(after.symbols.keys()).filter(id => !before.symbols.has(id));
    const symbolsRemoved = Array.from(before.symbols.keys()).filter(id => !after.symbols.has(id));

    const beforeDeps = new Set(before.dependencies.map(d => `${d.sourceFileId}->${d.targetFileId}`));
    const afterDeps = new Set(after.dependencies.map(d => `${d.sourceFileId}->${d.targetFileId}`));
    
    const dependenciesAdded = Array.from(afterDeps).filter(d => !beforeDeps.has(d));
    const dependenciesRemoved = Array.from(beforeDeps).filter(d => !afterDeps.has(d));

    const beforeCalls = new Set(before.calls.map(c => `${c.callerSymbolId}->${c.calleeName}`));
    const afterCalls = new Set(after.calls.map(c => `${c.callerSymbolId}->${c.calleeName}`));

    const callsAdded = Array.from(afterCalls).filter(c => !beforeCalls.has(c));
    const callsRemoved = Array.from(beforeCalls).filter(c => !afterCalls.has(c));

    return {
      symbolsAdded,
      symbolsRemoved,
      dependenciesAdded,
      dependenciesRemoved,
      callsAdded,
      callsRemoved
    };
  }
}
