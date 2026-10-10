/**
 * Pattern matching for hierarchical event topics.
 * Supports:
 * - Exact match: 'session.created'
 * - Single-level wildcard '*': 'session.*' matches 'session.created', 'session.closed'
 * - Multi-level wildcard '**': 'agent.**' matches 'agent.turn.start', 'agent.tool.exec.done'
 * - Global wildcard '*': matches any event
 */
export class EventMatcher {
  public static matches(pattern: string, eventType: string): boolean {
    if (pattern === '*' || pattern === '**') return true;
    if (pattern === eventType) return true;

    // Fast check if no wildcards exist
    if (!pattern.includes('*')) return pattern === eventType;

    const patternParts = pattern.split('.');
    const eventParts = eventType.split('.');

    let pIdx = 0;
    let eIdx = 0;

    while (pIdx < patternParts.length && eIdx < eventParts.length) {
      const p = patternParts[pIdx];

      if (p === '**') {
        // If ** is at the end, matches everything remaining
        if (pIdx === patternParts.length - 1) return true;
        // Otherwise, test remaining against next pattern part
        const nextPattern = patternParts.slice(pIdx + 1).join('.');
        for (let i = eIdx; i <= eventParts.length; i++) {
          const subEvent = eventParts.slice(i).join('.');
          if (this.matches(nextPattern, subEvent)) return true;
        }
        return false;
      }

      if (p === '*' || p === eventParts[eIdx]) {
        pIdx++;
        eIdx++;
      } else {
        return false;
      }
    }

    // Check trailing **
    while (pIdx < patternParts.length && patternParts[pIdx] === '**') {
      pIdx++;
    }

    return pIdx === patternParts.length && eIdx === eventParts.length;
  }
}
