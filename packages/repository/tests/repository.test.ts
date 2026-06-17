import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { EventStore } from '@agent-os/events';
import { RepositoryIndexer } from '../src/indexer';
import { RepositoryQueryEngine } from '../src/queries';
import { RepositoryWatcher } from '../src/watcher';

describe('Repository Intelligence', () => {
  const testDir = path.join(__dirname, '.test-repo');
  const dbPath = path.join(__dirname, '.agentos', 'test-events.db');
  let eventStore: EventStore;

  beforeEach(() => {
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
    fs.mkdirSync(testDir, { recursive: true });
    
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
    
    eventStore = new EventStore(dbPath);
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should scan files and extract symbols, dependencies, and calls', () => {
    // Write fake TS files
    fs.writeFileSync(path.join(testDir, 'math.ts'), `
      export function add(a: number, b: number) { return a + b; }
      export class Calculator {
        multiply(a: number, b: number) { return a * b; }
      }
    `);

    fs.writeFileSync(path.join(testDir, 'app.ts'), `
      import { add, Calculator } from './math';
      const calc = new Calculator();
      console.log(add(1, 2));
      calc.multiply(3, 4);
    `);

    const indexer = new RepositoryIndexer(eventStore);
    const snapshot = indexer.indexRepository(testDir);
    const query = new RepositoryQueryEngine(snapshot);

    // 1. Files
    expect(snapshot.files.size).toBe(2);
    
    // 2. Symbols
    const mathFileNode = query.findFileByPath('math.ts');
    expect(mathFileNode).toBeDefined();

    const addSymbol = query.findSymbolByName('add');
    expect(addSymbol.length).toBe(1);
    expect(addSymbol[0].type).toBe('Function');
    
    const calcClass = query.findSymbolByName('Calculator');
    expect(calcClass.length).toBe(1);
    expect(calcClass[0].type).toBe('Class');

    const multiplyMethod = query.findSymbolByName('multiply');
    expect(multiplyMethod.length).toBe(1);
    expect(multiplyMethod[0].type).toBe('Method');

    // 3. Dependencies
    const appFileNode = query.findFileByPath('app.ts');
    const appDeps = query.getDependenciesOfFile(appFileNode!.fileId);
    expect(appDeps.length).toBeGreaterThan(0);
    expect(appDeps.some(d => d.targetFileId === './math')).toBe(true);

    // 4. Calls
    const calls = query.getCallGraph();
    // we have console.log, add, and calc.multiply calls in app.ts
    expect(calls.some(c => c.calleeName === 'add')).toBe(true);
    expect(calls.some(c => c.calleeName === 'calc.multiply')).toBe(true);
  });

  it('should incrementally update graph when a file changes', async () => {
    fs.writeFileSync(path.join(testDir, 'index.ts'), `
      export function oldFunc() {}
    `);

    const indexer = new RepositoryIndexer(eventStore);
    const watcher = new RepositoryWatcher(testDir, eventStore, indexer);
    
    let snapshot = watcher.getSnapshot();
    let query = new RepositoryQueryEngine(snapshot);
    expect(query.findSymbolByName('oldFunc').length).toBe(1);
    expect(query.findSymbolByName('newFunc').length).toBe(0);

    // Mutate file
    fs.writeFileSync(path.join(testDir, 'index.ts'), `
      export function newFunc() {}
    `);

    // Manually trigger handleFileChanged instead of waiting for chokidar event in tests
    // @ts-ignore
    watcher.handleFileChanged(path.join(testDir, 'index.ts'), 'change');

    // Yield macro task for ts-morph async dynamic import in watcher
    await new Promise(r => setTimeout(r, 50));

    snapshot = watcher.getSnapshot();
    query = new RepositoryQueryEngine(snapshot);

    expect(query.findSymbolByName('oldFunc').length).toBe(0);
    expect(query.findSymbolByName('newFunc').length).toBe(1);
  });
});
