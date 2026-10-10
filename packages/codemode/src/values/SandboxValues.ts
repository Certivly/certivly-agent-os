export class SandboxValues {
  /**
   * Safely serializes arbitrary values from the interpreter sandbox,
   * avoiding circular references, functions, and symbols.
   */
  public static serialize(value: any, maxDepth: number = 10, maxStringLength: number = 10000): any {
    const seen = new WeakSet();

    const walk = (val: any, depth: number): any => {
      if (val === null || val === undefined) return val;
      if (typeof val === 'number' || typeof val === 'boolean') return val;
      if (typeof val === 'string') {
        return val.length > maxStringLength ? val.slice(0, maxStringLength) + '... [truncated]' : val;
      }
      if (typeof val === 'function') {
        return `[Function: ${val.name || 'anonymous'}]`;
      }
      if (typeof val === 'symbol') {
        return val.toString();
      }
      if (val instanceof Error) {
        return { name: val.name, message: val.message, stack: val.stack };
      }
      if (val instanceof Date) {
        return val.toISOString();
      }
      if (val instanceof RegExp) {
        return val.toString();
      }
      if (depth >= maxDepth) {
        return '[Max Depth Reached]';
      }

      if (typeof val === 'object') {
        if (seen.has(val)) {
          return '[Circular Reference]';
        }
        seen.add(val);

        if (Array.isArray(val)) {
          return val.map(item => walk(item, depth + 1));
        }

        const out: Record<string, any> = {};
        for (const [k, v] of Object.entries(val)) {
          if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
          out[k] = walk(v, depth + 1);
        }
        return out;
      }

      return String(val);
    };

    return walk(value, 0);
  }

  /**
   * Formats a value for display in CLI or agent response.
   */
  public static format(value: any): string {
    const serialized = this.serialize(value);
    if (typeof serialized === 'string') return serialized;
    return JSON.stringify(serialized, null, 2);
  }
}
