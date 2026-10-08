import type { LoopMessage } from './types';
import { redactSecrets } from '../trace/RunTracer';

export const MAX_RECENT_TURNS = 20;
export const MAX_TOOL_RESULT_PAIRS = 5;

export interface CompactOptions {
  maxRecentTurns?: number;
  maxToolResultPairs?: number;
  maxApproxTokens?: number;
  verbatimTurnsCount?: number;
}

export function estimateTokenCount(text: string): number {
  return Math.ceil((text || '').length / 4);
}

export function estimateHistoryTokens(messages: LoopMessage[]): number {
  let total = 0;
  for (const msg of messages) {
    total += estimateTokenCount(msg.content);
    if (msg.toolCalls) {
      for (const tc of msg.toolCalls) {
        total += estimateTokenCount(tc.name) + estimateTokenCount(tc.args);
      }
    }
  }
  return total;
}

export function compactHistory(
  messages: LoopMessage[],
  optionsOrTokens?: number | CompactOptions,
  verbatimTurnsCount?: number
): LoopMessage[] {
  let maxApproxTokens: number | undefined;
  let maxRecentTurns = MAX_RECENT_TURNS;
  let maxToolResultPairs = MAX_TOOL_RESULT_PAIRS;
  let verbatimTurns = verbatimTurnsCount ?? 6;

  if (typeof optionsOrTokens === 'number') {
    maxApproxTokens = optionsOrTokens;
  } else if (optionsOrTokens && typeof optionsOrTokens === 'object') {
    maxApproxTokens = optionsOrTokens.maxApproxTokens;
    if (optionsOrTokens.maxRecentTurns !== undefined) maxRecentTurns = optionsOrTokens.maxRecentTurns;
    if (optionsOrTokens.maxToolResultPairs !== undefined) maxToolResultPairs = optionsOrTokens.maxToolResultPairs;
    if (optionsOrTokens.verbatimTurnsCount !== undefined) verbatimTurns = optionsOrTokens.verbatimTurnsCount;
  }

  // 1. Redact secrets in all messages
  let processed: LoopMessage[] = messages.map((m) => ({
    ...m,
    content: typeof m.content === 'string' ? redactSecrets(m.content) : m.content,
  }));

  // 2. Remove resolved verification failures
  // If a [Verification Failed] message is followed by a [Verification Passed], remove the failed message
  const hasVerificationPassed = processed.some((m) =>
    m.content && m.content.includes('[Verification Passed]')
  );
  if (hasVerificationPassed) {
    const lastPassedIndex = processed.map((m) => m.content?.includes('[Verification Passed]')).lastIndexOf(true);
    processed = processed.filter((m, idx) => {
      if (idx < lastPassedIndex && m.content && m.content.includes('[Verification Failed]')) {
        return false;
      }
      return true;
    });
  }

  // 3. For tool results beyond maxToolResultPairs, replace content with truncation notice
  const toolIndices: number[] = [];
  processed.forEach((m, idx) => {
    if (m.role === 'tool') {
      toolIndices.push(idx);
    }
  });

  if (toolIndices.length > maxToolResultPairs) {
    const keepCount = maxToolResultPairs;
    const toTruncateIndices = new Set(toolIndices.slice(0, toolIndices.length - keepCount));
    processed = processed.map((m, idx) => {
      if (toTruncateIndices.has(idx)) {
        return {
          ...m,
          content: '[Tool result truncated — call the tool again if needed]',
        };
      }
      return m;
    });
  }

  // 4. Always keep system messages (role: 'system') + last maxRecentTurns of other messages
  const systemMessages = processed.filter((m) => m.role === 'system');
  let nonSystemMessages = processed.filter((m) => m.role !== 'system');

  if (nonSystemMessages.length > maxRecentTurns) {
    nonSystemMessages = nonSystemMessages.slice(nonSystemMessages.length - maxRecentTurns);
  }

  let finalMessages = [...systemMessages, ...nonSystemMessages];

  // 5. If maxApproxTokens is set and tokens still exceed 80% threshold, apply extractive summary
  if (maxApproxTokens !== undefined) {
    const currentTokens = estimateHistoryTokens(finalMessages);
    const threshold = 0.8 * maxApproxTokens;

    if (currentTokens > threshold) {
      let turnsSeen = 0;
      let splitIndex = finalMessages.length;

      for (let i = finalMessages.length - 1; i >= 0; i--) {
        const role = finalMessages[i].role;
        if (role === 'user' || role === 'assistant') {
          turnsSeen++;
          if (turnsSeen === verbatimTurns) {
            splitIndex = i;
            break;
          }
        }
      }

      if (turnsSeen >= verbatimTurns && splitIndex > 0) {
        while (splitIndex > 0 && finalMessages[splitIndex].role === 'tool') {
          splitIndex--;
        }

        if (splitIndex > 0) {
          const olderMessages = finalMessages.slice(0, splitIndex);
          const preservedMessages = finalMessages.slice(splitIndex);

          if (olderMessages.length > 0) {
            const summaryLines: string[] = ['[Summary of earlier conversation]:'];
            for (const msg of olderMessages) {
              const snippet = msg.content ? msg.content.slice(0, 200).replace(/\r?\n/g, ' ') : '';
              if (msg.role === 'tool') {
                summaryLines.push(
                  `- Tool ${msg.name || msg.toolCallId || 'unknown'} (${msg.isError ? 'failed' : 'succeeded'}): ${snippet}`
                );
              } else if (msg.role === 'assistant' && msg.toolCalls?.length) {
                const toolNames = msg.toolCalls.map((tc) => tc.name).join(', ');
                summaryLines.push(`- Assistant requested tools [${toolNames}]: ${snippet}`);
              } else {
                summaryLines.push(`- ${msg.role}: ${snippet}`);
              }
            }

            const summaryMessage: LoopMessage = {
              role: 'assistant',
              content: summaryLines.join('\n'),
            };

            finalMessages = [summaryMessage, ...preservedMessages];
          }
        }
      }
    }
  }

  return finalMessages;
}
