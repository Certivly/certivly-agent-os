export class AgentProfiler {
  private spans: Map<string, number> = new Map();

  startSpan(id: string) {
    this.spans.set(id, performance.now());
  }

  endSpan(id: string): number {
    const start = this.spans.get(id);
    if (!start) return 0;
    const duration = performance.now() - start;
    this.spans.delete(id);
    return duration;
  }
}
