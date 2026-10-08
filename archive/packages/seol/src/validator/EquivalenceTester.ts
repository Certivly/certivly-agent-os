import { SkillResult } from '@agent-os/skills';
import { RuntimeEvent } from '@agent-os/events';

export class EquivalenceTester {
  public assertEquivalent(
    originalOutput: SkillResult,
    optimizedOutput: SkillResult,
    originalEvents: RuntimeEvent[],
    optimizedEvents: RuntimeEvent[]
  ): boolean {
    // 1. Output Equivalence
    if (originalOutput.success !== optimizedOutput.success) return false;
    if (JSON.stringify(originalOutput.data) !== JSON.stringify(optimizedOutput.data)) return false;

    // 2. Event Equivalence
    if (originalEvents.length !== optimizedEvents.length) return false;
    for (let i = 0; i < originalEvents.length; i++) {
      if (originalEvents[i].eventType !== optimizedEvents[i].eventType) return false;
      // Exclude timestamps and durations from equivalence checking as they inherently vary
      const p1 = { ...originalEvents[i].payload } as any;
      const p2 = { ...optimizedEvents[i].payload } as any;
      delete p1.durationMs;
      delete p2.durationMs;
      if (JSON.stringify(p1) !== JSON.stringify(p2)) return false;
    }

    // 3. Reference Equivalence
    if (originalOutput.graphReferences.length !== optimizedOutput.graphReferences.length) return false;
    for (let i = 0; i < originalOutput.graphReferences.length; i++) {
      if (originalOutput.graphReferences[i] !== optimizedOutput.graphReferences[i]) return false;
    }

    if (originalOutput.wicerReferences.length !== optimizedOutput.wicerReferences.length) return false;
    for (let i = 0; i < originalOutput.wicerReferences.length; i++) {
      if (originalOutput.wicerReferences[i] !== optimizedOutput.wicerReferences[i]) return false;
    }

    return true;
  }
}
