import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { EventStore } from '@agent-os/events';
import { RepositoryIndexer } from '@agent-os/repository/src/indexer';
import { RepositoryWatcher } from '@agent-os/repository/src/watcher';
import { WicerAPI } from '@agent-os/wicer';
import { SkillRegistry, SkillExecutor, SkillContext } from '../src';
import { AnalyzeImpactRadiusSkill, AnalyzeDependencyChainSkill } from '../src/standard';

describe('Skill System Execution', () => {
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

  it('should deterministically execute an impact analysis skill', async () => {
    // 1. Setup Phase 3 Repo
    fs.writeFileSync(path.join(testDir, 'math.ts'), `
      export function add(a: number, b: number) { return a + b; }
    `);
    fs.writeFileSync(path.join(testDir, 'app.ts'), `
      import { add } from './math';
      add(1, 2);
    `);

    const indexer = new RepositoryIndexer(eventStore);
    const watcher = new RepositoryWatcher(testDir, eventStore, indexer);
    await watcher.initialize();
    const snapshot = watcher.getSnapshot();

    // 2. Setup Phase 4 WiCER
    const wicer = new WicerAPI(eventStore);

    // 3. Setup Phase 5 Skills
    const registry = new SkillRegistry();
    const executor = new SkillExecutor(registry);

    registry.register(new AnalyzeImpactRadiusSkill());
    registry.register(new AnalyzeDependencyChainSkill());

    const ctx: SkillContext = {
      repository: snapshot,
      events: eventStore,
      wicer,
      sessionId: 'test-session',
      requestId: 'req-123'
    };

    const targetSymbolId = path.join(testDir, 'math.ts') + '#add';

    const result = await executor.executeSkill('agent-os.analyze.impact-radius', ctx, {
      targetId: targetSymbolId,
      targetType: 'symbol'
    });

    expect(result.success).toBe(true);
    expect(result.data.impactedFilesCount).toBeGreaterThan(0);
    expect(result.data.impactedSymbolsCount).toBeGreaterThan(0);
    expect(result.wicerReferences.length).toBe(1); // One impact report generated
    expect(result.graphReferences.length).toBeGreaterThan(1); // the target, the file, the caller symbol
  });

  it('should enforce dependency validation', () => {
    const registry = new SkillRegistry();
    registry.register({
      id: 'skill-b',
      name: 'Skill B',
      version: 1,
      level: 'ANALYZE' as any,
      inputSchema: {},
      outputSchema: {},
      requires: [{ skillId: 'skill-a', minVersion: 2 }],
      execute: async () => ({} as any)
    });

    // Should throw missing dependency
    expect(() => registry.resolveExecutionOrder('skill-b')).toThrow('Missing dependency: skill-a');

    registry.register({
      id: 'skill-a',
      name: 'Skill A',
      version: 1,
      level: 'ANALYZE' as any,
      inputSchema: {},
      outputSchema: {},
      requires: [],
      execute: async () => ({} as any)
    });

    // Should throw version mismatch
    expect(() => registry.resolveExecutionOrder('skill-b')).toThrow('Version mismatch: skill-a requires >= 2, but got 1');
  });
});
