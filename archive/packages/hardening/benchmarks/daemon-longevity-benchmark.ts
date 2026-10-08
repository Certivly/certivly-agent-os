import { execSync } from 'child_process';
import * as path from 'path';

async function run() {
  const durationArg = process.argv.find(a => a.startsWith('--duration='));
  const durationStr = durationArg ? durationArg.split('=')[1] : '1m';
  
  let durationMs = 60000; // default 1 min
  if (durationStr.endsWith('h')) {
    durationMs = parseInt(durationStr) * 60 * 60 * 1000;
  } else if (durationStr.endsWith('m')) {
    durationMs = parseInt(durationStr) * 60 * 1000;
  } else if (durationStr.endsWith('s')) {
    durationMs = parseInt(durationStr) * 1000;
  }

  console.log(`=== Daemon Longevity Benchmark ===`);
  console.log(`Configured Duration: ${durationStr} (${durationMs}ms)`);

  const start = Date.now();
  let cycles = 0;

  while (Date.now() - start < durationMs) {
    console.log(`\n--- Cycle ${cycles + 1} ---`);
    console.log(`Elapsed: ${Math.floor((Date.now() - start)/1000)}s`);
    
    // Run all benchmarks in sequence
    execSync(`bun run ${path.join(__dirname, 'event-storm-benchmark.ts')}`, { stdio: 'inherit' });
    execSync(`bun run ${path.join(__dirname, 'runtime-saturation-benchmark.ts')}`, { stdio: 'inherit' });
    execSync(`bun run ${path.join(__dirname, 'session-storm-benchmark.ts')}`, { stdio: 'inherit' });
    execSync(`bun run ${path.join(__dirname, 'repository-storm-benchmark.ts')}`, { stdio: 'inherit' });
    
    cycles++;
  }

  console.log(`\n=== Longevity Test Complete ===`);
  console.log(`Total Time: ${durationStr}`);
  console.log(`Total Benchmark Cycles Completed: ${cycles}`);
}

run().catch(console.error);
