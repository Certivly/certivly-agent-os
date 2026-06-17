import * as fs from 'fs';
import * as path from 'path';
import { EventStore } from '../packages/events/src/store';
import { RepositoryIndexer } from '../packages/repository/src/indexer';
import { metrics } from '../packages/metrics/src';

const NUM_FILES = 5000;
const testDir = path.join(__dirname, '.benchmark-repo');

async function runBenchmark() {
  console.log(`Starting Repository Intelligence Benchmark (${NUM_FILES} files)...`);
  
  if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
  fs.mkdirSync(testDir, { recursive: true });

  const genStart = performance.now();
  for (let i = 0; i < NUM_FILES; i++) {
    fs.writeFileSync(path.join(testDir, `file_${i}.ts`), `
      import { add } from './file_0';
      export class Class${i} {
        method${i}() {
          return add(${i}, ${i});
        }
      }
    `);
  }
  
  fs.writeFileSync(path.join(testDir, 'file_0.ts'), `
    export function add(a: number, b: number) { return a + b; }
  `);
  const genEnd = performance.now();
  console.log(`Generated ${NUM_FILES} files in ${(genEnd - genStart).toFixed(2)}ms`);

  const eventStore = new EventStore(':memory:');
  const indexer = new RepositoryIndexer(eventStore);

  const idxStart = performance.now();
  const snapshot = indexer.indexRepository(testDir);
  const idxEnd = performance.now();
  console.log(`Full Repository Indexing: ${(idxEnd - idxStart).toFixed(2)}ms`);

  console.log(`Nodes Extracted:`);
  console.log(`- Files: ${snapshot.files.size}`);
  console.log(`- Symbols: ${snapshot.symbols.size}`);
  console.log(`- Dependencies: ${snapshot.dependencies.length}`);
  console.log(`- Calls: ${snapshot.calls.length}`);

  const snap = metrics.snapshot();
  console.log('\nMetrics Snapshot:');
  console.log(JSON.stringify(snap, null, 2));

  fs.rmSync(testDir, { recursive: true, force: true });
}

runBenchmark().catch(console.error);
