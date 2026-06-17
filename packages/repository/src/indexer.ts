import { Project } from 'ts-morph';
import { EventStore } from '@agent-os/events';
import { metrics } from '@agent-os/metrics';
import { FileGraphBuilder } from './builders/file-builder';
import { SymbolExtractor } from './builders/symbol-builder';
import { DependencyGraphBuilder } from './builders/dependency-builder';
import { CallGraphBuilder } from './builders/call-builder';
import { RepositoryGraphSnapshot, FileNode, SymbolNode, DependencyEdge, CallEdge } from './models';

export class RepositoryIndexer {
  private fileBuilder = new FileGraphBuilder();
  private symbolExtractor = new SymbolExtractor();
  private dependencyBuilder = new DependencyGraphBuilder();
  private callBuilder = new CallGraphBuilder();
  
  private project = new Project();
  
  constructor(private eventStore: EventStore) {}

  public indexRepository(rootDir: string): RepositoryGraphSnapshot {
    const startMs = performance.now();
    
    this.eventStore.append({
      id: crypto.randomUUID(),
      eventType: 'repository.scan.started',
      timestamp: new Date().toISOString(),
      requestId: 'internal',
      sessionId: 'internal',
      source: 'repository',
      payload: { rootDir },
      version: 1
    });

    // 1. File Graph
    const fileNodes = this.fileBuilder.scanDirectory(rootDir, rootDir);
    const filesMap = new Map<string, FileNode>();
    for (const f of fileNodes) filesMap.set(f.fileId, f);
    metrics.counter('files_indexed').inc(fileNodes.length);

    // Filter to TS/JS files for ts-morph parsing
    const codeFiles = fileNodes.filter(f => f.language === 'typescript' || f.language === 'javascript');
    
    // Add all source files to project
    codeFiles.forEach(f => {
      this.project.addSourceFileAtPath(f.fileId);
    });

    const symbolsMap = new Map<string, SymbolNode>();
    const fileSymbolsMap = new Map<string, string[]>();
    const allDependencies: DependencyEdge[] = [];
    const allCalls: CallEdge[] = [];

    // 2. Extract AST components per file
    for (const fileNode of codeFiles) {
      const sourceFile = this.project.getSourceFile(fileNode.fileId);
      if (!sourceFile) continue;

      this.eventStore.append({
        id: crypto.randomUUID(),
        eventType: 'repository.file.discovered',
        timestamp: new Date().toISOString(),
        requestId: 'internal',
        sessionId: 'internal',
        source: 'repository',
        payload: { fileId: fileNode.fileId },
        version: 1
      });

      // Symbols
      const symbols = this.symbolExtractor.extractSymbols(sourceFile, fileNode.fileId);
      fileSymbolsMap.set(fileNode.fileId, symbols.map(s => s.symbolId));
      for (const s of symbols) {
        symbolsMap.set(s.symbolId, s);
        
        this.eventStore.append({
          id: crypto.randomUUID(),
          eventType: 'repository.symbol.discovered',
          timestamp: new Date().toISOString(),
          requestId: 'internal',
          sessionId: 'internal',
          source: 'repository',
          payload: { symbolId: s.symbolId, type: s.type },
          version: 1
        });
      }
      metrics.counter('symbols_extracted').inc(symbols.length);

      // Dependencies
      const deps = this.dependencyBuilder.extractDependencies(sourceFile, fileNode.fileId);
      allDependencies.push(...deps);
      if (deps.length > 0) {
        this.eventStore.append({
          id: crypto.randomUUID(),
          eventType: 'repository.dependency.discovered',
          timestamp: new Date().toISOString(),
          requestId: 'internal',
          sessionId: 'internal',
          source: 'repository',
          payload: { sourceFileId: fileNode.fileId, count: deps.length },
          version: 1
        });
      }
      metrics.counter('dependencies_found').inc(deps.length);

      // Calls
      const calls = this.callBuilder.extractCallEdges(sourceFile, fileNode.fileId);
      allCalls.push(...calls);
      if (calls.length > 0) {
        this.eventStore.append({
          id: crypto.randomUUID(),
          eventType: 'repository.call.discovered',
          timestamp: new Date().toISOString(),
          requestId: 'internal',
          sessionId: 'internal',
          source: 'repository',
          payload: { sourceFileId: fileNode.fileId, count: calls.length },
          version: 1
        });
      }
      metrics.counter('call_edges_found').inc(calls.length);
    }

    const duration = performance.now() - startMs;
    // @ts-ignore
    if (metrics.histogram) metrics.histogram('repository_scan_duration').observe(duration);

    this.eventStore.append({
      id: crypto.randomUUID(),
      eventType: 'repository.scan.completed',
      timestamp: new Date().toISOString(),
      requestId: 'internal',
      sessionId: 'internal',
      source: 'repository',
      payload: { rootDir, durationMs: duration },
      version: 1
    });

    return {
      version: 1,
      timestamp: new Date().toISOString(),
      files: filesMap,
      symbols: symbolsMap,
      dependencies: allDependencies,
      calls: allCalls,
      fileSymbols: fileSymbolsMap,
      symbolDefinitions: symbolsMap
    };
  }
}
