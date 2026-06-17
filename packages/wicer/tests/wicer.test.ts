import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { EventStore } from '@agent-os/events';
import { RepositoryIndexer } from '@agent-os/repository/src/indexer';
import { WicerAPI } from '../src/api';
import { RepositoryWatcher } from '@agent-os/repository/src/watcher';

describe('WiCER Knowledge Layer', () => {
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

  it('should deterministically generate knowledge from graph', async () => {
    // 1. Create source
    fs.writeFileSync(path.join(testDir, 'math.ts'), `
      export function add(a: number, b: number) { return a + b; }
    `);

    fs.writeFileSync(path.join(testDir, 'app.ts'), `
      import { add } from './math';
      add(1, 2);
    `);

    // 2. Generate Phase 3 Graph
    const indexer = new RepositoryIndexer(eventStore);
    const watcher = new RepositoryWatcher(testDir, eventStore, indexer);
    await watcher.initialize();
    const snapshot = watcher.getSnapshot();

    // 3. Init Phase 4 WiCER
    const wicer = new WicerAPI(eventStore);

    const mathFileId = path.join(testDir, 'math.ts');
    const appFileId = path.join(testDir, 'app.ts');

    // Test File Wiki
    const appWiki = wicer.explainFile(appFileId, snapshot);
    expect(appWiki.title).toBe(`File: app.ts`);
    expect(appWiki.content).toContain('#global calls add'); // call relationship

    // Test Symbol Wiki
    const addSymbolId = `${mathFileId}#add`;
    const symbolWiki = wicer.explainSymbol(addSymbolId, snapshot);
    expect(symbolWiki.title).toBe('Symbol: add');
    expect(symbolWiki.content).toContain('Callers (Inbound):');
    expect(symbolWiki.content).toContain(`${appFileId}#global`);

    // Test Impact
    const impact = wicer.explainImpact(addSymbolId, 'symbol', snapshot);
    expect(impact.content).toContain(`Total impacted files: 1`); // app.ts is impacted
    expect(impact.content).toContain(`Total impacted symbols: 1`); // global in app.ts

    // Test Snapshot Generator
    wicer.generateWikiSnapshot(snapshot);
    const docsDir = path.join(process.cwd(), '.agentos', 'docs');
    expect(fs.existsSync(docsDir)).toBe(true);
    expect(fs.existsSync(path.join(docsDir, 'file'))).toBe(true);
    expect(fs.existsSync(path.join(docsDir, 'symbol'))).toBe(true);
  });
});
