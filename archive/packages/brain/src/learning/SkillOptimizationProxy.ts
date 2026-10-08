import { OptimizationPlan, Skill, SkillContext, SkillResult } from './types';
import { CacheManager } from './CacheManager';
import { OptimizationSafetyViolationError } from './errors';

/**
 * Transparent optimization wrapper for Skill execution.
 * Applies WiCER memoization and context immutability guards.
 * Moved from @agent-os/seol.
 */
export class SkillOptimizationProxy implements Skill {
  public id: string;
  public name: string;
  public version: number;
  public level: any;
  public inputSchema: object;
  public outputSchema: object;
  public requires: any[];

  constructor(
    private baseSkill: Skill,
    private activePlan: OptimizationPlan,
    private cacheManager: CacheManager
  ) {
    this.id          = baseSkill.id;
    this.name        = baseSkill.name;
    this.version     = baseSkill.version;
    this.level       = baseSkill.level;
    this.inputSchema = baseSkill.inputSchema ?? {};
    this.outputSchema = baseSkill.outputSchema ?? {};
    this.requires    = baseSkill.requires ?? [];
  }

  public async execute(ctx: SkillContext, input: any): Promise<SkillResult> {
    const applyWicerMemoization = this.activePlan.actions.some(
      a => a.targetSkillId === this.id && a.type === 'WICER_MEMOIZATION'
    );

    // SAFETY: Prevent mutation of the shared SkillContext
    const safeCtx = new Proxy(ctx, {
      set: (_t, prop) => {
        throw new OptimizationSafetyViolationError(
          `Illegal mutation on SkillContext property: ${String(prop)}`
        );
      },
      get: (target, prop) => {
        if (prop === 'repository') {
          return new Proxy((target as any).repository, {
            set: () => {
              throw new OptimizationSafetyViolationError(
                'Illegal graph mutation — RepositoryGraphSnapshot is immutable.'
              );
            }
          });
        }
        return (target as any)[prop];
      }
    });

    let proxyCtx = safeCtx;

    if (applyWicerMemoization) {
      const wicerProxy = new Proxy(ctx.wicer, {
        get: (target, prop) => {
          if (prop === 'explainImpact' || prop === 'explainModule') {
            return (...args: any[]) => {
              const queryHash = `${String(prop)}_${JSON.stringify(args[0])}`;
              const cached = this.cacheManager.getWicerCache(1, ctx.sessionId, queryHash);
              if (cached) return cached;
              const result = (target as any)[prop](...args);
              this.cacheManager.setWicerCache(1, ctx.sessionId, queryHash, result);
              return result;
            };
          }
          return (target as any)[prop];
        }
      });

      proxyCtx = new Proxy(safeCtx, {
        get: (target, prop) => prop === 'wicer' ? wicerProxy : (target as any)[prop],
        set: (_t, prop) => {
          throw new OptimizationSafetyViolationError(
            `Illegal mutation on SkillContext property: ${String(prop)}`
          );
        }
      });
    }

    const result = await this.baseSkill.execute(proxyCtx, input);

    // Freeze the envelope while preserving the SkillResult structural type.
    const frozenResult: SkillResult = {
      ...result,
      data:            Object.freeze(result.data),
      events:          Object.freeze([...(result.events || [])]) as any,
      wicerReferences: Object.freeze([...(result.wicerReferences || [])]) as any,
      graphReferences: Object.freeze([...(result.graphReferences || [])]) as any
    };
    return Object.freeze(frozenResult) as SkillResult;
  }
}

/** @deprecated Use SkillOptimizationProxy */
export { SkillOptimizationProxy as SeolProxy };
