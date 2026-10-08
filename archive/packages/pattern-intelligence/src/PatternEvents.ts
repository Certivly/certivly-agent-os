import { LoggingEventBus } from "@agent-os/shared";

export class PatternEvents {
  constructor(private bus: LoggingEventBus) {}

  public emitScanStarted(repoVersion: string) {
    this.bus.publish("pattern.scan.started", { component: "pattern-intelligence", severity: "info", message: "Pattern scan started", meta: { repoVersion } });
  }

  public emitPatternDetected(patternId: string, patternType: string) {
    this.bus.publish("pattern.detected", { component: "pattern-intelligence", severity: "info", message: `Pattern detected: ${patternType}`, meta: { patternId, patternType } });
  }

  public emitSnapshotCreated(repoVersion: string, patternCount: number) {
    this.bus.publish("pattern.snapshot.created", { component: "pattern-intelligence", severity: "info", message: `Pattern snapshot created with ${patternCount} patterns`, meta: { repoVersion, patternCount } });
  }
}
