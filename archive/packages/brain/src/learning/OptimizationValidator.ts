import { EventStore, RuntimeEvent } from '@agent-os/events';
import { OptimizationPlan, OptimizationEvents, Skill, SkillContext, SkillResult } from './types';
import { EquivalenceTester } from './EquivalenceTester';

/** Validates optimization plans against real skill runs. Moved from @agent-os/seol. */
export class OptimizationValidator {
  constructor(
    private eventStore: EventStore,
    private equivalenceTester: EquivalenceTester
  ) {}

  public async validate(
    plan: OptimizationPlan,
    originalSkill: Skill,
    optimizedSkill: Skill,
    ctx: SkillContext,
    input: any
  ): Promise<boolean> {
    this.eventStore.append({
      id: crypto.randomUUID(),
      eventType: OptimizationEvents.VALIDATION_STARTED,
      timestamp: new Date().toISOString(),
      requestId: ctx.requestId,
      sessionId: ctx.sessionId,
      source: 'brain.optimization',
      payload: { planId: plan.id, skillId: originalSkill.id },
      version: "1.0"
    });

    try {
      const ogEvents: RuntimeEvent[]  = [];
      const optEvents: RuntimeEvent[] = [];

      const makeEventProxy = (captured: RuntimeEvent[]) =>
        new Proxy(ctx.events, {
          get: (target, prop) =>
            prop === 'append'
              ? (e: RuntimeEvent) => captured.push(e)
              : (target as any)[prop]
        });

      const originalOutput  = await originalSkill.execute({ ...ctx, events: makeEventProxy(ogEvents) as any }, input);
      const optimizedOutput = await optimizedSkill.execute({ ...ctx, events: makeEventProxy(optEvents) as any }, input);

      const passed = this.equivalenceTester.assertEquivalent(originalOutput, optimizedOutput, ogEvents, optEvents);

      this.eventStore.append({
        id: crypto.randomUUID(),
        eventType: passed ? OptimizationEvents.VALIDATION_PASSED : OptimizationEvents.VALIDATION_FAILED,
        timestamp: new Date().toISOString(),
        requestId: ctx.requestId,
        sessionId: ctx.sessionId,
        source: 'brain.optimization',
        payload: { planId: plan.id, skillId: originalSkill.id },
        version: "1.0"
      });

      return passed;
    } catch (e: any) {
      this.eventStore.append({
        id: crypto.randomUUID(),
        eventType: OptimizationEvents.VALIDATION_FAILED,
        timestamp: new Date().toISOString(),
        requestId: ctx.requestId,
        sessionId: ctx.sessionId,
        source: 'brain.optimization',
        payload: { planId: plan.id, skillId: originalSkill.id, reason: e.message },
        version: "1.0"
      });
      return false;
    }
  }
}
