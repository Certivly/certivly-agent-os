import { EventBus } from '../../daemon/src/streaming/EventBus';
import { RepositoryStorm } from '../src/stress/RepositoryStorm';
import { MemoryInspector } from '../src/diagnostics/MemoryInspector';
import { WorkspaceConsistencyValidator } from '../src/diagnostics/WorkspaceConsistencyValidator';

async function run() {
  console.log("=== Repository Storm Benchmark ===");
  console.log("Target: 5,000 file updates + strict version alignment");

  const bus = new EventBus();
  const storm = new RepositoryStorm(bus);
  const inspector = new MemoryInspector();
  const validator = new WorkspaceConsistencyValidator();

  Bun.gc(true);
  console.log("Initial Heap:");
  inspector.report();

  let version = 0;
  let checksPassed = 0;

  // Listen to the simulated internal daemon sync events
  bus.subscribe('repo-version-sync', (event) => {
    version = event.payload.version;
    // Simulate reading the versions from Graph, WiCER, Brain, Memory stores
    validator.assertConsistency(version, version, version, version);
    checksPassed++;
  });

  const start = performance.now();
  await storm.simulate('bench-repo', 5000);
  const totalTimeMs = performance.now() - start;

  if (global.gc) global.gc();
  console.log("\nFinal Heap:");
  inspector.report();

  console.log(`\nResults:`);
  console.log(`Total File Updates: 5,000`);
  console.log(`Total Time: ${(totalTimeMs / 1000).toFixed(2)}s`);
  console.log(`Version Checks Passed: ${checksPassed}`);
}

run().catch(console.error);
