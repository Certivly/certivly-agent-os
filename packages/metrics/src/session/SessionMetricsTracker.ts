import { TokenUsage } from '../tokens/TokenTracker';
import { costCalculator, CalculatedCost } from '../cost/CostCalculator';

export interface ToolExecutionStat {
  toolName: string;
  calls: number;
  totalDurationMs: number;
  avgDurationMs: number;
  errors: number;
}

export interface SessionMetricsSummary {
  sessionId: string;
  startTime: string;
  endTime?: string;
  durationMs: number;
  turns: number;
  totalTokens: TokenUsage;
  totalCostUsd: number;
  toolStats: ToolExecutionStat[];
  errorCount: number;
}

export class SessionMetricsTracker {
  public readonly sessionId: string;
  private startTime: number = Date.now();
  private endTime?: number;
  private turns: number = 0;
  private tokenUsage: TokenUsage = {
    promptTokens: 0,
    completionTokens: 0,
    reasoningTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    totalTokens: 0,
  };
  private costUsd: number = 0;
  private tools: Map<string, { calls: number; totalDurationMs: number; errors: number }> = new Map();
  private errors: number = 0;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  public recordTurn(): void {
    this.turns += 1;
  }

  public recordLlmCall(model: string, usage: Partial<TokenUsage>): CalculatedCost {
    const prompt = usage.promptTokens ?? 0;
    const completion = usage.completionTokens ?? 0;
    const reasoning = usage.reasoningTokens ?? 0;
    const cacheRead = usage.cacheReadTokens ?? 0;
    const cacheWrite = usage.cacheWriteTokens ?? 0;
    const total = usage.totalTokens ?? (prompt + completion + reasoning + cacheWrite);

    this.tokenUsage.promptTokens += prompt;
    this.tokenUsage.completionTokens += completion;
    this.tokenUsage.reasoningTokens = (this.tokenUsage.reasoningTokens ?? 0) + reasoning;
    this.tokenUsage.cacheReadTokens = (this.tokenUsage.cacheReadTokens ?? 0) + cacheRead;
    this.tokenUsage.cacheWriteTokens = (this.tokenUsage.cacheWriteTokens ?? 0) + cacheWrite;
    this.tokenUsage.totalTokens += total;

    const cost = costCalculator.calculate(model, {
      promptTokens: prompt,
      completionTokens: completion,
      reasoningTokens: reasoning,
      cacheReadTokens: cacheRead,
      cacheWriteTokens: cacheWrite,
      totalTokens: total,
    });

    this.costUsd += cost.totalCost;
    return cost;
  }

  public recordToolCall(toolName: string, durationMs: number, success: boolean = true): void {
    const existing = this.tools.get(toolName) ?? { calls: 0, totalDurationMs: 0, errors: 0 };
    existing.calls += 1;
    existing.totalDurationMs += durationMs;
    if (!success) {
      existing.errors += 1;
      this.errors += 1;
    }
    this.tools.set(toolName, existing);
  }

  public recordError(): void {
    this.errors += 1;
  }

  public finish(): SessionMetricsSummary {
    if (!this.endTime) {
      this.endTime = Date.now();
    }
    return this.getSummary();
  }

  public getSummary(): SessionMetricsSummary {
    const end = this.endTime ?? Date.now();
    const durationMs = end - this.startTime;

    const toolStats: ToolExecutionStat[] = Array.from(this.tools.entries()).map(([toolName, stat]) => ({
      toolName,
      calls: stat.calls,
      totalDurationMs: stat.totalDurationMs,
      avgDurationMs: stat.calls > 0 ? Number((stat.totalDurationMs / stat.calls).toFixed(1)) : 0,
      errors: stat.errors,
    })).sort((a, b) => b.calls - a.calls);

    return {
      sessionId: this.sessionId,
      startTime: new Date(this.startTime).toISOString(),
      endTime: this.endTime ? new Date(this.endTime).toISOString() : undefined,
      durationMs,
      turns: this.turns,
      totalTokens: { ...this.tokenUsage },
      totalCostUsd: Number(this.costUsd.toFixed(6)),
      toolStats,
      errorCount: this.errors,
    };
  }
}
