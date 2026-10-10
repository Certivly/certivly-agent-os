import type { GenerationRequest } from '../interface';

/**
 * Serializes GenerationRequest messages into the OpenAI Chat Completions messages format.
 *
 * Rules:
 * - systemPrompt first as { role: 'system', content }
 * - user / system -> as is
 * - assistant -> { role: 'assistant', content: m.content || null, tool_calls?: [...] } (omit tool_calls when none)
 * - tool -> { role: 'tool', tool_call_id: m.toolCallId, content: m.content }
 */
export function toOpenAIMessages(req: GenerationRequest): unknown[] {
  const messages: any[] = [];

  if (req.systemPrompt) {
    messages.push({ role: 'system', content: req.systemPrompt });
  }

  if (req.dynamicSystemPrompt && req.dynamicSystemPrompt.trim()) {
    messages.push({ role: 'system', content: req.dynamicSystemPrompt.trim() });
  }

  for (const m of req.messages) {
    if (m.role === 'user' || m.role === 'system') {
      messages.push({ role: m.role, content: m.content });
    } else if (m.role === 'assistant') {
      const hasTools = Boolean(m.toolCalls && m.toolCalls.length > 0);
      const msg: any = {
        role: 'assistant',
        content: hasTools ? (m.content || null) : (m.content || ''),
      };
      if (hasTools) {
        msg.tool_calls = m.toolCalls!.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: {
            name: tc.name,
            arguments: tc.args || '{}',
          },
        }));
      }
      messages.push(msg);
    } else if (m.role === 'tool') {
      messages.push({
        role: 'tool',
        tool_call_id: m.toolCallId || `call_${crypto.randomUUID()}`,
        content: m.content || '',
      });
    }
  }

  return messages;
}
