export interface BlackboardEntry<T = any> {
  key: string;
  value: T;
  writer: string;
  timestamp: number;
  namespace?: string;
}

export class SharedBlackboard {
  private entries: Map<string, BlackboardEntry> = new Map();

  /**
   * Writes a value to the blackboard with author attribution.
   */
  public write<T = any>(key: string, value: T, writer: string = 'system', namespace?: string): void {
    const fullKey = namespace ? `${namespace}:${key}` : key;
    this.entries.set(fullKey, {
      key: fullKey,
      value,
      writer,
      timestamp: Date.now(),
      namespace,
    });
  }

  /**
   * Reads a value from the blackboard.
   */
  public read<T = any>(key: string, namespace?: string): T | undefined {
    const fullKey = namespace ? `${namespace}:${key}` : key;
    const entry = this.entries.get(fullKey);
    return entry ? (entry.value as T) : undefined;
  }

  /**
   * Checks if a key exists on the blackboard.
   */
  public has(key: string, namespace?: string): boolean {
    const fullKey = namespace ? `${namespace}:${key}` : key;
    return this.entries.has(fullKey);
  }

  /**
   * Lists all entries, optionally filtered by namespace or writer.
   */
  public listEntries(filter?: { namespace?: string; writer?: string }): BlackboardEntry[] {
    const all = Array.from(this.entries.values());
    return all.filter(e => {
      if (filter?.namespace && e.namespace !== filter.namespace) return false;
      if (filter?.writer && e.writer !== filter.writer) return false;
      return true;
    });
  }

  /**
   * Deletes a key from the blackboard.
   */
  public delete(key: string, namespace?: string): boolean {
    const fullKey = namespace ? `${namespace}:${key}` : key;
    return this.entries.delete(fullKey);
  }

  /**
   * Clears all entries from the blackboard.
   */
  public clear(): void {
    this.entries.clear();
  }

  /**
   * Exports a compact, readable Markdown digest of current blackboard findings
   * for prompt injection across subagents.
   */
  public formatDigest(limit: number = 10): string {
    const entries = Array.from(this.entries.values()).slice(-limit);
    if (entries.length === 0) return '';

    const lines: string[] = ['### [Multi-Agent Shared Blackboard Findings]'];
    for (const e of entries) {
      const valStr = typeof e.value === 'string'
        ? e.value
        : JSON.stringify(e.value);
      const preview = valStr.length > 120 ? `${valStr.slice(0, 120)}...` : valStr;
      lines.push(`- **${e.key}** (by ${e.writer}): ${preview}`);
    }
    return lines.join('\n');
  }
}
