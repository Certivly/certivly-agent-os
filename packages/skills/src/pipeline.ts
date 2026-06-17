import { SkillRegistry } from './registry';
import { SkillContext, SkillResult } from './models';
import { metrics } from '@agent-os/metrics';

export class SkillExecutor {
  constructor(private registry: SkillRegistry) {}

  public async executeSkill(skillId: string, ctx: SkillContext, input: any): Promise<SkillResult> {
    const startMs = performance.now();
    
    // Resolve order ensures dependencies are checked
    const executionOrder = this.registry.resolveExecutionOrder(skillId);
    
    ctx.events.append({
      id: crypto.randomUUID(),
      eventType: 'skill.execution.started',
      timestamp: new Date().toISOString(),
      requestId: ctx.requestId,
      sessionId: ctx.sessionId,
      source: 'skills',
      payload: { skillId, input },
      version: 1
    });

    const targetSkill = this.registry.get(skillId);

    // In a full implementation, we might execute the dependencies if they generate needed side-effects.
    // For now, we assume skills are composable functions and just execute the requested target directly
    // after verifying it exists and dependencies are met.

    try {
      const result = await targetSkill.execute(ctx, input);
      
      const duration = performance.now() - startMs;
      // @ts-ignore
      if (metrics.histogram) metrics.histogram('skill_execution_duration').observe(duration);
      metrics.counter('skill_success_rate').inc();

      ctx.events.append({
        id: crypto.randomUUID(),
        eventType: 'skill.execution.completed',
        timestamp: new Date().toISOString(),
        requestId: ctx.requestId,
        sessionId: ctx.sessionId,
        source: 'skills',
        payload: { skillId, success: true, durationMs: duration },
        version: 1
      });

      return result;
    } catch (error: any) {
      metrics.counter('skill_failure_rate').inc();
      
      ctx.events.append({
        id: crypto.randomUUID(),
        eventType: 'skill.execution.failed',
        timestamp: new Date().toISOString(),
        requestId: ctx.requestId,
        sessionId: ctx.sessionId,
        source: 'skills',
        payload: { skillId, error: error.message },
        version: 1
      });

      throw error;
    }
  }
}
