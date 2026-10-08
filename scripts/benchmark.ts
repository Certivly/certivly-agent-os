import { EventStore } from '../packages/events/src/store';
import { ContextStack } from '../packages/context/src';
import { MemoryStore, MemoryExtractor } from '../packages/memory/src';
import { metrics } from '../packages/metrics/src';

const NUM_EVENTS = 10000;
const NUM_CONTEXTS = 1000;
const NUM_MEMORIES = 1000;

async function runBenchmark() {
  console.log('Starting High-Volume Benchmark...');
  
  // Setup
  const eventStore = new EventStore(':memory:');
  const memoryStore = new MemoryStore(':memory:');
  const extractor = new MemoryExtractor(memoryStore);
  const contextStack = new ContextStack({ maxEntries: 100 }, extractor);
  
  console.log(`Injecting ${NUM_EVENTS} Events...`);
  const eventStart = performance.now();
  for (let i = 0; i < NUM_EVENTS; i++) {
    eventStore.append({
      id: crypto.randomUUID(),
      eventType: 'benchmark.event',
      timestamp: new Date().toISOString(),
      requestId: 'req-1',
      sessionId: 'session-1',
      source: 'benchmark',
      payload: { data: 'test' },
      version: "1.0"
    });
  }
  const eventEnd = performance.now();
  console.log(`Events Write: ${(eventEnd - eventStart).toFixed(2)}ms`);

  console.log(`Injecting ${NUM_CONTEXTS} Context Entries...`);
  const ctxStart = performance.now();
  for (let i = 0; i < NUM_CONTEXTS; i++) {
    await contextStack.push({
      id: crypto.randomUUID(),
      type: 'MessageContext',
      content: `Bench message ${i}`,
      timestamp: new Date().toISOString(),
      sourceEventIds: ['ev-1'],
      sourceSessionIds: ['session-1'],
      sourceRequestIds: ['req-1']
    });
  }
  const ctxEnd = performance.now();
  console.log(`Context Push & Evict: ${(ctxEnd - ctxStart).toFixed(2)}ms`);
  
  console.log(`Replaying ${NUM_EVENTS} Events...`);
  const replayStart = performance.now();
  let count = 0;
  eventStore.replayEvents('session-1', (ev) => {
    count++;
  });
  const replayEnd = performance.now();
  console.log(`Event Replay: ${(replayEnd - replayStart).toFixed(2)}ms (Count: ${count})`);
  
  const snap = metrics.snapshot();
  console.log('\nBenchmark Metrics Snapshot:');
  console.log(JSON.stringify(snap, null, 2));
}

runBenchmark().catch(console.error);
