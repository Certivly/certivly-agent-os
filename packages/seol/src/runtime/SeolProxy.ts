import { OptimizationPlan } from '../planner/types';
import { CacheManager } from './CacheManager';
import { SeolSafetyViolationError } from '../errors';

export class SeolProxy implements Skill {
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
    this.id = baseSkill.id;
    this.name = baseSkill.name;
    // Proxied execution versions do not mutate the skill registry version,
    // they represent a transparent optimization envelope
    this.version = baseSkill.version;
    this.level = baseSkill.level;
    this.inputSchema = baseSkill.inputSchema;
    this.outputSchema = baseSkill.outputSchema;
    this.requires = baseSkill.requires;
  }

  public async execute(ctx: SkillContext, input: any): Promise<SkillResult> {
    const applyWicerMemoization = this.activePlan.actions.some(a => 
      a.targetSkillId === this.id && a.type === 'WICER_MEMOIZATION'
    );

    // SAFETY LAYER: Guard against context/graph mutation
    const safeCtx = new Proxy(ctx, {
      set: (target, prop, value) => {
        throw new SeolSafetyViolationError(`Illegal mutation attempted on SkillContext property: ${String(prop)}`);
      },
      get: (target, prop) => {
        if (prop === 'repository') {
          return new Proxy(target.repository, {
            set: () => {
              throw new SeolSafetyViolationError('Illegal graph mutation attempted. RepositoryGraphSnapshot is immutable.');
            }
          });
        }
        // @ts-ignore
        return target[prop];
      }
    });

    let proxyCtx = safeCtx;

    if (applyWicerMemoization) {
      const wicerProxy = new Proxy(ctx.wicer, {
        get: (target, prop) => {
          if (prop === 'explainImpact' || prop === 'explainModule') {
            return (...args: any[]) => {
              const queryHash = `${String(prop)}_${JSON.stringify(args[0])}`;
              // Simplified hash: Assuming graph version is stable within a session
              const cached = this.cacheManager.getWicerCache(1, ctx.sessionId, queryHash);
              if (cached) {
                // To maintain full event traceability, we manually emit the graph read event here
                // if it would have been emitted. But WiCER doesn't emit graph_read events internally
                // it's deterministic.
                return cached;
              }
              
              // @ts-ignore
              const result = target[prop](...args);
              this.cacheManager.setWicerCache(1, ctx.sessionId, queryHash, result);
              return result;
            };
          }
          // @ts-ignore
          return target[prop];
        }
      });

      proxyCtx = new Proxy(safeCtx, {
        get: (target, prop) => prop === 'wicer' ? wicerProxy : (target as any)[prop],
        set: (target, prop, value) => {
          throw new SeolSafetyViolationError(`Illegal mutation attempted on SkillContext property: ${String(prop)}`);
        }
      });
    }

    const result = await this.baseSkill.execute(proxyCtx, input);

    // Deep freeze output to prevent output mutation downstream
    return Object.freeze({
      ...result,
      data: Object.freeze(result.data),
      events: Object.freeze(result.events),
      wicerReferences: Object.freeze([...result.wicerReferences]),
      graphReferences: Object.freeze([...result.graphReferences])
    });
  }
}
