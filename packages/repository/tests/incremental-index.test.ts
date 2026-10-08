import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as path from 'path';
import * as fs from 'fs';
import { RepositoryIndexer } from '../src/indexer';
import { EventStore } from '@agent-os/events';

describe('Action 2.11: Incremental Repository Index Cache', () => {
  const tmpRepo = path.resolve(__dirname, '.tmp-incremental-index-' + Date.now());
  let eventStore: EventStore;
  let indexer: RepositoryIndexer;

  beforeEach(() => {
    fs.mkdirSync(path.join(tmpRepo, 'src'), { recursive: true });
    eventStore = new EventStore(path.join(tmpRepo, 'events.db'));
    indexer = new RepositoryIndexer(eventStore);

    // Initial files
    fs.writeFileSync(
      path.join(tmpRepo, 'src', 'math.ts'),
      'export function add(a: number, b: number): number {\n  return a + b;\n}\n'
    );
    fs.writeFileSync(
      path.join(tmpRepo, 'src', 'greet.ts'),
      'export function greet(name: string): string {\n  return "Hello " + name;\n}\n'
    );
    fs.writeFileSync(
      path.join(tmpRepo, 'src', 'utils.ts'),
      'export const version = "1.0.0";\n'
    );

    // .gitignore
    fs.writeFileSync(path.join(tmpRepo, '.gitignore'), 'ignored.secret\n*.log\n');
    fs.writeFileSync(path.join(tmpRepo, 'ignored.secret'), 'secret_token_123');
    fs.writeFileSync(path.join(tmpRepo, 'test.log'), 'test log output');

    // .agentos/sandboxes directory
    fs.mkdirSync(path.join(tmpRepo, '.agentos', 'sandboxes', 'sb-1'), { recursive: true });
    fs.writeFileSync(path.join(tmpRepo, '.agentos', 'sandboxes', 'sb-1', 'scratch.ts'), 'export const scratch = 1;');

    // Large file (> 1 MB)
    const largeContent = 'A'.repeat(1024 * 1024 + 10);
    fs.writeFileSync(path.join(tmpRepo, 'src', 'huge.txt'), largeContent);

    // Binary file
    const binaryData = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe]);
    fs.writeFileSync(path.join(tmpRepo, 'src', 'image.png'), binaryData);
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpRepo, { recursive: true, force: true });
    } catch {}
  });

  it('runs cold, warm, single-edit, delete, ignore, and large-file index passes', async () => {
    // 1. Cold index parses files
    const coldStart = performance.now();
    const coldSnapshot = await indexer.indexRepository(tmpRepo);
    const coldTime = performance.now() - coldStart;

    expect(indexer.lastIndexStats).toBeDefined();
    const coldStats = indexer.lastIndexStats!;
    expect(coldStats.parsedFiles).toBe(4); // math.ts, greet.ts, utils.ts, .gitignore
    expect(coldStats.cachedFiles).toBe(0);
    expect(coldSnapshot.files.size).toBe(4);

    // Verify cache file exists under .agentos/index/cache.json
    const cachePath = path.join(tmpRepo, '.agentos', 'index', 'cache.json');
    expect(fs.existsSync(cachePath)).toBe(true);

    // 2. Warm index parses zero unchanged files
    const warmStart = performance.now();
    const warmSnapshot = await indexer.indexRepository(tmpRepo);
    const warmTime = performance.now() - warmStart;

    const warmStats = indexer.lastIndexStats!;
    expect(warmStats.parsedFiles).toBe(0);
    expect(warmStats.cachedFiles).toBe(4);
    expect(warmSnapshot.files.size).toBe(4);

    // 3. One changed file parses only one file
    fs.writeFileSync(
      path.join(tmpRepo, 'src', 'math.ts'),
      'export function add(a: number, b: number): number {\n  // updated comment\n  return a + b;\n}\n'
    );

    const editStart = performance.now();
    const editSnapshot = await indexer.indexRepository(tmpRepo);
    const editTime = performance.now() - editStart;

    const editStats = indexer.lastIndexStats!;
    expect(editStats.parsedFiles).toBe(1);
    expect(editStats.cachedFiles).toBe(3);
    expect(editSnapshot.files.size).toBe(4);

    // 4. Deleted file disappears from snapshot
    fs.unlinkSync(path.join(tmpRepo, 'src', 'greet.ts'));
    const delSnapshot = await indexer.indexRepository(tmpRepo);
    expect(delSnapshot.files.size).toBe(3);
    const deletedFileExists = Array.from(delSnapshot.files.values()).some(f => f.path.includes('greet.ts'));
    expect(deletedFileExists).toBe(false);

    // 5. Ignored files skipped
    const filesArray = Array.from(delSnapshot.files.values());
    expect(filesArray.some(f => f.path.includes('ignored.secret'))).toBe(false);
    expect(filesArray.some(f => f.path.includes('test.log'))).toBe(false);

    // 6. .agentos/sandboxes skipped
    expect(filesArray.some(f => f.path.includes('.agentos'))).toBe(false);

    // 7. Large files and binaries skipped
    expect(filesArray.some(f => f.path.includes('huge.txt'))).toBe(false);
    expect(filesArray.some(f => f.path.includes('image.png'))).toBe(false);

    // Print benchmark numbers
    console.log('\n--- Action 2.11 Benchmark Numbers ---');
    console.log(`Cold Index Time:        ${coldTime.toFixed(2)} ms`);
    console.log(`Warm Index Time:        ${warmTime.toFixed(2)} ms`);
    console.log(`One-File-Changed Time:  ${editTime.toFixed(2)} ms`);
    console.log('-------------------------------------\n');
  });
});
