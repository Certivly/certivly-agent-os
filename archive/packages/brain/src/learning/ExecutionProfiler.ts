import { EventStore } from '@agent-os/events';
import { ExecutionProfile } from './types';

/** Profiles skill execution patterns from the event store. Moved from @agent-os/seol. */
export class ExecutionProfiler {
  constructor(private eventStore: EventStore) {}

  public profileSkill(skillId: string, sessionId: string): ExecutionProfile {
    const events = this.eventStore.loadEvents(sessionId).map(e => e.event);
    let execCount = 0, totalLatency = 0, graphReads = 0, wicerReads = 0;

    for (const e of events) {
      if (e.source === 'skills' && e.payload?.skillId === skillId) {
        if (e.eventType === 'skill.execution.completed') {
          execCount++;
          if (e.payload.durationMs) totalLatency += e.payload.durationMs;
        }
        if (e.eventType === 'skill.execution.wicer_read') wicerReads++;
        if (e.eventType === 'skill.execution.graph_read') graphReads++;
      }
    }

    return {
      skillId,
      executionCount: execCount,
      avgDurationMs: execCount > 0 ? totalLatency / execCount : 0,
      avgMemoryUsage: 0,
      graphReads,
      wicerReads,
      cacheHitRate: 0,
      dependencyDepth: 1
    };
  }
}
