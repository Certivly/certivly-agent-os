import { ProviderError } from '@agent-os/shared';
import type { StreamEvent, ModelUsage } from '../interface';

export interface RawOpenAIToolCallDelta {
  index?: number;
  id?: string;
  type?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
}

export interface RawOpenAIChunk {
  choices?: Array<{
    delta?: {
      content?: string | null;
      tool_calls?: RawOpenAIToolCallDelta[];
    };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  } | null;
}

export async function* parseOpenAIStream(
  chunks: AsyncIterable<RawOpenAIChunk>
): AsyncIterable<StreamEvent> {
  const toolCallsByIndex = new Map<
    number,
    { id: string; name: string; args: string; started: boolean }
  >();
  let usage: ModelUsage | undefined = undefined;

  try {
    for await (const chunk of chunks) {
      if (chunk.usage) {
        usage = {
          inputTokens: chunk.usage.prompt_tokens ?? 0,
          outputTokens: chunk.usage.completion_tokens ?? 0,
          totalTokens: chunk.usage.total_tokens ?? (chunk.usage.prompt_tokens ?? 0) + (chunk.usage.completion_tokens ?? 0),
        };
      }

      const choice = chunk.choices?.[0];
      if (!choice) continue;

      const delta = choice.delta;
      if (!delta) continue;

      if (delta.content) {
        yield { type: 'text_delta', text: delta.content };
      }

      if (delta.tool_calls && Array.isArray(delta.tool_calls)) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index ?? 0;
          let entry = toolCallsByIndex.get(idx);
          if (!entry) {
            entry = {
              id: tc.id || `call_${idx}`,
              name: tc.function?.name || '',
              args: '',
              started: false,
            };
            toolCallsByIndex.set(idx, entry);
          } else {
            if (tc.id) entry.id = tc.id;
            if (tc.function?.name) entry.name = tc.function.name;
          }

          if (!entry.started && entry.id && entry.name) {
            entry.started = true;
            yield { type: 'tool_call_start', id: entry.id, name: entry.name };
          }

          if (tc.function?.arguments) {
            entry.args += tc.function.arguments;
            yield {
              type: 'tool_call_args_delta',
              id: entry.id,
              delta: tc.function.arguments,
            };
          }
        }
      }
    }

    // When stream completes, finalize each tool call in order
    const sortedIndices = Array.from(toolCallsByIndex.keys()).sort((a, b) => a - b);
    for (const idx of sortedIndices) {
      const entry = toolCallsByIndex.get(idx)!;
      let parsedArgs: Record<string, unknown>;
      try {
        parsedArgs = JSON.parse(entry.args || '{}');
      } catch (err: any) {
        yield {
          type: 'error',
          error: new ProviderError(`Malformed tool call arguments JSON for ${entry.name}: ${err.message}`),
        };
        return;
      }

      yield {
        type: 'tool_call_end',
        id: entry.id,
        arguments: parsedArgs,
      };
    }

    yield { type: 'done', usage };
  } catch (err: any) {
    yield {
      type: 'error',
      error: err instanceof ProviderError ? err : new ProviderError(err?.message || String(err)),
    };
  }
}

export async function* parseAnthropicSSEStream(
  lines: AsyncIterable<string>
): AsyncIterable<StreamEvent> {
  let currentTool: { id: string; name: string; args: string } | null = null;
  const usage: ModelUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

  try {
    for await (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || !line.startsWith('data:')) continue;

      const dataStr = line.slice(5).trim();
      if (dataStr === '[DONE]') break;

      let event: any;
      try {
        event = JSON.parse(dataStr);
      } catch {
        continue;
      }

      if (event.type === 'message_start' && event.message?.usage) {
        usage.inputTokens = event.message.usage.input_tokens ?? 0;
      } else if (event.type === 'content_block_start') {
        if (event.content_block?.type === 'tool_use') {
          currentTool = {
            id: event.content_block.id || '',
            name: event.content_block.name || '',
            args: '',
          };
          yield {
            type: 'tool_call_start',
            id: currentTool.id,
            name: currentTool.name,
          };
        }
      } else if (event.type === 'content_block_delta') {
        const delta = event.delta;
        if (delta?.type === 'text_delta' && delta.text) {
          yield { type: 'text_delta', text: delta.text };
        } else if (delta?.type === 'input_json_delta' && delta.partial_json) {
          if (currentTool) {
            currentTool.args += delta.partial_json;
            yield {
              type: 'tool_call_args_delta',
              id: currentTool.id,
              delta: delta.partial_json,
            };
          }
        }
      } else if (event.type === 'content_block_stop') {
        if (currentTool) {
          let parsedArgs: Record<string, unknown>;
          try {
            parsedArgs = JSON.parse(currentTool.args || '{}');
          } catch (err: any) {
            yield {
              type: 'error',
              error: new ProviderError(`Malformed tool call arguments JSON for ${currentTool.name}: ${err.message}`),
            };
            return;
          }

          yield {
            type: 'tool_call_end',
            id: currentTool.id,
            arguments: parsedArgs,
          };
          currentTool = null;
        }
      } else if (event.type === 'message_delta' && event.usage) {
        usage.outputTokens = event.usage.output_tokens ?? 0;
        usage.totalTokens = usage.inputTokens + usage.outputTokens;
      } else if (event.type === 'message_stop') {
        yield { type: 'done', usage };
      }
    }
  } catch (err: any) {
    yield {
      type: 'error',
      error: err instanceof ProviderError ? err : new ProviderError(err?.message || String(err)),
    };
  }
}
