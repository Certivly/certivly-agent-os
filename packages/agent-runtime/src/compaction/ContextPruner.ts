import type { LoopMessage } from '../loop/types';
import { estimateTokenCount } from '../loop/compactHistory';

export interface ContextPrunerPolicy {
  maxContextTokens?: number;         // Trigger threshold (default: 60,000 tokens)
  targetContextTokens?: number;      // Target after pruning (default: 25,000 tokens)
  userTokenBudget?: number;          // Default: 50,000 tokens
  toolTokenBudget?: number;          // Default: 20,000 tokens
  cacheExpiryMs?: number;            // Default: 300,000ms (5 minutes)
  subagentBlacklist?: string[];      // Subagent IDs whose steps are scrubbed
}

export interface PruningAudit {
  tokensBefore: number;
  tokensAfter: number;
  subagentsScrubbed: number;
  cacheExpired: boolean;
  messagesCondensed: number;
  savingsRatio: number;
}

export class ContextPruner {
  public static readonly DEFAULT_MAX_CONTEXT_TOKENS = 60_000;
  public static readonly DEFAULT_TARGET_CONTEXT_TOKENS = 25_000;
  public static readonly DEFAULT_USER_TOKEN_BUDGET = 50_000;
  public static readonly DEFAULT_TOOL_TOKEN_BUDGET = 20_000;
  public static readonly DEFAULT_CACHE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

  public static readonly DEFAULT_SUBAGENT_BLACKLIST = [
    'file-picker',
    'search-subagent',
    'review-subagent',
    'librarian',
    'tmux-cli',
    'browser-use',
    'thinker',
  ];

  public prune(
    messages: LoopMessage[],
    lastTurnTimestamp: number = Date.now(),
    policy?: ContextPrunerPolicy
  ): { prunedMessages: LoopMessage[]; audit: PruningAudit } {
    const maxContextTokens = policy?.maxContextTokens ?? ContextPruner.DEFAULT_MAX_CONTEXT_TOKENS;
    const userBudget = policy?.userTokenBudget ?? ContextPruner.DEFAULT_USER_TOKEN_BUDGET;
    const toolBudget = policy?.toolTokenBudget ?? ContextPruner.DEFAULT_TOOL_TOKEN_BUDGET;
    const cacheExpiryMs = policy?.cacheExpiryMs ?? ContextPruner.DEFAULT_CACHE_EXPIRY_MS;
    const blacklist = new Set(policy?.subagentBlacklist ?? ContextPruner.DEFAULT_SUBAGENT_BLACKLIST);

    const now = Date.now();
    const cacheExpired = now - lastTurnTimestamp >= cacheExpiryMs;

    const initialTokens = this.calculateTotalTokens(messages);

    if (initialTokens < maxContextTokens && !cacheExpired) {
      return {
        prunedMessages: messages,
        audit: {
          tokensBefore: initialTokens,
          tokensAfter: initialTokens,
          subagentsScrubbed: 0,
          cacheExpired: false,
          messagesCondensed: 0,
          savingsRatio: 0,
        },
      };
    }

    let subagentsScrubbed = 0;
    let messagesCondensed = 0;

    // 1. Scrub finished subagent intermediate tool calls
    const scrubbedMessages: LoopMessage[] = [];
    const completedSubagentCallIds = new Set<string>();

    // Scan for completed subagent calls
    for (const msg of messages) {
      if (msg.role === 'tool' && msg.name && blacklist.has(msg.name.toLowerCase())) {
        if (msg.toolCallId) {
          completedSubagentCallIds.add(msg.toolCallId);
        }
      }
      if (msg.toolCalls) {
        for (const tc of msg.toolCalls) {
          if (blacklist.has(tc.name.toLowerCase())) {
            if (tc.id) completedSubagentCallIds.add(tc.id);
          }
        }
      }
    }

    for (const msg of messages) {
      // Check if message belongs to a completed subagent whose raw output is oversized
      const isSubagentOutput = msg.name && blacklist.has(msg.name.toLowerCase());
      const isLinkedCall = msg.toolCallId && completedSubagentCallIds.has(msg.toolCallId);

      if ((isSubagentOutput || isLinkedCall) && msg.role === 'tool') {
        const tokenEstimate = estimateTokenCount(msg.content);
        if (tokenEstimate > 150) {
          // Retain first 200 chars and summarize
          const preview = msg.content.slice(0, 300).trim();
          scrubbedMessages.push({
            ...msg,
            content: `${preview}\n\n[... Subagent execution completed. ${tokenEstimate} tokens of intermediate search/trace steps scrubbed to conserve context. Final verdict preserved ...]`,
          });
          subagentsScrubbed++;
          messagesCondensed++;
          continue;
        }
      }

      scrubbedMessages.push(msg);
    }

    // 2. Asymmetric token budgeting: enforce toolBudget on older tool outputs
    const budgetedMessages: LoopMessage[] = [];
    let accumulatedToolTokens = 0;
    let accumulatedUserTokens = 0;

    // Process from newest to oldest to preserve recent context
    const reversed = [...scrubbedMessages].reverse();

    for (const msg of reversed) {
      if (msg.role === 'system') {
        budgetedMessages.unshift(msg);
        continue;
      }

      if (msg.role === 'user') {
        const tokens = estimateTokenCount(msg.content);
        if (accumulatedUserTokens + tokens <= userBudget) {
          budgetedMessages.unshift(msg);
          accumulatedUserTokens += tokens;
        } else {
          // Truncate older user message slightly if exceeding budget
          const kept = msg.content.slice(0, 1000);
          budgetedMessages.unshift({
            ...msg,
            content: `${kept}\n[... Older user text trimmed to fit user token budget ...]`,
          });
          accumulatedUserTokens += estimateTokenCount(kept);
          messagesCondensed++;
        }
        continue;
      }

      if (msg.role === 'tool') {
        const tokens = estimateTokenCount(msg.content);
        if (accumulatedToolTokens + tokens <= toolBudget) {
          budgetedMessages.unshift(msg);
          accumulatedToolTokens += tokens;
        } else {
          // Cap older tool outputs heavily
          if (tokens > 200) {
            budgetedMessages.unshift({
              ...msg,
              content: `${msg.content.slice(0, 200)}\n[... Output truncated under assistant/tool context budget ...]`,
            });
            accumulatedToolTokens += 100;
            messagesCondensed++;
          } else {
            budgetedMessages.unshift(msg);
            accumulatedToolTokens += tokens;
          }
        }
        continue;
      }

      // Assistant messages
      budgetedMessages.unshift(msg);
    }

    const finalTokens = this.calculateTotalTokens(budgetedMessages);
    const savingsRatio = initialTokens > 0 ? (initialTokens - finalTokens) / initialTokens : 0;

    return {
      prunedMessages: budgetedMessages,
      audit: {
        tokensBefore: initialTokens,
        tokensAfter: finalTokens,
        subagentsScrubbed,
        cacheExpired,
        messagesCondensed,
        savingsRatio,
      },
    };
  }

  private calculateTotalTokens(messages: LoopMessage[]): number {
    let total = 0;
    for (const m of messages) {
      total += estimateTokenCount(m.content);
    }
    return total;
  }
}

export const contextPruner = new ContextPruner();
