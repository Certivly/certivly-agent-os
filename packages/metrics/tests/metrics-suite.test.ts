import { describe, it, expect } from 'bun:test';
import {
  TokenTracker,
  TokenCounter,
  CostCalculator,
  costCalculator,
  SlidingWindowMetrics,
  SessionMetricsTracker,
  MetricsExporter,
  metrics,
  DEFAULT_MODEL_PRICING,
} from '../src';

describe('Metrics Package Complete Suite', () => {
  describe('TokenTracker', () => {
    it('records tokens per model and global totals accurately', () => {
      const tracker = new TokenTracker();
      tracker.record('claude-3-5-sonnet', { promptTokens: 100, completionTokens: 50 }, 'session-1');
      tracker.record('claude-3-5-sonnet', { promptTokens: 200, completionTokens: 100 }, 'session-1');
      tracker.record('gpt-4o', { promptTokens: 300, completionTokens: 150 }, 'session-2');

      const total = tracker.getTotal();
      expect(total.promptTokens).toBe(600);
      expect(total.completionTokens).toBe(300);
      expect(total.totalTokens).toBe(900);

      const claudeStats = tracker.getModelStats('claude-3-5-sonnet');
      expect(claudeStats?.calls).toBe(2);
      expect(claudeStats?.promptTokens).toBe(300);
      expect(claudeStats?.completionTokens).toBe(150);

      const session1 = tracker.getSessionUsage('session-1');
      expect(session1?.promptTokens).toBe(300);
      expect(session1?.completionTokens).toBe(150);
    });

    it('tracks cache read and write tokens and reasoning tokens', () => {
      const tracker = new TokenTracker();
      tracker.record('claude-3-7-sonnet', {
        promptTokens: 50,
        completionTokens: 20,
        reasoningTokens: 30,
        cacheReadTokens: 500,
        cacheWriteTokens: 100,
      });

      const total = tracker.getTotal();
      expect(total.reasoningTokens).toBe(30);
      expect(total.cacheReadTokens).toBe(500);
      expect(total.cacheWriteTokens).toBe(100);
    });
  });

  describe('TokenCounter', () => {
    it('estimates text and code token counts using heuristics', () => {
      const text = 'Hello world, this is a standard sentence for token estimation.';
      const estProse = TokenCounter.estimate(text, { isCode: false });
      expect(estProse).toBeGreaterThan(5);
      expect(estProse).toBeLessThan(30);

      const code = 'function add(a: number, b: number): number { return a + b; }';
      const estCode = TokenCounter.estimate(code, { isCode: true });
      expect(estCode).toBeGreaterThan(5);
    });

    it('estimates message lists with framing tokens', () => {
      const messages = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Please summarize this file.' },
      ];
      const count = TokenCounter.estimateMessages(messages);
      expect(count).toBeGreaterThan(15);
    });
  });

  describe('CostCalculator', () => {
    it('calculates cost for Claude 3.5 Sonnet', () => {
      const usage = {
        promptTokens: 1_000_000,
        completionTokens: 1_000_000,
        totalTokens: 2_000_000,
      };
      const cost = costCalculator.calculate('claude-3-5-sonnet-20241022', usage);
      // Input: $3.0, Output: $15.0 -> Total: $18.0
      expect(cost.inputCost).toBe(3.0);
      expect(cost.outputCost).toBe(15.0);
      expect(cost.totalCost).toBe(18.0);
    });

    it('calculates cost for GPT-4o-mini', () => {
      const usage = {
        promptTokens: 100_000,
        completionTokens: 50_000,
        totalTokens: 150_000,
      };
      const cost = costCalculator.calculate('gpt-4o-mini', usage);
      expect(cost.totalCost).toBeGreaterThan(0);
      expect(cost.totalCost).toBeLessThan(0.1);
    });

    it('handles free local models (ollama) with $0 cost', () => {
      const usage = {
        promptTokens: 50_000,
        completionTokens: 20_000,
        totalTokens: 70_000,
      };
      const cost = costCalculator.calculate('ollama/llama3', usage);
      expect(cost.totalCost).toBe(0);
    });

    it('supports custom pricing registration', () => {
      const calc = new CostCalculator();
      calc.registerRate('custom-fine-tuned', { inputPerMillion: 1.0, outputPerMillion: 2.0 });
      const cost = calc.calculate('custom-fine-tuned', { promptTokens: 1_000_000, completionTokens: 1_000_000, totalTokens: 2_000_000 });
      expect(cost.totalCost).toBe(3.0);
    });
  });

  describe('SlidingWindowMetrics', () => {
    it('computes rolling rates and latency quantiles', () => {
      const window = new SlidingWindowMetrics(60);
      window.record({ tokens: 100, latencyMs: 50 });
      window.record({ tokens: 200, latencyMs: 150 });
      window.record({ tokens: 300, latencyMs: 300, isError: true });

      const stats = window.getStats();
      expect(stats.sampleCount).toBe(3);
      expect(stats.requestsPerMinute).toBe(3);
      expect(stats.tokensPerMinute).toBe(600);
      expect(stats.errorRatePercent).toBeCloseTo(33.33, 1);
      expect(stats.minLatencyMs).toBe(50);
      expect(stats.maxLatencyMs).toBe(300);
      expect(stats.p50LatencyMs).toBe(150);
    });
  });

  describe('SessionMetricsTracker & MetricsExporter', () => {
    it('records complete session workflow and exports to Prometheus and CLI summary', () => {
      const session = new SessionMetricsTracker('session-test-42');
      session.recordTurn();
      session.recordLlmCall('claude-3-5-sonnet', { promptTokens: 1000, completionTokens: 200 });
      session.recordToolCall('read_file', 45, true);
      session.recordToolCall('edit_file', 80, true);
      session.recordTurn();
      session.recordLlmCall('claude-3-5-sonnet', { promptTokens: 2000, completionTokens: 400 });
      session.recordToolCall('run_command', 150, false);

      const summary = session.finish();
      expect(summary.turns).toBe(2);
      expect(summary.totalTokens.totalTokens).toBe(3600);
      expect(summary.totalCostUsd).toBeGreaterThan(0);
      expect(summary.toolStats.length).toBe(3);
      expect(summary.errorCount).toBe(1);

      // Verify CLI formatted summary
      const text = MetricsExporter.formatSummary(summary);
      expect(text).toContain('session-test-42');
      expect(text).toContain('read_file');
      expect(text).toContain('run_command');
      expect(text).toContain('Estimated Cost:');

      // Verify Prometheus export
      const snapshot = metrics.snapshot();
      const prom = MetricsExporter.toPrometheus(snapshot, { session: summary });
      expect(prom).toContain('agentos_session_turns{session_id="session-test-42"} 2');
      expect(prom).toContain('agentos_session_total_tokens');
    });
  });
});
