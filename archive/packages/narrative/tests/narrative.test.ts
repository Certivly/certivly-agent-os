import { describe, expect, it } from 'bun:test';
import { ActivityClassifier } from '../src/ActivityClassifier';
import { ProgressTracker } from '../src/ProgressTracker';
import { ExecutionPhase } from '../src/ExecutionPhase';

describe('Narrative Engine Core', () => {

  describe('ActivityClassifier', () => {
    const classifier = new ActivityClassifier();

    it('should classify repository.scan.started', () => {
      const cls = classifier.classify({
        id: '1',
        eventType: 'repository.scan.started',
        timestamp: new Date().toISOString(),
        requestId: 'req',
        sessionId: 'sess',
        source: 'test',
        payload: {},
        version: '1.0'
      });
      expect(cls).not.toBeNull();
      expect(cls?.phase).toBe(ExecutionPhase.UNDERSTAND);
      expect(cls?.message).toBe('Reading repository');
      expect(cls?.isComplete).toBe(false);
    });

    it('should classify repository.scan.completed as complete', () => {
      const cls = classifier.classify({
        id: '2',
        eventType: 'repository.scan.completed',
        timestamp: new Date().toISOString(),
        requestId: 'req',
        sessionId: 'sess',
        source: 'test',
        payload: {},
        version: '1.0'
      });
      expect(cls?.isComplete).toBe(true);
    });

    it('should prioritize narrative hints from skills', () => {
      const cls = classifier.classify({
        id: '3',
        eventType: 'skill.execution.started',
        timestamp: new Date().toISOString(),
        requestId: 'req',
        sessionId: 'sess',
        source: 'test',
        payload: {
          narrativeHints: {
            activity: 'Tracing login flow',
            phase: ExecutionPhase.ANALYZE
          }
        },
        version: '1.0'
      });
      expect(cls?.message).toBe('Tracing login flow');
      expect(cls?.phase).toBe(ExecutionPhase.ANALYZE);
    });
    
    it('should process overhead under 5ms', () => {
      const start = performance.now();
      for (let i = 0; i < 100; i++) {
        classifier.classify({
          id: `bench-${i}`,
          eventType: 'repository.scan.started',
          timestamp: new Date().toISOString(),
          requestId: 'req',
          sessionId: 'sess',
          source: 'test',
          payload: {},
          version: '1.0'
        });
      }
      const duration = performance.now() - start;
      expect(duration).toBeLessThan(5);
    });
  });

  describe('ProgressTracker', () => {
    const tracker = new ProgressTracker();

    it('should transition phases', () => {
      tracker.startPhase(ExecutionPhase.ANALYZE);
      expect(tracker.currentPhase()).toBe(ExecutionPhase.ANALYZE);
    });

    it('should track activity lifecycle', () => {
      tracker.startActivity('act-1', 'Tracing code');
      expect(tracker.hasActivity('act-1')).toBe(true);
      
      let snap = tracker.snapshot();
      expect(snap.activities.length).toBe(1);
      expect(snap.activities[0].status).toBe('active');

      tracker.completeActivity('act-1');
      snap = tracker.snapshot();
      expect(snap.activities[0].status).toBe('completed');
      expect(snap.activities[0].completedAt).toBeDefined();
    });
  });

});
