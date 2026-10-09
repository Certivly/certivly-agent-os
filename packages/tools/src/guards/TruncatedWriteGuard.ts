export const FILE_MUTATING_TOOLS = new Set([
  'write_file',
  'edit_file',
  'apply_patch',
]);

export interface TruncatedRewriteResult {
  isTruncated: boolean;
  reason?: string;
  oldLines: number;
  newLines: number;
  netOpenBrackets: number;
}

export class TruncatedWriteGuard {
  /** Minimum existing lines required before applying the ratio check (avoiding false positives on tiny files) */
  public static readonly MIN_EXISTING_LINES = 30;
  /** Maximum size ratio allowed before checking bracket balance (under 60% of original is suspect) */
  public static readonly MAX_SIZE_RATIO = 0.6;

  /**
   * Scans an unparsed string to determine if it is a truncated JSON prefix (e.g. cut off by output token limit)
   */
  public static isTruncatedJsonPrefix(text: string): boolean {
    const s = text.trim();
    if (!s) return false;
    const first = s[0];
    if (first !== '{' && first !== '[' && first !== '"') return false;

    const stack: string[] = [];
    let inString = false;
    let escaped = false;

    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (ch === '\\') {
          escaped = true;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }

      if (ch === '"') {
        inString = true;
      } else if (ch === '{' || ch === '[') {
        stack.push(ch);
      } else if (ch === '}' || ch === ']') {
        const open = stack.pop();
        if (open === undefined) return false;
        if ((open === '{' && ch !== '}') || (open === '[' && ch !== ']')) return false;
      }
    }

    return inString || stack.length > 0;
  }

  /**
   * Net count of unclosed brackets: (, [, {
   */
  public static netOpenBrackets(text: string): number {
    let open = 0;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '(' || ch === '[' || ch === '{') open++;
      else if (ch === ')' || ch === ']' || ch === '}') open--;
    }
    return open;
  }

  /**
   * Checks whether a write_file operation would replace a substantial existing file
   * with a severely shortened fragment that stops mid-expression.
   */
  public static detectTruncatedRewrite(
    oldContent: string,
    newContent: string,
    allowTruncation: boolean = false
  ): TruncatedRewriteResult {
    const oldLines = oldContent.split('\n').length;
    const newLines = newContent.split('\n').length;
    const oldOpen = this.netOpenBrackets(oldContent);
    const newOpen = this.netOpenBrackets(newContent);

    if (allowTruncation || oldLines < this.MIN_EXISTING_LINES) {
      return { isTruncated: false, oldLines, newLines, netOpenBrackets: newOpen };
    }

    const ratio = newContent.length / (oldContent.length || 1);
    const hasUnclosedBrackets = newOpen > oldOpen && newOpen > 0;

    if (ratio < this.MAX_SIZE_RATIO && hasUnclosedBrackets) {
      return {
        isTruncated: true,
        reason: `Proposed rewrite is only ${(ratio * 100).toFixed(1)}% of original length (${newLines} vs ${oldLines} lines) and leaves ${newOpen} unclosed bracket(s).`,
        oldLines,
        newLines,
        netOpenBrackets: newOpen,
      };
    }

    return { isTruncated: false, oldLines, newLines, netOpenBrackets: newOpen };
  }

  public static formatTruncatedCallRefusal(toolName: string, filePath?: string): string {
    const target = filePath ? `'${filePath}'` : 'the target file';
    return (
      `Error: Tool call '${toolName}' was truncated mid-generation (likely hit model max output token limit). ` +
      `Operation REFUSED: Nothing was written to disk, and ${target} is completely unchanged. ` +
      `Do not re-attempt the same oversized call. Make smaller, focused edits instead (e.g. edit_file with targeted replacement blocks).`
    );
  }
}
