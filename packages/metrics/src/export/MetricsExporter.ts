import { MetricSnapshot } from '../models';
import { SessionMetricsSummary } from '../session/SessionMetricsTracker';
import { SlidingWindowStats } from '../rates/SlidingWindowMetrics';

export class MetricsExporter {
  /**
   * Formats MetricSnapshot and optional rates/session summary into Prometheus text exposition format.
   */
  public static toPrometheus(
    snapshot: MetricSnapshot,
    options: {
      rates?: SlidingWindowStats;
      session?: SessionMetricsSummary;
      prefix?: string;
    } = {}
  ): string {
    const p = options.prefix ?? 'agentos';
    const lines: string[] = [];

    lines.push(`# HELP ${p}_metrics Prometheus exported metrics`);
    lines.push(`# TYPE ${p}_metrics gauge`);

    // Counters
    for (const [name, val] of Object.entries(snapshot.counters)) {
      const sanitized = name.replace(/[^a-zA-Z0-9_]/g, '_');
      lines.push(`${p}_counter_${sanitized} ${val}`);
    }

    // Gauges
    for (const [name, val] of Object.entries(snapshot.gauges)) {
      const sanitized = name.replace(/[^a-zA-Z0-9_]/g, '_');
      lines.push(`${p}_gauge_${sanitized} ${val}`);
    }

    // Histograms
    for (const [name, h] of Object.entries(snapshot.histograms)) {
      const sanitized = name.replace(/[^a-zA-Z0-9_]/g, '_');
      lines.push(`${p}_hist_${sanitized}_count ${h.count}`);
      lines.push(`${p}_hist_${sanitized}_sum ${h.sum}`);
      lines.push(`${p}_hist_${sanitized}_avg ${h.average}`);
      lines.push(`${p}_hist_${sanitized}_p95 ${h.p95}`);
      lines.push(`${p}_hist_${sanitized}_p99 ${h.p99}`);
    }

    // Sliding window rates if provided
    if (options.rates) {
      lines.push(`${p}_rate_requests_per_minute ${options.rates.requestsPerMinute}`);
      lines.push(`${p}_rate_tokens_per_minute ${options.rates.tokensPerMinute}`);
      lines.push(`${p}_rate_error_percent ${options.rates.errorRatePercent}`);
      lines.push(`${p}_rate_avg_latency_ms ${options.rates.avgLatencyMs}`);
      lines.push(`${p}_rate_p95_latency_ms ${options.rates.p95LatencyMs}`);
    }

    // Session stats if provided
    if (options.session) {
      lines.push(`${p}_session_turns{session_id="${options.session.sessionId}"} ${options.session.turns}`);
      lines.push(`${p}_session_cost_usd{session_id="${options.session.sessionId}"} ${options.session.totalCostUsd}`);
      lines.push(`${p}_session_prompt_tokens{session_id="${options.session.sessionId}"} ${options.session.totalTokens.promptTokens}`);
      lines.push(`${p}_session_completion_tokens{session_id="${options.session.sessionId}"} ${options.session.totalTokens.completionTokens}`);
      lines.push(`${p}_session_total_tokens{session_id="${options.session.sessionId}"} ${options.session.totalTokens.totalTokens}`);
    }

    return lines.join('\n') + '\n';
  }

  /**
   * Formats into a clean human-readable CLI summary table for session completion.
   */
  public static formatSummary(summary: SessionMetricsSummary): string {
    const durationSec = (summary.durationMs / 1000).toFixed(1);
    const tokens = summary.totalTokens;

    let out = `=== Session Metrics (${summary.sessionId}) ===\n`;
    out += `Duration:       ${durationSec}s\n`;
    out += `Turns:          ${summary.turns}\n`;
    out += `Tokens Total:   ${tokens.totalTokens.toLocaleString()} (Prompt: ${tokens.promptTokens.toLocaleString()}, Completion: ${tokens.completionTokens.toLocaleString()})\n`;
    if (tokens.cacheReadTokens || tokens.cacheWriteTokens) {
      out += `Tokens Cache:   Read: ${(tokens.cacheReadTokens ?? 0).toLocaleString()}, Write: ${(tokens.cacheWriteTokens ?? 0).toLocaleString()}\n`;
    }
    out += `Estimated Cost: $${summary.totalCostUsd.toFixed(4)} USD\n`;
    out += `Errors:         ${summary.errorCount}\n`;

    if (summary.toolStats.length > 0) {
      out += `\nTools Executed (${summary.toolStats.length}):\n`;
      for (const t of summary.toolStats) {
        out += `  - ${t.toolName.padEnd(20)} ${t.calls} calls, ${t.totalDurationMs}ms total (avg ${t.avgDurationMs}ms)${t.errors > 0 ? ` [${t.errors} errors]` : ''}\n`;
      }
    }

    return out;
  }
}
