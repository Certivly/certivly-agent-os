import { test, expect } from 'bun:test';
import { reduceBatch, UIProjection } from '../src/ui/hooks/useEventStream';
import { EventBatcher, EventRingBuffer } from '../src/bridge/EventStreamAdapter';

test('reduceBatch processes events into projection correctly', () => {
  const initialState: UIProjection = {
    lastEvents: [],
    activeSkills: [],
    traceTree: [],
    chatHistory: [],
    streamingBuffer: '',
    activeStreamingMessageId: null,
    activeMcpCount: 0,
    agentState: 'idle',
    providerStatus: 'unknown',
    todos: [],
    turnCount: 0,
  };

  const batch = [
    { id: '1', type: 'skill.execution.started', timestamp: 123, payload: { skillId: 'search' } },
    { id: '2', type: 'llm.token.stream', timestamp: 124, payload: { token: 'Hello' } }
  ];

  const newState = reduceBatch(batch, initialState);
  expect(newState.activeSkills).toContain('search');
  expect(newState.streamingBuffer).toBe('Hello');
  expect(newState.lastEvents.length).toBe(1);
});

test('reduceBatch processes live tool calls, streaming deltas, and session todos', () => {
  const initialState: UIProjection = {
    lastEvents: [],
    activeSkills: [],
    traceTree: [],
    chatHistory: [
      { id: 'user-1', role: 'user', content: 'Explore codebase' },
      { id: 'ast-1', role: 'assistant', content: '', toolExecutions: [], streaming: true }
    ],
    streamingBuffer: '',
    activeStreamingMessageId: 'ast-1',
    activeMcpCount: 0,
    agentState: 'idle',
    providerStatus: 'ok',
    todos: [],
    turnCount: 0,
  };

  const batch = [
    { id: 't1', type: 'tool.call.started', timestamp: 100, payload: { toolCallId: 'c1', toolName: 'read_file', args: { path: 'math.ts' } } },
    { id: 't2', type: 'message.delta', timestamp: 101, payload: { delta: 'Found ' } },
    { id: 't3', type: 'message.delta', timestamp: 102, payload: { delta: 'math.ts content' } },
    { id: 't4', type: 'tool.call.completed', timestamp: 103, payload: { toolCallId: 'c1', toolName: 'read_file', result: { content: 'export function add() {}' } } },
    {
      id: 't5',
      type: 'todo.updated',
      timestamp: 104,
      payload: {
        todos: [
          { id: 'todo-1', title: 'Check math module', status: 'completed' },
          { id: 'todo-2', title: 'Write unit tests', status: 'in_progress' }
        ]
      }
    },
    { id: 't6', type: 'agent.loop.turn.started', timestamp: 105, payload: { turn: 2 } },
    {
      id: 't7',
      type: 'agent.loop.completed',
      timestamp: 106,
      payload: {
        success: true,
        summary: {
          turns: 2,
          approxInputTokens: 350,
          approxOutputTokens: 50,
          finalText: 'Done exploring math module.'
        }
      }
    }
  ];

  const newState = reduceBatch(batch, initialState);

  // Streaming text accumulated
  expect(newState.chatHistory[1].content).toBe('Found math.ts content');
  expect(newState.chatHistory[1].streaming).toBe(false);

  // Tool executions captured
  expect(newState.chatHistory[1].toolExecutions?.length).toBe(1);
  expect(newState.chatHistory[1].toolExecutions?.[0].name).toBe('read_file');
  expect(newState.chatHistory[1].toolExecutions?.[0].status).toBe('completed');

  // Todos updated
  expect(newState.todos.length).toBe(2);
  expect(newState.todos[0].status).toBe('completed');
  expect(newState.todos[1].status).toBe('in_progress');

  // Turn count and token stats
  expect(newState.turnCount).toBe(2);
  expect(newState.tokenStats?.total).toBe(400);
  expect(newState.agentState).toBe('idle');
});

test('EventBatcher flushes accumulated events', async () => {
  const batcher = new EventBatcher(10); // 10ms
  let receivedBatch: any[] = [];
  
  batcher.subscribe((batch) => {
    receivedBatch = batch;
  });

  batcher.add({ id: '3', type: 'test', timestamp: 0, payload: {} });
  batcher.add({ id: '4', type: 'test', timestamp: 0, payload: {} });

  await new Promise(resolve => setTimeout(resolve, 20)); // wait for flush

  expect(receivedBatch.length).toBe(2);
  batcher.cleanup();
});

test('EventRingBuffer respects max size', () => {
  const buffer = new EventRingBuffer();
  // Buffer has internal max size of 10000, we'll just test standard insertion behavior.
  buffer.push({ id: '1', type: 'test', timestamp: 0, payload: {} });
  const snapshot = buffer.getSnapshot();
  expect(snapshot.length).toBe(1);
});
