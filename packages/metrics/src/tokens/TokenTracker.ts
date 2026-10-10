export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  reasoningTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  totalTokens: number;
}

export interface ModelTokenStats {
  model: string;
  calls: number;
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
}

export class TokenTracker {
  private modelStats: Map<string, ModelTokenStats> = new Map();
  private sessionStats: Map<string, TokenUsage> = new Map();
  private totalUsage: TokenUsage = {
    promptTokens: 0,
    completionTokens: 0,
    reasoningTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    totalTokens: 0,
  };

  public record(model: string, usage: Partial<TokenUsage>, sessionId?: string): TokenUsage {
    const prompt = usage.promptTokens ?? 0;
    const completion = usage.completionTokens ?? 0;
    const reasoning = usage.reasoningTokens ?? 0;
    const cacheRead = usage.cacheReadTokens ?? 0;
    const cacheWrite = usage.cacheWriteTokens ?? 0;
    const total = usage.totalTokens ?? (prompt + completion + reasoning + cacheWrite);

    const normalized: TokenUsage = {
      promptTokens: prompt,
      completionTokens: completion,
      reasoningTokens: reasoning,
      cacheReadTokens: cacheRead,
      cacheWriteTokens: cacheWrite,
      totalTokens: total,
    };

    // Update global usage
    this.totalUsage.promptTokens += prompt;
    this.totalUsage.completionTokens += completion;
    this.totalUsage.reasoningTokens = (this.totalUsage.reasoningTokens ?? 0) + reasoning;
    this.totalUsage.cacheReadTokens = (this.totalUsage.cacheReadTokens ?? 0) + cacheRead;
    this.totalUsage.cacheWriteTokens = (this.totalUsage.cacheWriteTokens ?? 0) + cacheWrite;
    this.totalUsage.totalTokens += total;

    // Update per-model stats
    const existingModel = this.modelStats.get(model) ?? {
      model,
      calls: 0,
      promptTokens: 0,
      completionTokens: 0,
      reasoningTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      totalTokens: 0,
    };
    existingModel.calls += 1;
    existingModel.promptTokens += prompt;
    existingModel.completionTokens += completion;
    existingModel.reasoningTokens += reasoning;
    existingModel.cacheReadTokens += cacheRead;
    existingModel.cacheWriteTokens += cacheWrite;
    existingModel.totalTokens += total;
    this.modelStats.set(model, existingModel);

    // Update per-session stats
    if (sessionId) {
      const existingSession = this.sessionStats.get(sessionId) ?? {
        promptTokens: 0,
        completionTokens: 0,
        reasoningTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        totalTokens: 0,
      };
      existingSession.promptTokens += prompt;
      existingSession.completionTokens += completion;
      existingSession.reasoningTokens = (existingSession.reasoningTokens ?? 0) + reasoning;
      existingSession.cacheReadTokens = (existingSession.cacheReadTokens ?? 0) + cacheRead;
      existingSession.cacheWriteTokens = (existingSession.cacheWriteTokens ?? 0) + cacheWrite;
      existingSession.totalTokens += total;
      this.sessionStats.set(sessionId, existingSession);
    }

    return normalized;
  }

  public getTotal(): TokenUsage {
    return { ...this.totalUsage };
  }

  public getModelStats(model: string): ModelTokenStats | undefined {
    const s = this.modelStats.get(model);
    return s ? { ...s } : undefined;
  }

  public getAllModelStats(): ModelTokenStats[] {
    return Array.from(this.modelStats.values()).map(s => ({ ...s }));
  }

  public getSessionUsage(sessionId: string): TokenUsage | undefined {
    const u = this.sessionStats.get(sessionId);
    return u ? { ...u } : undefined;
  }

  public reset(): void {
    this.modelStats.clear();
    this.sessionStats.clear();
    this.totalUsage = {
      promptTokens: 0,
      completionTokens: 0,
      reasoningTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      totalTokens: 0,
    };
  }
}
