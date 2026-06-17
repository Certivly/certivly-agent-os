import * as chokidar from 'chokidar';
import { EventStore } from '@agent-os/events';
import { metrics } from '@agent-os/metrics';
import { RepositoryIndexer } from './indexer';
import { RepositoryGraphSnapshot } from './models';
import { FileGraphBuilder } from './builders/file-builder';
import { SymbolExtractor } from './builders/symbol-builder';
import { DependencyGraphBuilder } from './builders/dependency-builder';
import { CallGraphBuilder } from './builders/call-builder';

export class RepositoryWatcher {
  private watcher: chokidar.FSWatcher | null = null;
  private currentSnapshot: RepositoryGraphSnapshot;
  
  constructor(
    private rootDir: string, 
    private eventStore: EventStore,
    private indexer: RepositoryIndexer
  ) {
    // Initial sync full index
    this.currentSnapshot = this.indexer.indexRepository(this.rootDir);
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
    // Incremental Update
    metrics.counter('incremental_updates_count').inc();
    
    // In a fully robust incremental watcher, we would only update the affected FileNode, 
    // run the AST builders against that specific file, and patch the currentSnapshot in place.
    // For structural compliance with Phase 3 (DO NOT REINDEX ENTIRE REPO), we will mutate the map.
    
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

    // For Add / Change, we re-run the specific file parsing
    const fileBuilder = new FileGraphBuilder();
    const node = fileBuilder.buildFileNode(filePath, this.rootDir);
    
    if (!node) return; // not a file or error
    this.currentSnapshot.files.set(filePath, node);

    if (node.language === 'typescript' || node.language === 'javascript') {
      import('ts-morph').then(({ Project }) => {
        const project = new Project();
        project.addSourceFileAtPath(filePath);
        const sourceFile = project.getSourceFile(filePath);
        if (!sourceFile) return;

        // Clean old
        const oldSymbolIds = this.currentSnapshot.fileSymbols.get(filePath) || [];
        for (const sid of oldSymbolIds) {
          this.currentSnapshot.symbols.delete(sid);
        }
        this.currentSnapshot.dependencies = this.currentSnapshot.dependencies.filter(d => d.sourceFileId !== filePath);
        this.currentSnapshot.calls = this.currentSnapshot.calls.filter(c => c.filePath !== filePath);

        // Extract new
        const symbolExtractor = new SymbolExtractor();
        const symbols = symbolExtractor.extractSymbols(sourceFile, filePath);
        this.currentSnapshot.fileSymbols.set(filePath, symbols.map(s => s.symbolId));
        for (const s of symbols) {
          this.currentSnapshot.symbols.set(s.symbolId, s);
        }

        const dependencyBuilder = new DependencyGraphBuilder();
        const deps = dependencyBuilder.extractDependencies(sourceFile, filePath);
        this.currentSnapshot.dependencies.push(...deps);

        const callBuilder = new CallGraphBuilder();
        const calls = callBuilder.extractCallEdges(sourceFile, filePath);
        this.currentSnapshot.calls.push(...calls);

        this.currentSnapshot.version++;
        this.currentSnapshot.timestamp = new Date().toISOString();
      });
    } else {
      this.currentSnapshot.version++;
      this.currentSnapshot.timestamp = new Date().toISOString();
    }
  }
}
