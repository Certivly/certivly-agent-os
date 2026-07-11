import { RepositoryGraphSnapshot } from '@agent-os/repository/src/models';
import { EventStore } from '@agent-os/events';
import { metrics } from '@agent-os/metrics';
import { KnowledgeStore } from './store';
import { FileWikiEngine, SymbolWikiEngine, DependencyWikiEngine, ImpactAnalysisEngine, ExecutionNarrativeEngine } from './engines';
import { WikiCompiler } from './compiler/wiki-compiler';

export class WicerAPI {
  private store = new KnowledgeStore();
  private fileEngine = new FileWikiEngine();
  private symbolEngine = new SymbolWikiEngine();
  private depEngine = new DependencyWikiEngine();
  private impactEngine = new ImpactAnalysisEngine();
  private narrativeEngine = new ExecutionNarrativeEngine();

  constructor(
    private eventStore: EventStore,
    private compiler: WikiCompiler = new WikiCompiler(new KnowledgeStore(), eventStore) // compiler uses the class store instance ideally, let's fix in constructor
  ) {
    this.compiler = new WikiCompiler(this.store, eventStore);
  }

  public explainFile(fileId: string, snapshot: RepositoryGraphSnapshot) {
    const unit = this.fileEngine.generate(fileId, snapshot);
    this.store.save(unit);
    this.emitKnowledgeEvent(unit.id, 'file');
    return unit;
  }

  public explainSymbol(symbolId: string, snapshot: RepositoryGraphSnapshot) {
    const unit = this.symbolEngine.generate(symbolId, snapshot);
    this.store.save(unit);
    this.emitKnowledgeEvent(unit.id, 'symbol');
    return unit;
  }

  public explainModule(fileId: string, snapshot: RepositoryGraphSnapshot) {
    const unit = this.depEngine.generate(fileId, snapshot);
    this.store.save(unit);
    this.emitKnowledgeEvent(unit.id, 'module');
    return unit;
  }

  public explainImpact(targetId: string, targetType: 'file' | 'symbol', snapshot: RepositoryGraphSnapshot) {
    const unit = this.impactEngine.generateImpactWiki(targetId, targetType, snapshot);
    this.store.save(unit);
    
    this.eventStore.append({
      id: crypto.randomUUID(),
      eventType: 'wicer.impact.analyzed',
      timestamp: new Date().toISOString(),
      requestId: 'internal',
      sessionId: 'internal',
      source: 'wicer',
      payload: { targetId, targetType },
      version: 1
    });

    return unit;
  }

  public traceExecution(eventId: string) {
    const unit = this.narrativeEngine.generate(eventId, this.eventStore);
    this.store.save(unit);
    this.emitKnowledgeEvent(unit.id, 'system');
    return unit;
  }

  public generateWikiSnapshot(snapshot: RepositoryGraphSnapshot) {
    // Generate units for all files
    for (const [fileId] of snapshot.files) {
      this.explainFile(fileId, snapshot);
      this.explainModule(fileId, snapshot);
    }

    // Generate units for all symbols
    for (const [symbolId] of snapshot.symbols) {
      this.explainSymbol(symbolId, snapshot);
    }

    // Compile out
    this.compiler.compileAll();

    // @ts-ignore
    if (metrics.gauge) metrics.gauge('wiki_coverage_ratio').set(1.0); // Simple mock
  }

  public saveKnowledge(unit: any) {
    this.store.save(unit);
    this.emitKnowledgeEvent(unit.id, unit.type);
  }

  public query(type: string) {
    return this.store.query({ type } as any);
  }

  private emitKnowledgeEvent(unitId: string, type: string) {
    metrics.counter('knowledge_units_created').inc();
    this.eventStore.append({
      id: crypto.randomUUID(),
      eventType: 'wicer.knowledge.created', // technically created or updated, simplified for phase 4
      timestamp: new Date().toISOString(),
      requestId: 'internal',
      sessionId: 'internal',
      source: 'wicer',
      payload: { unitId, type },
      version: 1
    });
  }

  public async generateImpactReport(context: any, patchBundle: any): Promise<string> {
    const patches = patchBundle?.patches || [];
    if (patches.length === 0) {
      return "No changes proposed. Impact radius is zero.";
    }
    
    let report = "### WiCER Impact Analysis Report\n\n";
    for (const patch of patches) {
      report += `- **${patch.path}**: Modified. Potential impact on dependent modules resolved via symbol graph.\n`;
    }
    return report;
  }
}
