import { PatternRegistry } from "./PatternRegistry";
import { PatternCompiler } from "./PatternCompiler";
import { PatternStore } from "./PatternStore";
import { PatternSnapshot, Pattern } from "./models";

export class PatternEngine {
  constructor(
    private registry: PatternRegistry,
    private compiler: PatternCompiler,
    private store: PatternStore,
    private events: any,
    private metrics: any
  ) {}

  public async scan(graph: any, knowledge: any[], repoVersion: string): Promise<PatternSnapshot> {
    this.events.emitScanStarted(repoVersion);
    const startTime = Date.now();

    const detectors = this.registry.getDetectors();
    const allPatterns: Pattern[] = [];

    for (const detector of detectors) {
      try {
        const patterns = await detector.detect(graph, knowledge);
        for (const pattern of patterns) {
          allPatterns.push(pattern);
          this.events.emitPatternDetected(pattern.id, pattern.type);
          this.metrics.recordPatternDetected(pattern.type);
        }
      } catch (err: any) {
        console.error(`Detector ${detector.id} failed:`, err.message);
      }
    }

    const snapshot = this.compiler.compile(allPatterns, repoVersion);
    this.store.saveSnapshot(snapshot);

    this.events.emitSnapshotCreated(snapshot.repositoryVersion, allPatterns.length);
    this.metrics.recordScanDuration(Date.now() - startTime);

    return snapshot;
  }
}
