import type { ChatMessage } from '../interface';

/**
 * Serializes ChatMessage sequence into Anthropic Messages API format.
 *
 * Rules:
 * - Omits role: 'system' (system is passed at top-level)
 * - Assistant with toolCalls becomes role: 'assistant', content: [text?, tool_use*]
 * - Tool messages become tool_result blocks in a user message
 * - Consecutive tool results are merged into the same user message
 * - Any consecutive user messages are merged to comply with Anthropic role alternation
 */
export function toAnthropicMessages(messages: ChatMessage[]): unknown[] {
  const result: any[] = [];

  for (const m of messages) {
    if (m.role === 'system') {
      continue;
    }

    if (m.role === 'assistant') {
      if (m.toolCalls && m.toolCalls.length > 0) {
        const contentBlocks: any[] = [];
        if (m.content && m.content.trim() !== '') {
          contentBlocks.push({ type: 'text', text: m.content });
        }
        for (const tc of m.toolCalls) {
          let input: unknown = {};
          try {
            input = JSON.parse(tc.args || '{}');
          } catch {
            input = {};
          }
          contentBlocks.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.name,
            input,
          });
        }
        result.push({
          role: 'assistant',
          content: contentBlocks,
        });
      } else {
        result.push({
          role: 'assistant',
          content: m.content || '',
        });
      }
      continue;
    }

    if (m.role === 'tool') {
      const toolResultBlock: any = {
        type: 'tool_result',
        tool_use_id: m.toolCallId,
        content: m.content,
      };
      if (m.isError) {
        toolResultBlock.is_error = true;
      }

      // Check if previous message in result is role: 'user'
      const lastMsg = result[result.length - 1];
      if (lastMsg && lastMsg.role === 'user') {
        if (Array.isArray(lastMsg.content)) {
          lastMsg.content.push(toolResultBlock);
        } else {
          lastMsg.content = [{ type: 'text', text: lastMsg.content }, toolResultBlock];
        }
      } else {
        result.push({
          role: 'user',
          content: [toolResultBlock],
        });
      }
      continue;
    }

    if (m.role === 'user') {
      const lastMsg = result[result.length - 1];
      if (lastMsg && lastMsg.role === 'user') {
        if (Array.isArray(lastMsg.content)) {
          lastMsg.content.push({ type: 'text', text: m.content });
        } else {
          lastMsg.content = `${lastMsg.content}\n\n${m.content}`;
        }
      } else {
        result.push({
          role: 'user',
          content: m.content,
        });
      }
      continue;
    }
  }

  return result;
}
