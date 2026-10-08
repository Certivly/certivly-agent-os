import { MemoryInspector } from '../src/diagnostics/MemoryInspector';
import { EventBus } from '../../daemon/src/streaming/EventBus';
import { RepositoryStorm } from '../src/stress/RepositoryStorm';

async function runBenchmark() {
  console.log("=== Daemon Production Benchmark ===");
  const inspector = new MemoryInspector();
  inspector.report();

  console.log("Simulating 5,000 file updates...");
  const bus = new EventBus();
  const storm = new RepositoryStorm(bus);
  
  await storm.simulate('bench-repo', 5000);

  console.log("After Storm:");
  inspector.report();
  console.log("Benchmark Complete.");
}

runBenchmark().catch(console.error);
