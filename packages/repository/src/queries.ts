import { RepositoryGraphSnapshot, FileNode, SymbolNode, DependencyEdge, CallEdge } from './models';

export class RepositoryQueryEngine {
  constructor(private snapshot: RepositoryGraphSnapshot) {}

  public getFileGraph(): Map<string, FileNode> {
    return this.snapshot.files;
  }

  public getSymbolGraph(): Map<string, SymbolNode> {
    return this.snapshot.symbols;
  }

  public getDependencyGraph(): DependencyEdge[] {
    return this.snapshot.dependencies;
  }

  public getCallGraph(): CallEdge[] {
    return this.snapshot.calls;
  }

  public findSymbolByName(name: string): SymbolNode[] {
    const results: SymbolNode[] = [];
    for (const symbol of this.snapshot.symbols.values()) {
      if (symbol.name === name) {
        results.push(symbol);
      }
    }
    return results;
  }

  public findFileByPath(partialPath: string): FileNode | undefined {
    for (const [fileId, node] of this.snapshot.files.entries()) {
      if (fileId.includes(partialPath) || node.path.includes(partialPath)) {
        return node;
      }
    }
    return undefined;
  }

  public getDependenciesOfFile(fileId: string): DependencyEdge[] {
    return this.snapshot.dependencies.filter(d => d.sourceFileId === fileId);
  }

  public getCallersOfFunction(calleeSymbolId: string): CallEdge[] {
    return this.snapshot.calls.filter(c => c.calleeSymbolId === calleeSymbolId);
  }
}
