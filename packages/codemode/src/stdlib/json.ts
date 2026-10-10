/**
 * Standard library JSON manipulation utilities for CodeMode scripts.
 */

export const JsonUtils = {
  safeParse<T = unknown>(text: string, fallback?: T): T | undefined {
    try {
      return JSON.parse(text) as T;
    } catch (_err: unknown) {
      // Safe fallback on invalid JSON text
      return fallback;
    }
  },

  safeStringify(value: unknown, indent?: number): string {
    try {
      return JSON.stringify(value, null, indent);
    } catch (_err: unknown) {
      // Return safe representation for cyclic or non-serializable objects
      return String(value);
    }
  },

  parseLines<T = unknown>(jsonLinesText: string): T[] {
    const results: T[] = [];
    const lines = jsonLinesText.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        results.push(JSON.parse(trimmed) as T);
      } catch (_err: unknown) {
        // Skip unparseable lines in JSONL stream
      }
    }
    return results;
  },

  toLines(items: unknown[]): string {
    return items.map(item => JSON.stringify(item)).join('\n');
  },

  pruneEmpty<T extends Record<string, any>>(obj: T): Partial<T> {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== null && value !== undefined && value !== '') {
        if (typeof value === 'object' && !Array.isArray(value)) {
          const nested = this.pruneEmpty(value);
          if (Object.keys(nested).length > 0) {
            result[key] = nested;
          }
        } else {
          result[key] = value;
        }
      }
    }
    return result as Partial<T>;
  },
};
