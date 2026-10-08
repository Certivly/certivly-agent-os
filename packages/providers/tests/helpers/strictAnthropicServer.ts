export interface StrictAnthropicServerOptions {
  parallelToolCalls?: boolean;
}

export interface StrictAnthropicServerHandle {
  url: string;
  port: number;
  callCount: () => number;
  close: () => void;
}

export function createStrictAnthropicServer(options: StrictAnthropicServerOptions = {}): StrictAnthropicServerHandle {
  let callCount = 0;

  const server = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);
      if (url.pathname !== '/v1/messages') {
        return new Response('Not Found', { status: 404 });
      }

      callCount++;
      const apiKey = req.headers.get('x-api-key');
      if (!apiKey) {
        return new Response(JSON.stringify({ error: { message: 'Missing x-api-key header' } }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const body = (await req.json()) as any;
      const messages = body.messages || [];

      if (!Array.isArray(messages) || messages.length === 0) {
        return new Response(JSON.stringify({ error: { message: 'Messages must be a non-empty array' } }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Check first message role
      if (messages[0].role !== 'user') {
        return new Response(JSON.stringify({ error: { message: 'First message must have role "user"' } }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Validate strict Anthropic alternating roles and tool_use / tool_result pairing
      let lastRole: string | null = null;
      let pendingToolUseIds: Set<string> | null = null;

      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];

        if (msg.role === lastRole) {
          return new Response(
            JSON.stringify({ error: { message: `Consecutive messages cannot have the same role: '${msg.role}' at index ${i}` } }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
          );
        }
        lastRole = msg.role;

        if (msg.role === 'assistant') {
          if (pendingToolUseIds && pendingToolUseIds.size > 0) {
            return new Response(
              JSON.stringify({ error: { message: `Assistant replied before previous tool_use blocks were answered: ${Array.from(pendingToolUseIds).join(', ')}` } }),
              { status: 400, headers: { 'Content-Type': 'application/json' } }
            );
          }

          if (Array.isArray(msg.content)) {
            const toolUses = msg.content.filter((b: any) => b.type === 'tool_use');
            if (toolUses.length > 0) {
              pendingToolUseIds = new Set(toolUses.map((b: any) => b.id));
              for (const tu of toolUses) {
                if (!tu.id || !tu.name || typeof tu.input !== 'object' || tu.input === null) {
                  return new Response(
                    JSON.stringify({ error: { message: `Invalid tool_use block: id, name, and object input required` } }),
                    { status: 400, headers: { 'Content-Type': 'application/json' } }
                  );
                }
              }
            }
          }
          continue;
        }

        if (msg.role === 'user') {
          if (pendingToolUseIds && pendingToolUseIds.size > 0) {
            if (!Array.isArray(msg.content)) {
              return new Response(
                JSON.stringify({ error: { message: `Expected tool_result content blocks for pending tool_use IDs: ${Array.from(pendingToolUseIds).join(', ')}` } }),
                { status: 400, headers: { 'Content-Type': 'application/json' } }
              );
            }

            const toolResults = msg.content.filter((b: any) => b.type === 'tool_result');
            for (const tr of toolResults) {
              if (!tr.tool_use_id || !pendingToolUseIds.has(tr.tool_use_id)) {
                return new Response(
                  JSON.stringify({ error: { message: `Unexpected or unannounced tool_use_id '${tr.tool_use_id}' in tool_result` } }),
                  { status: 400, headers: { 'Content-Type': 'application/json' } }
                );
              }
              pendingToolUseIds.delete(tr.tool_use_id);
            }

            if (pendingToolUseIds.size > 0) {
              return new Response(
                JSON.stringify({ error: { message: `Missing tool_result for tool_use IDs: ${Array.from(pendingToolUseIds).join(', ')}` } }),
                { status: 400, headers: { 'Content-Type': 'application/json' } }
              );
            }
          }
          continue;
        }
      }

      if (pendingToolUseIds && pendingToolUseIds.size > 0) {
        return new Response(
          JSON.stringify({ error: { message: `Unresolved tool_use IDs at end of conversation: ${Array.from(pendingToolUseIds).join(', ')}` } }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const isStream = body.stream === true;
      const turn = callCount;

      if (turn === 1) {
        const content = options.parallelToolCalls
          ? [
              { type: 'tool_use', id: 'call_1', name: 'read_file', input: { path: 'a.ts' } },
              { type: 'tool_use', id: 'call_2', name: 'read_file', input: { path: 'b.ts' } },
            ]
          : [
              { type: 'tool_use', id: 'call_1', name: 'read_file', input: { path: 'a.ts' } },
            ];

        if (isStream) {
          const sseLines: string[] = [
            'event: message_start\n',
            `data: ${JSON.stringify({ type: 'message_start', message: { id: 'msg_1', type: 'message', role: 'assistant', content: [], model: body.model, usage: { input_tokens: 15, output_tokens: 0 } } })}\n\n`,
          ];

          if (!options.parallelToolCalls) {
            sseLines.push('event: content_block_start\n');
            sseLines.push(`data: ${JSON.stringify({ type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'call_1', name: 'read_file', input: {} } })}\n\n`);
            sseLines.push('event: content_block_delta\n');
            sseLines.push(`data: ${JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"path":' } })}\n\n`);
            sseLines.push('event: content_block_delta\n');
            sseLines.push(`data: ${JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '"a.ts"}' } })}\n\n`);
            sseLines.push('event: content_block_stop\n');
            sseLines.push(`data: ${JSON.stringify({ type: 'content_block_stop', index: 0 })}\n\n`);
          } else {
            // Two parallel tool calls
            sseLines.push('event: content_block_start\n');
            sseLines.push(`data: ${JSON.stringify({ type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'call_1', name: 'read_file', input: {} } })}\n\n`);
            sseLines.push('event: content_block_delta\n');
            sseLines.push(`data: ${JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"path":"a.ts"}' } })}\n\n`);
            sseLines.push('event: content_block_stop\n');
            sseLines.push(`data: ${JSON.stringify({ type: 'content_block_stop', index: 0 })}\n\n`);

            sseLines.push('event: content_block_start\n');
            sseLines.push(`data: ${JSON.stringify({ type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'call_2', name: 'read_file', input: {} } })}\n\n`);
            sseLines.push('event: content_block_delta\n');
            sseLines.push(`data: ${JSON.stringify({ type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"path":"b.ts"}' } })}\n\n`);
            sseLines.push('event: content_block_stop\n');
            sseLines.push(`data: ${JSON.stringify({ type: 'content_block_stop', index: 1 })}\n\n`);
          }

          sseLines.push('event: message_delta\n');
          sseLines.push(`data: ${JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 10 } })}\n\n`);
          sseLines.push('event: message_stop\n');
          sseLines.push(`data: ${JSON.stringify({ type: 'message_stop' })}\n\n`);

          return new Response(sseLines.join(''), {
            headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
          });
        }

        return new Response(
          JSON.stringify({
            id: 'msg_1',
            type: 'message',
            role: 'assistant',
            content,
            model: body.model,
            stop_reason: 'tool_use',
            usage: { input_tokens: 15, output_tokens: 10 },
          }),
          { headers: { 'Content-Type': 'application/json' } }
        );
      }

      // Turn >= 2
      if (isStream) {
        const sseLines = [
          'event: message_start\n',
          `data: ${JSON.stringify({ type: 'message_start', message: { id: `msg_${turn}`, type: 'message', role: 'assistant', content: [], model: body.model, usage: { input_tokens: 25, output_tokens: 0 } } })}\n\n`,
          'event: content_block_start\n',
          `data: ${JSON.stringify({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } })}\n\n`,
          'event: content_block_delta\n',
          `data: ${JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Completed reading files.' } })}\n\n`,
          'event: content_block_stop\n',
          `data: ${JSON.stringify({ type: 'content_block_stop', index: 0 })}\n\n`,
          'event: message_delta\n',
          `data: ${JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 10 } })}\n\n`,
          'event: message_stop\n',
          `data: ${JSON.stringify({ type: 'message_stop' })}\n\n`,
        ];
        return new Response(sseLines.join(''), {
          headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
        });
      }

      return new Response(
        JSON.stringify({
          id: `msg_${turn}`,
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'Completed reading files.' }],
          model: body.model,
          stop_reason: 'end_turn',
          usage: { input_tokens: 25, output_tokens: 10 },
        }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    },
  });

  return {
    url: `http://localhost:${server.port ?? 0}`,
    port: server.port ?? 0,
    callCount: () => callCount,
    close: () => server.stop(),
  };
}
