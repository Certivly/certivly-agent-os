import * as fs from 'fs';
import { EventStore } from '@agent-os/events';
import { metrics } from '@agent-os/metrics';
import { FileGraphBuilder } from './builders/file-builder';
import { SymbolExtractor } from './builders/symbol-builder';
import { DependencyGraphBuilder } from './builders/dependency-builder';
import { CallGraphBuilder } from './builders/call-builder';
import { RepositoryGraphSnapshot, FileNode, SymbolNode, DependencyEdge, CallEdge } from './models';
import { ParserRegistry } from '@agent-os/parser';

export class RepositoryIndexer {
  private fileBuilder = new FileGraphBuilder();
  private symbolExtractor = new SymbolExtractor();
  private dependencyBuilder = new DependencyGraphBuilder();
  private callBuilder = new CallGraphBuilder();
  
  constructor(private eventStore: EventStore) {}

  public async indexRepository(rootDir: string): Promise<RepositoryGraphSnapshot> {
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

    // Initialize Parser
    const parserRegistry = new ParserRegistry();
    await parserRegistry.initialize();

    const symbolsMap = new Map<string, SymbolNode>();
    const fileSymbolsMap = new Map<string, string[]>();
    const allDependencies: DependencyEdge[] = [];
    const allCalls: CallEdge[] = [];

    // 2. Extract AST components per file
    for (const fileNode of fileNodes) {
      // For phase 3.1, tree-sitter will dynamically handle known languages or return null.
      const sourceCode = fs.readFileSync(fileNode.fileId, 'utf-8');
      
      const parseStart = performance.now();
      const parsedAst = parserRegistry.parseFile(fileNode.fileId, sourceCode);
      if (!parsedAst) continue; // Unsupported language
      
      const parseDuration = performance.now() - parseStart;
      // @ts-ignore
      if (metrics.histogram) metrics.histogram('parser_parse_duration').observe(parseDuration);
      metrics.counter('language_parse_count').inc(1, { language: parsedAst.language });
      metrics.counter('ast_nodes_extracted').inc(parsedAst.nodes.length);

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
      const symbols = this.symbolExtractor.extractSymbols(parsedAst, fileNode.fileId);
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
      const deps = this.dependencyBuilder.extractDependencies(parsedAst, fileNode.fileId);
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
      const calls = this.callBuilder.extractCallEdges(parsedAst, fileNode.fileId);
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
