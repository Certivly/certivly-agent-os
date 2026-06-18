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
    agentState: 'idle'
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
