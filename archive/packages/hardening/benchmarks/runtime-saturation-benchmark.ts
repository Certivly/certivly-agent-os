import { RequestQueue } from '../../daemon/src/scheduler/RequestQueue';
import { RequestScheduler } from '../../daemon/src/scheduler/RequestScheduler';
import { RuntimePool } from '../../daemon/src/sessions/RuntimePool';
import { MemoryInspector } from '../src/diagnostics/MemoryInspector';

async function run() {
  console.log("=== Runtime Saturation Benchmark ===");
  console.log("Target: 100,000 concurrent requests");

  const pool = new RuntimePool(50); // 50 concurrent agents
  const queue = new RequestQueue();
  const scheduler = new RequestScheduler(queue, pool);
  const inspector = new MemoryInspector();

  if (global.gc) global.gc();
  console.log("Initial Heap:");
  inspector.report();

  // Pre-acquire 50 runtimes so they are ready
  for (let i = 0; i < 50; i++) {
    pool.acquireRuntime(`session-${i}`);
  }

  let successCount = 0;
  let failureCount = 0;

  const start = performance.now();
  const promises = [];

  for (let i = 0; i < 100000; i++) {
    // In actual system, scheduler takes request, assigns runtime, executes. 
    // We simulate by having the scheduler promise resolve instantly.
    promises.push(
      scheduler.schedule({ id: `req-${i}`, type: 'BENCH', payload: {} })
        .then(() => successCount++)
        .catch(() => failureCount++)
    );
  }

  await Promise.all(promises);
  const totalTimeMs = performance.now() - start;

  if (global.gc) global.gc();
  console.log("\nFinal Heap:");
  inspector.report();

  console.log(`\nResults:`);
  console.log(`Total Requests: 100,000`);
  console.log(`Total Time: ${(totalTimeMs / 1000).toFixed(2)}s`);
  console.log(`Throughput: ${((100000 / totalTimeMs) * 1000).toFixed(0)} reqs/sec`);
  console.log(`Success Rate: ${((successCount / 100000) * 100).toFixed(2)}%`);
  console.log(`Failure Rate: ${((failureCount / 100000) * 100).toFixed(2)}%`);
}

run().catch(console.error);
