import { SkillResult } from '@agent-os/skills';
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
