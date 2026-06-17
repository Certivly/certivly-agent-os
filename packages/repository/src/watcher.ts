import * as chokidar from 'chokidar';
import * as fs from 'fs';
import { EventStore } from '@agent-os/events';
import { metrics } from '@agent-os/metrics';
import { RepositoryIndexer } from './indexer';
import { RepositoryGraphSnapshot } from './models';
import { FileGraphBuilder } from './builders/file-builder';
import { SymbolExtractor } from './builders/symbol-builder';
import { DependencyGraphBuilder } from './builders/dependency-builder';
import { CallGraphBuilder } from './builders/call-builder';
import { ParserRegistry } from '@agent-os/parser';

export class RepositoryWatcher {
  private watcher: chokidar.FSWatcher | null = null;
  private currentSnapshot!: RepositoryGraphSnapshot;
  private parserRegistry: ParserRegistry;
  
  constructor(
    private rootDir: string, 
    private eventStore: EventStore,
    private indexer: RepositoryIndexer
  ) {
    this.parserRegistry = new ParserRegistry();
  }

  public async initialize() {
    await this.parserRegistry.initialize();
    this.currentSnapshot = await this.indexer.indexRepository(this.rootDir);
  }

  public start() {
    this.watcher = chokidar.watch(this.rootDir, {
      ignored: /(^|[\/\\])\..|node_modules|dist/,
      persistent: true,
      ignoreInitial: true
    });

    this.watcher.on('add', path => this.handleFileChanged(path, 'add'));
    this.watcher.on('change', path => this.handleFileChanged(path, 'change'));
    this.watcher.on('unlink', path => this.handleFileChanged(path, 'remove'));
  }

  public stop() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }

  public getSnapshot(): RepositoryGraphSnapshot {
    return this.currentSnapshot;
  }

  private handleFileChanged(filePath: string, eventType: 'add' | 'change' | 'remove') {
    metrics.counter('incremental_updates_count').inc();
    
    if (eventType === 'remove') {
      this.currentSnapshot.files.delete(filePath);
      
      const symbolIds = this.currentSnapshot.fileSymbols.get(filePath) || [];
      for (const sid of symbolIds) {
        this.currentSnapshot.symbols.delete(sid);
      }
      this.currentSnapshot.fileSymbols.delete(filePath);
      
      this.currentSnapshot.dependencies = this.currentSnapshot.dependencies.filter(d => d.sourceFileId !== filePath);
      this.currentSnapshot.calls = this.currentSnapshot.calls.filter(c => c.filePath !== filePath);
      
      this.currentSnapshot.version++;
      this.currentSnapshot.timestamp = new Date().toISOString();
      return;
    }

    // Add / Change
    const fileBuilder = new FileGraphBuilder();
    const node = fileBuilder.buildFileNode(filePath, this.rootDir);
    
    if (!node) return;
    this.currentSnapshot.files.set(filePath, node);

    const sourceCode = fs.readFileSync(filePath, 'utf-8');
    const parsedAst = this.parserRegistry.parseFile(filePath, sourceCode);

    if (parsedAst) {
      // Clean old
      const oldSymbolIds = this.currentSnapshot.fileSymbols.get(filePath) || [];
      for (const sid of oldSymbolIds) {
        this.currentSnapshot.symbols.delete(sid);
      }
      this.currentSnapshot.dependencies = this.currentSnapshot.dependencies.filter(d => d.sourceFileId !== filePath);
      this.currentSnapshot.calls = this.currentSnapshot.calls.filter(c => c.filePath !== filePath);

      // Extract new
      const symbolExtractor = new SymbolExtractor();
      const symbols = symbolExtractor.extractSymbols(parsedAst, filePath);
      this.currentSnapshot.fileSymbols.set(filePath, symbols.map(s => s.symbolId));
      for (const s of symbols) {
        this.currentSnapshot.symbols.set(s.symbolId, s);
      }

      const dependencyBuilder = new DependencyGraphBuilder();
      const deps = dependencyBuilder.extractDependencies(parsedAst, filePath);
      this.currentSnapshot.dependencies.push(...deps);

      const callBuilder = new CallGraphBuilder();
      const calls = callBuilder.extractCallEdges(parsedAst, filePath);
      this.currentSnapshot.calls.push(...calls);

      this.currentSnapshot.version++;
      this.currentSnapshot.timestamp = new Date().toISOString();
    } else {
      this.currentSnapshot.version++;
      this.currentSnapshot.timestamp = new Date().toISOString();
    }
  }
}
