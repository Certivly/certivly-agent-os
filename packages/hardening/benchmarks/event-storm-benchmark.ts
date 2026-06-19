import { EventBus } from '../../daemon/src/streaming/EventBus';
import { BackpressureController } from '../../daemon/src/streaming/BackpressureController';
import { MemoryInspector } from '../src/diagnostics/MemoryInspector';

async function run() {
  console.log("=== Event Storm Benchmark ===");
  console.log("Target: 50,000 events/sec for 10 seconds (500,000 total events)");

  const bus = new EventBus();
  const controller = new BackpressureController(50000, 0.2);
  const inspector = new MemoryInspector();

  Bun.gc(true);
  console.log("Initial Heap:");
  inspector.report();

  let received = 0;
  const start = performance.now();
  let dropped = 0;
  let buffer: any[] = [];

  // Receiver simulator
  bus.subscribe('storm', (event) => {
    buffer.push(event);
    if (buffer.length > 50000) {
      const initialLength = buffer.length;
      buffer = controller.applyBackpressure(buffer);
      dropped += (initialLength - buffer.length);
    }
    received++;
  });

  // Sender loop
  for (let s = 0; s < 10; s++) {
    const chunkStart = performance.now();
    for (let i = 0; i < 50000; i++) {
      bus.publish({
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        channel: 'storm',
        topic: 'test',
        payload: { idx: s * 50000 + i }
      });
    }
    const elapsed = performance.now() - chunkStart;
    const wait = 1000 - elapsed;
    if (wait > 0) {
      await new Promise(r => setTimeout(r, wait));
    }
  }

  const totalTimeMs = performance.now() - start;

  if (global.gc) global.gc();
  console.log("\nFinal Heap:");
  inspector.report();

  console.log(`\nResults:`);
  console.log(`Total Events Sent: 500,000`);
  console.log(`Total Time: ${(totalTimeMs / 1000).toFixed(2)}s`);
  console.log(`Throughput: ${((500000 / totalTimeMs) * 1000).toFixed(0)} events/sec`);
  console.log(`Dropped Events: ${dropped} (${((dropped / 500000) * 100).toFixed(2)}%)`);
}

run().catch(console.error);
