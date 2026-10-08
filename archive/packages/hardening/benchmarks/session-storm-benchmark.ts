import { SessionCoordinator } from '../../daemon/src/sessions/SessionCoordinator';
import { RuntimePool } from '../../daemon/src/sessions/RuntimePool';
import { RepositoryCache } from '../../daemon/src/repositories/RepositoryCache';
import { RepositoryRegistry } from '../../daemon/src/repositories/RepositoryRegistry';
import { MemoryInspector } from '../src/diagnostics/MemoryInspector';

async function run() {
  console.log("=== Session Storm Benchmark ===");
  console.log("Target: 1,000 rapid session reconnects");

  const pool = new RuntimePool(5000);
  const registry = new RepositoryRegistry();
  const cache = new RepositoryCache(registry);
  const coordinator = new SessionCoordinator(pool, cache);
  const inspector = new MemoryInspector();

  if (global.gc) global.gc();
  console.log("Initial Heap:");
  inspector.report();

  const start = performance.now();
  let completedCycles = 0;

  for (let cycle = 0; cycle < 1000; cycle++) {
    // 50 parallel reconnections per cycle
    const promises = [];
    for (let i = 0; i < 50; i++) {
      const sessionId = `session-${i}`;
      promises.push((async () => {
        // Disconnect
        coordinator.endSession(sessionId);
        // Random wait up to 5ms
        await new Promise(r => setTimeout(r, Math.random() * 5));
        // Reconnect
        coordinator.createSession(sessionId, 'bench-repo', process.cwd(), sessionId);
      })());
    }
    await Promise.all(promises);
    completedCycles++;
  }

  const totalTimeMs = performance.now() - start;

  if (global.gc) global.gc();
  console.log("\nFinal Heap (Should be roughly equal to Initial Heap):");
  inspector.report();

  console.log(`\nResults:`);
  console.log(`Total Cycles: ${completedCycles} (50,000 connect/disconnect events)`);
  console.log(`Active Sessions: ${coordinator['sessions'].size}`);
  console.log(`Total Time: ${(totalTimeMs / 1000).toFixed(2)}s`);
}

run().catch(console.error);
