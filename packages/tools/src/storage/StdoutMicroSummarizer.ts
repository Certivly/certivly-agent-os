export interface MicroSummaryResult {
  summary: string;
  isSummarized: boolean;
  totalLines: number;
  errorLines: string[];
  warningLines: string[];
}

export class StdoutMicroSummarizer {
  public static readonly DEFAULT_SUMMARY_THRESHOLD_LINES = 25;

  /**
   * Generates a token-thrifty micro-summary of verbose command stdout/stderr
   * inspired by Claude Code's ReAct execution wrapper.
   */
  public static summarize(
    output: string,
    options?: {
      command?: string;
      exitCode?: number;
      thresholdLines?: number;
      maxExtractedErrors?: number;
    }
  ): MicroSummaryResult {
    if (!output || !output.trim()) {
      return {
        summary: 'Command completed with no output.',
        isSummarized: false,
        totalLines: 0,
        errorLines: [],
        warningLines: [],
      };
    }

    const lines = output.split(/\r?\n/).map(l => l.trimEnd()).filter(Boolean);
    const totalLines = lines.length;
    const threshold = options?.thresholdLines ?? StdoutMicroSummarizer.DEFAULT_SUMMARY_THRESHOLD_LINES;
    const maxErrors = options?.maxExtractedErrors ?? 5;

    // Filter key diagnostic lines
    const errorPattern = /(error|fail|failed|fatal|exception|panic|traceback|cannot find)/i;
    const warningPattern = /\b(warn|warning|deprecated)\b/i;

    const errorLines: string[] = [];
    const warningLines: string[] = [];

    for (const line of lines) {
      if (errorPattern.test(line)) {
        if (errorLines.length < maxErrors) {
          errorLines.push(line.trim());
        }
      } else if (warningPattern.test(line)) {
        if (warningLines.length < 3) {
          warningLines.push(line.trim());
        }
      }
    }

    // If output is within threshold and has no critical failure, return verbatim
    if (totalLines <= threshold && (options?.exitCode === 0 || options?.exitCode === undefined)) {
      return {
        summary: output,
        isSummarized: false,
        totalLines,
        errorLines,
        warningLines,
      };
    }

    // Generate concise micro-summary
    const status = options?.exitCode === 0 ? 'SUCCESS' : (options?.exitCode !== undefined ? `EXIT CODE ${options.exitCode}` : 'COMPLETED');
    const headCount = Math.min(3, lines.length);
    const tailCount = Math.min(3, lines.length);

    const headLines = lines.slice(0, headCount);
    const tailLines = lines.slice(Math.max(0, lines.length - tailCount));

    const parts: string[] = [
      `[Micro-Summary: ${options?.command ? `"${options.command}"` : 'Command'} | Status: ${status} | Lines: ${totalLines}]`,
    ];

    if (errorLines.length > 0) {
      parts.push(`Primary Diagnostics (${errorLines.length}):`);
      for (const err of errorLines) {
        parts.push(`  • ${err.slice(0, 140)}`);
      }
    }

    parts.push('Head Preview:');
    for (const h of headLines) {
      parts.push(`  ${h.slice(0, 120)}`);
    }

    if (totalLines > headCount + tailCount) {
      parts.push(`  ... [${totalLines - headCount - tailCount} lines suppressed by Claude-Code-style micro-summarizer] ...`);
    }

    parts.push('Tail Preview:');
    for (const t of tailLines) {
      parts.push(`  ${t.slice(0, 120)}`);
    }

    return {
      summary: parts.join('\n'),
      isSummarized: true,
      totalLines,
      errorLines,
      warningLines,
    };
  }
}
