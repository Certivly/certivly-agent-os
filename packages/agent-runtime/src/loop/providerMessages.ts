import type { ChatMessage, ToolCallRef } from '@agent-os/providers';
import type { LoopMessage } from './types';

/**
 * Converts internal LoopMessage history into a sanitized, typed sequence
 * of ChatMessages suitable for LLM providers.
 *
 * Rules:
 * 1. system messages that are NOT first become user messages prefixed [system note]
 * 2. assistant keeps toolCalls (map LoopToolCall to ToolCallRef)
 * 3. tool messages need toolCallId; drop any tool message whose id was not announced by an EARLIER assistant message
 * 4. Every announced tool call must have a result. If missing, insert [tool result missing: run was interrupted] with isError: true
 * 5. Results must come directly after their assistant message (reorder if needed; keep call order)
 * 6. Drop an assistant message that has empty content and no tool calls
 */
export function toProviderMessages(history: LoopMessage[]): ChatMessage[] {
  const result: ChatMessage[] = [];
  const consumedToolIndices = new Set<number>();

  for (let i = 0; i < history.length; i++) {
    const msg = history[i];

    if (msg.role === 'system') {
      if (result.length === 0) {
        result.push({ role: 'system', content: msg.content });
      } else {
        result.push({ role: 'user', content: `[system note] ${msg.content}` });
      }
      continue;
    }

    if (msg.role === 'user') {
      result.push({ role: 'user', content: msg.content });
      continue;
    }

    if (msg.role === 'assistant') {
      const hasToolCalls = Array.isArray(msg.toolCalls) && msg.toolCalls.length > 0;
      const contentTrimmed = (msg.content || '').trim();

      // Rule 6: Drop an assistant message that has empty content and no tool calls
      if (!hasToolCalls && contentTrimmed === '') {
        continue;
      }

      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: msg.content || '',
      };

      if (hasToolCalls) {
        assistantMsg.toolCalls = msg.toolCalls!.map((tc) => ({
          id: tc.id,
          name: tc.name,
          args: tc.args,
        }));
      }

      result.push(assistantMsg);

      // Rule 4 & 5: Place results directly after their assistant message in announced order
      if (hasToolCalls) {
        for (const tc of msg.toolCalls!) {
          // Look ahead in history for matching tool result
          let foundIdx = -1;
          for (let j = i + 1; j < history.length; j++) {
            if (consumedToolIndices.has(j)) continue;
            const candidate = history[j];
            if (candidate.role === 'tool' && candidate.toolCallId === tc.id) {
              foundIdx = j;
              break;
            }
          }

          if (foundIdx !== -1) {
            consumedToolIndices.add(foundIdx);
            const foundTool = history[foundIdx];
            const toolMsg: ChatMessage = {
              role: 'tool',
              toolCallId: tc.id,
              name: foundTool.name || tc.name,
              content: foundTool.content,
            };
            if (foundTool.isError !== undefined) {
              toolMsg.isError = foundTool.isError;
            }
            result.push(toolMsg);
          } else {
            // Missing result: synthesize
            result.push({
              role: 'tool',
              toolCallId: tc.id,
              name: tc.name,
              content: '[tool result missing: run was interrupted]',
              isError: true,
            });
          }
        }
      }
      continue;
    }

    if (msg.role === 'tool') {
      // If already consumed as part of an earlier assistant's toolCalls, skip
      if (consumedToolIndices.has(i)) {
        continue;
      }
      // Rule 3: Drop any tool message whose id was not announced by an EARLIER assistant message
      // If it reached here unconsumed, it is an orphan, so drop it.
      continue;
    }
  }

  return result;
}
