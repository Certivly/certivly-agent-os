import { describe, it, expect } from 'bun:test';
import { ConductorPipeline } from '../src/conductor/ConductorPipeline';

describe('ConductorPipeline (OpenCode Task Lifecycle State Machine)', () => {
  it('1. initializes in context phase and guides step progression', () => {
    const pipeline = new ConductorPipeline('task-101', 'Add OAuth2 PKCE auth flow');
    expect(pipeline.getCurrentPhase()).toBe('context');
    expect(pipeline.formatPhaseGuidance()).toContain('Conduct repository exploration');
  });

  it('2. advances through strict lifecycle: context -> spec -> plan -> implement -> verify -> completed', () => {
    const pipeline = new ConductorPipeline('task-102', 'Implement caching layer');

    // Context -> Spec
    const toSpec = pipeline.transitionTo('spec', {
      artifacts: ['src/cache.ts'],
      specContent: 'interface CacheEngine { get(k: string): Promise<string | null>; }',
    });
    expect(toSpec).toBe(true);
    expect(pipeline.getCurrentPhase()).toBe('spec');

    // Spec -> Plan
    const toPlan = pipeline.transitionTo('plan', {
      planContent: '1. Create CacheEngine interface\n2. Add in-memory provider\n3. Add tests',
    });
    expect(toPlan).toBe(true);
    expect(pipeline.getCurrentPhase()).toBe('plan');

    // Plan -> Implement
    const toImplement = pipeline.transitionTo('implement');
    expect(toImplement).toBe(true);
    expect(pipeline.getCurrentPhase()).toBe('implement');
    pipeline.recordModifiedFile('src/cache/MemoryCache.ts');

    // Implement -> Verify
    const toVerify = pipeline.transitionTo('verify');
    expect(toVerify).toBe(true);
    expect(pipeline.getCurrentPhase()).toBe('verify');

    // Verify -> Completed
    const toComplete = pipeline.transitionTo('completed');
    expect(toComplete).toBe(true);
    expect(pipeline.getCurrentPhase()).toBe('completed');
    expect(pipeline.getState().verified).toBe(true);
    expect(pipeline.getState().modifiedFiles).toContain('src/cache/MemoryCache.ts');
  });

  it('3. rejects invalid phase skips unless fast-track is permitted', () => {
    const pipeline = new ConductorPipeline('task-103', 'Critical hotfix');
    // Cannot skip from context directly to implement without fast-track
    const invalidSkip = pipeline.transitionTo('implement');
    expect(invalidSkip).toBe(false);
    expect(pipeline.getCurrentPhase()).toBe('context');

    // With fast-track permitted
    const fastTrack = pipeline.transitionTo('implement', { allowFastTrack: true });
    expect(fastTrack).toBe(true);
    expect(pipeline.getCurrentPhase()).toBe('implement');
  });

  it('4. allows looping back from verify to implement on test failures', () => {
    const pipeline = new ConductorPipeline('task-104', 'Fix regex bug');
    pipeline.transitionTo('spec', { allowFastTrack: true });
    pipeline.transitionTo('plan', { allowFastTrack: true });
    pipeline.transitionTo('implement');
    pipeline.transitionTo('verify');

    expect(pipeline.getCurrentPhase()).toBe('verify');

    // Tests failed, loop back to implement!
    const loopBack = pipeline.transitionTo('implement', { notes: 'Unit test failed with off-by-one' });
    expect(loopBack).toBe(true);
    expect(pipeline.getCurrentPhase()).toBe('implement');
  });
});
