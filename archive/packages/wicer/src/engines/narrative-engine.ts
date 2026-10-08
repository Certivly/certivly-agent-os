import { ExecutionNarrative, KnowledgeUnit } from '../models';
import { EventStore } from '@agent-os/events';

export class ExecutionNarrativeEngine {
  public generate(eventId: string, eventStore: EventStore): KnowledgeUnit {
    // Find the base event
    const events = eventStore.query();
    const targetEvent = events.find(e => e.id === eventId);
    if (!targetEvent) throw new Error(`Event ${eventId} not found`);

    // Trace linearly (for Phase 4, we just pull events in the same session/request)
    const sessionEvents = events.filter(e => e.sessionId === targetEvent.sessionId && e.requestId === targetEvent.requestId);
    sessionEvents.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    const narrativeText = sessionEvents.map(e => `[${e.timestamp}] ${e.source} -> ${e.eventType}`).join(' →\n');

    const content = `Execution Narrative: ${eventId}

Session ID: ${targetEvent.sessionId}
Request ID: ${targetEvent.requestId}

Timeline:
${narrativeText}

Trace:
- Generated purely from EventStore history without inference.
`;

    return {
      id: `narrative:${eventId}`,
      type: 'system',
      title: `Execution Narrative for ${eventId}`,
      content,
      sourceGraphRefs: [],
      sourceEventRefs: sessionEvents.map(e => e.id),
      createdAt: Date.now(),
      version: 1
    };
  }
}
