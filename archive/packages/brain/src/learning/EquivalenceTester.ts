import { SkillResult } from './types';
import { RuntimeEvent } from '@agent-os/events';

/** Validates that an optimized skill produces equivalent output to the original. Moved from @agent-os/seol. */
export class EquivalenceTester {
  public assertEquivalent(
    originalOutput: SkillResult,
    optimizedOutput: SkillResult,
    originalEvents: RuntimeEvent[],
    optimizedEvents: RuntimeEvent[]
  ): boolean {
    if (originalOutput.success !== optimizedOutput.success) return false;
    if (JSON.stringify(originalOutput.data) !== JSON.stringify(optimizedOutput.data)) return false;

    if (originalEvents.length !== optimizedEvents.length) return false;
    for (let i = 0; i < originalEvents.length; i++) {
      if (originalEvents[i].eventType !== optimizedEvents[i].eventType) return false;
      const p1 = { ...(originalEvents[i].payload as any) };
      const p2 = { ...(optimizedEvents[i].payload as any) };
      delete p1.durationMs;
      delete p2.durationMs;
      if (JSON.stringify(p1) !== JSON.stringify(p2)) return false;
    }

    const origGraph = originalOutput.graphReferences ?? [];
    const optGraph = optimizedOutput.graphReferences ?? [];
    if (origGraph.length !== optGraph.length) return false;
    for (let i = 0; i < origGraph.length; i++) {
      if (origGraph[i] !== optGraph[i]) return false;
    }

    const origWicer = originalOutput.wicerReferences ?? [];
    const optWicer = optimizedOutput.wicerReferences ?? [];
    if (origWicer.length !== optWicer.length) return false;
    for (let i = 0; i < origWicer.length; i++) {
      if (origWicer[i] !== optWicer[i]) return false;
    }

    return true;
  }
}
