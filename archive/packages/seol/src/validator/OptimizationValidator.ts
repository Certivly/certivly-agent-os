import { EventStore, RuntimeEvent } from '@agent-os/events';
import { Skill, SkillContext, SkillResult } from '@agent-os/skills';
import { OptimizationPlan } from '../planner/types';
import { EquivalenceTester } from './EquivalenceTester';
import { SEOLEvents } from '../events/event-types';

export class OptimizationValidator {
  constructor(private eventStore: EventStore, private equivalenceTester: EquivalenceTester) {}

  public async validate(
    plan: OptimizationPlan,
    originalSkill: Skill,
    optimizedSkill: Skill,
    ctx: SkillContext,
    input: any
  ): Promise<boolean> {
    this.eventStore.append({
      id: crypto.randomUUID(),
      eventType: SEOLEvents.VALIDATION_STARTED,
      timestamp: new Date().toISOString(),
      requestId: ctx.requestId,
      sessionId: ctx.sessionId,
      source: 'seol',
      payload: { planId: plan.id, skillId: originalSkill.id },
      version: '1'
    });

    try {
      // Create isolated event stores to capture emitted events during trial
      const ogEvents: RuntimeEvent[] = [];
      const optEvents: RuntimeEvent[] = [];

      const ogEventStoreProxy = new Proxy(ctx.events, {
        get: (target, prop) => {
          if (prop === 'append') {
            return (e: RuntimeEvent) => {
              ogEvents.push(e);
              // don't actually persist
            };
          }
          // @ts-ignore
          return target[prop];
        }
      });

      const optEventStoreProxy = new Proxy(ctx.events, {
        get: (target, prop) => {
          if (prop === 'append') {
            return (e: RuntimeEvent) => {
              optEvents.push(e);
            };
          }
          // @ts-ignore
          return target[prop];
        }
      });

      const ogCtx = { ...ctx, events: ogEventStoreProxy as any };
      const optCtx = { ...ctx, events: optEventStoreProxy as any };

      const originalOutput = await originalSkill.execute(ogCtx, input);
      const optimizedOutput = await optimizedSkill.execute(optCtx, input);

      const isEquivalent = this.equivalenceTester.assertEquivalent(
        originalOutput,
        optimizedOutput,
        ogEvents,
        optEvents
      );

      if (isEquivalent) {
        this.eventStore.append({
          id: crypto.randomUUID(),
          eventType: SEOLEvents.VALIDATION_PASSED,
          timestamp: new Date().toISOString(),
          requestId: ctx.requestId,
          sessionId: ctx.sessionId,
          source: 'seol',
          payload: { planId: plan.id, skillId: originalSkill.id },
          version: '1'
        });
        return true;
      } else {
        this.eventStore.append({
          id: crypto.randomUUID(),
          eventType: SEOLEvents.VALIDATION_FAILED,
          timestamp: new Date().toISOString(),
          requestId: ctx.requestId,
          sessionId: ctx.sessionId,
          source: 'seol',
          payload: { planId: plan.id, skillId: originalSkill.id, reason: 'Equivalence check failed' },
          version: '1'
        });
        return false;
      }
    } catch (e: any) {
      this.eventStore.append({
        id: crypto.randomUUID(),
        eventType: SEOLEvents.VALIDATION_FAILED,
        timestamp: new Date().toISOString(),
        requestId: ctx.requestId,
        sessionId: ctx.sessionId,
        source: 'seol',
        payload: { planId: plan.id, skillId: originalSkill.id, reason: e.message },
        version: '1'
      });
      return false;
    }
  }
}
