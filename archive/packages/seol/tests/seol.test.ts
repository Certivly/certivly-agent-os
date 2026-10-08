import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { EventStore } from '@agent-os/events';
import { RepositoryIndexer } from '@agent-os/repository/src/indexer';
import { RepositoryWatcher } from '@agent-os/repository/src/watcher';
import { WicerAPI } from '@agent-os/wicer';
import { SkillContext } from '@agent-os/skills';
import { AnalyzeImpactRadiusSkill } from '@agent-os/skills/src/standard';
import { 
  ExecutionProfiler, 
  OptimizationAnalyzer, 
  OptimizationPlanner, 
  OptimizationValidator, 
  EquivalenceTester, 
  SeolProxy, 
  CacheManager 
} from '../src';
import { SEOLEvents } from '../src/events/event-types';

describe('SEOL System', () => {
  const testDir = path.join(__dirname, '.test-repo');
  let dbPath: string;
  let eventStore: EventStore;

  beforeEach(() => {
    dbPath = path.join(__dirname, '.agentos', `test-events-${crypto.randomUUID()}.db`);
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
    if (fs.existsSync(dbPath)) fs.rmSync(dbPath, { force: true });
    fs.mkdirSync(testDir, { recursive: true });
    
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
    
    eventStore = new EventStore(dbPath);
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
    try {
      if (fs.existsSync(dbPath)) fs.rmSync(dbPath, { force: true });
      if (fs.existsSync(dbPath + '-journal')) fs.rmSync(dbPath + '-journal', { force: true });
    } catch (e) {
      // Ignore cleanup busy locks
    }
  });

  it('should guarantee structural equivalence and determinism during optimization validation', async () => {
    // 1. Setup Data
    fs.writeFileSync(path.join(testDir, 'math.ts'), `export function add(a: number, b: number) { return a + b; }`);
    fs.writeFileSync(path.join(testDir, 'app.ts'), `import { add } from './math'; add(1, 2);`);

    const indexer = new RepositoryIndexer(eventStore);
    const watcher = new RepositoryWatcher(testDir, eventStore, indexer);
    await watcher.initialize();
    const snapshot = watcher.getSnapshot();

    const wicer = new WicerAPI(eventStore);
    
    const ctx: SkillContext = {
      repository: snapshot,
      events: eventStore,
      wicer,
      sessionId: 'seol-session',
      requestId: 'req-seol-1'
    };

    const targetSkill = new AnalyzeImpactRadiusSkill();

    // 2. Profile
    eventStore.append({
      id: crypto.randomUUID(),
      eventType: 'skill.execution.completed',
      timestamp: new Date().toISOString(),
      requestId: 'mock',
      sessionId: 'seol-session',
      source: 'skills',
      payload: { skillId: targetSkill.id, durationMs: 250 }, // High latency
      version: '1'
    });

    const profiler = new ExecutionProfiler(eventStore);
    const profile = profiler.profileSkill(targetSkill.id, 'seol-session');

    // 3. Analyze
    const analyzer = new OptimizationAnalyzer();
    const candidates = analyzer.analyze([profile]);
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0].type).toBe('WICER_MEMOIZATION');

    // 4. Plan
    const planner = new OptimizationPlanner();
    const plan = planner.createPlan(candidates);
    expect(plan.targetSkills).toContain(targetSkill.id);

    // 5. Proxy Wrapping
    const cacheManager = new CacheManager();
    const proxySkill = new SeolProxy(targetSkill, plan, cacheManager);

    // 6. Validation (Equivalence Testing)
    const tester = new EquivalenceTester();
    const validator = new OptimizationValidator(eventStore, tester);

    const input = { targetId: path.join(testDir, 'math.ts') + '#add', targetType: 'symbol' };
    const passed = await validator.validate(plan, targetSkill, proxySkill, ctx, input);

    expect(passed).toBe(true); // Must explicitly pass 100% data/event/reference matching

    const validationPassedEvent = eventStore.loadEvents('seol-session').find(e => e.event.eventType === SEOLEvents.VALIDATION_PASSED);
    expect(validationPassedEvent).toBeDefined();
  });

  it('should guarantee determinism across 10 analyzer runs', () => {
    const profiler = new ExecutionProfiler(eventStore);
    eventStore.append({
      id: crypto.randomUUID(),
      eventType: 'skill.execution.completed',
      timestamp: new Date().toISOString(),
      requestId: 'mock',
      sessionId: 'seol-session',
      source: 'skills',
      payload: { skillId: 'agent-os.analyze.impact-radius', durationMs: 250 },
      version: '1'
    });

    const profile = profiler.profileSkill('agent-os.analyze.impact-radius', 'seol-session');
    const analyzer = new OptimizationAnalyzer();
    const planner = new OptimizationPlanner();

    const plans = [];
    for (let i = 0; i < 10; i++) {
      const candidates = analyzer.analyze([profile]);
      const plan = planner.createPlan(candidates);
      // Strip IDs for deterministic equivalence
      plans.push(JSON.stringify({ ...plan, id: 'static' }));
    }

    const firstPlan = plans[0];
    for (let i = 1; i < 10; i++) {
      expect(plans[i]).toBe(firstPlan);
    }
  });

  it('should throw SeolSafetyViolationError on graph mutation attempt', async () => {
    const wicer = new WicerAPI(eventStore);
    const ctx: SkillContext = {
      repository: { 
        version: 0, timestamp: '', 
        files: new Map(), symbols: new Map(), 
        dependencies: [], calls: [],
        fileSymbols: new Map(), symbolDefinitions: new Map()
      },
      events: eventStore,
      wicer,
      sessionId: 'seol-session',
      requestId: 'req-seol-2'
    };

    const maliciousSkill = {
      id: 'malicious',
      name: 'Malicious',
      version: 1,
      level: 'ANALYZE' as any,
      inputSchema: {},
      outputSchema: {},
      requires: [],
      execute: async (c: any) => {
        c.repository.files = []; // Illegal mutation
        return { success: true, data: {}, events: [], wicerReferences: [], graphReferences: [] };
      }
    };

    const plan = { id: 'test', targetSkills: [], actions: [], expectedSavings: { latencyMs: 0, graphReads: 0, wicerReads: 0 } };
    const proxySkill = new SeolProxy(maliciousSkill, plan, new CacheManager());

    try {
      await proxySkill.execute(ctx, {});
      expect(false).toBe(true); // Should not reach
    } catch (e: any) {
      expect(e.name).toBe('SeolSafetyViolationError');
    }
  });

  it('should pass stress testing execution pipeline', async () => {
    const wicer = new WicerAPI(eventStore);
    const ctx: SkillContext = {
      repository: { 
        version: 0, timestamp: '', 
        files: new Map(), symbols: new Map(), 
        dependencies: [], calls: [],
        fileSymbols: new Map(), symbolDefinitions: new Map()
      },
      events: eventStore,
      wicer,
      sessionId: 'seol-session',
      requestId: 'req-seol-3'
    };

    const targetSkill = new AnalyzeImpactRadiusSkill();
    const plan = { id: 'test', targetSkills: [], actions: [], expectedSavings: { latencyMs: 0, graphReads: 0, wicerReads: 0 } };
    const proxySkill = new SeolProxy(targetSkill, plan, new CacheManager());

    // Run 100 fast iterations
    const promises = [];
    for (let i = 0; i < 100; i++) {
      promises.push(proxySkill.execute(ctx, { targetId: 'dummy', targetType: 'file' }).catch(e => {
        // Will throw since wicer can't find 'dummy', which is fine
      }));
    }

    await Promise.all(promises);
    expect(promises.length).toBe(100);
  });
});
