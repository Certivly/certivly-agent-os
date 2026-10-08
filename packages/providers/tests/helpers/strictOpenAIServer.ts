export interface StrictServerOptions {
  parallelToolCalls?: boolean;
}

export interface StrictServerHandle {
  url: string;
  port: number;
  callCount: () => number;
  close: () => void;
}

export function createStrictOpenAIServer(options: StrictServerOptions = {}): StrictServerHandle {
  let callCount = 0;

  const server = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);
      if (url.pathname !== '/v1/chat/completions') {
        return new Response('Not Found', { status: 404 });
      }

      callCount++;
      const body = await req.json() as any;
      const messages = body.messages || [];

      // Validate strict OpenAI tool-call rules
      let pendingToolCallIds: Set<string> | null = null;

      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];

        if (msg.role === 'assistant' && msg.tool_calls && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
          if (pendingToolCallIds && pendingToolCallIds.size > 0) {
            return new Response(
              JSON.stringify({ error: { message: `Assistant called new tools before previous tool calls were answered: ${Array.from(pendingToolCallIds).join(', ')}` } }),
              { status: 400, headers: { 'Content-Type': 'application/json' } }
            );
          }
          pendingToolCallIds = new Set(msg.tool_calls.map((tc: any) => tc.id));
          continue;
        }

        if (msg.role === 'tool') {
          if (!msg.tool_call_id) {
            return new Response(
              JSON.stringify({ error: { message: 'Tool message missing tool_call_id' } }),
              { status: 400, headers: { 'Content-Type': 'application/json' } }
            );
          }
          if (!pendingToolCallIds || !pendingToolCallIds.has(msg.tool_call_id)) {
            return new Response(
              JSON.stringify({ error: { message: `Tool message tool_call_id '${msg.tool_call_id}' was not announced by nearest previous assistant message` } }),
              { status: 400, headers: { 'Content-Type': 'application/json' } }
            );
          }
          pendingToolCallIds.delete(msg.tool_call_id);
          continue;
        }

        // Any non-tool message (user, assistant without tool_calls, system)
        if (pendingToolCallIds && pendingToolCallIds.size > 0) {
          return new Response(
            JSON.stringify({ error: { message: `Expected tool responses for: ${Array.from(pendingToolCallIds).join(', ')} before message role '${msg.role}'` } }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
          );
        }
      }

      const isStream = body.stream === true;
      const turn = callCount;

      // Determine response based on turn
      if (turn === 1) {
        const toolCalls = options.parallelToolCalls
          ? [
              { id: 'call_1', type: 'function', function: { name: 'read_file', arguments: JSON.stringify({ path: 'a.ts' }) } },
              { id: 'call_2', type: 'function', function: { name: 'read_file', arguments: JSON.stringify({ path: 'b.ts' }) } },
            ]
          : [
              { id: 'call_1', type: 'function', function: { name: 'read_file', arguments: JSON.stringify({ path: 'a.ts' }) } },
            ];

        if (isStream) {
          const sseChunks: string[] = [];
          if (!options.parallelToolCalls) {
            // Split arguments across 3 chunks
            sseChunks.push(`data: ${JSON.stringify({
              id: 'chatcmpl-1',
              object: 'chat.completion.chunk',
              choices: [{ index: 0, delta: { role: 'assistant', tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: 'read_file', arguments: '{"path":' } }] }, finish_reason: null }]
            })}\n\n`);
            sseChunks.push(`data: ${JSON.stringify({
              id: 'chatcmpl-1',
              object: 'chat.completion.chunk',
              choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: '"a.' } }] }, finish_reason: null }]
            })}\n\n`);
            sseChunks.push(`data: ${JSON.stringify({
              id: 'chatcmpl-1',
              object: 'chat.completion.chunk',
              choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: 'ts"}' } }] }, finish_reason: 'tool_calls' }]
            })}\n\n`);
          } else {
            // Two parallel tool calls
            sseChunks.push(`data: ${JSON.stringify({
              id: 'chatcmpl-1',
              object: 'chat.completion.chunk',
              choices: [{ index: 0, delta: { role: 'assistant', tool_calls: [
                { index: 0, id: 'call_1', type: 'function', function: { name: 'read_file', arguments: JSON.stringify({ path: 'a.ts' }) } },
                { index: 1, id: 'call_2', type: 'function', function: { name: 'read_file', arguments: JSON.stringify({ path: 'b.ts' }) } },
              ] }, finish_reason: 'tool_calls' }]
            })}\n\n`);
          }
          sseChunks.push('data: [DONE]\n\n');

          return new Response(sseChunks.join(''), {
            headers: {
              'Content-Type': 'text/event-stream; charset=utf-8',
              'Cache-Control': 'no-cache',
            },
          });
        }

        // Non-stream call 1
        return new Response(
          JSON.stringify({
            id: 'chatcmpl-1',
            object: 'chat.completion',
            choices: [
              {
                index: 0,
                message: {
                  role: 'assistant',
                  content: null,
                  tool_calls: toolCalls,
                },
                finish_reason: 'tool_calls',
              },
            ],
            usage: { prompt_tokens: 15, completion_tokens: 10, total_tokens: 25 },
          }),
          { headers: { 'Content-Type': 'application/json' } }
        );
      }

      // Turn >= 2: plain text completion
      if (isStream) {
        const sseChunks = [
          `data: ${JSON.stringify({
            id: `chatcmpl-${turn}`,
            object: 'chat.completion.chunk',
            choices: [{ index: 0, delta: { role: 'assistant', content: 'Completed reading files.' }, finish_reason: null }]
          })}\n\n`,
          `data: ${JSON.stringify({
            id: `chatcmpl-${turn}`,
            object: 'chat.completion.chunk',
            choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
            usage: { prompt_tokens: 25, completion_tokens: 5, total_tokens: 30 }
          })}\n\n`,
          'data: [DONE]\n\n',
        ];
        return new Response(sseChunks.join(''), {
          headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache',
          },
        });
      }

      return new Response(
        JSON.stringify({
          id: `chatcmpl-${turn}`,
          object: 'chat.completion',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: 'Completed reading files.',
              },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 25, completion_tokens: 5, total_tokens: 30 },
        }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    },
  });

  return {
    url: `http://localhost:${server.port}`,
    port: server.port ?? 0,
    callCount: () => callCount,
    close: () => server.stop(),
  };
}
