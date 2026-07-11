import { SkillRegistry, Skill, SkillContext } from '../index';
import { EventStore } from '@agent-os/events';

/**
 * RuntimeSkillDispatcher — bridges the TaskDispatcher to the SkillRegistry.
 * Given a skill ID and an ExecutionContext, it builds a SkillContext and
 * dispatches to the registered Skill implementation.
 */
export class RuntimeSkillDispatcher {
  constructor(
    private skillRegistry: SkillRegistry,
    private repository: any,   // RepositoryGraphSnapshot (live, from pipeline)
    private wicer: any,        // WicerAPI instance
    private eventStore: EventStore
  ) {}

  public async execute(skillId: string, executionContext: any): Promise<any> {
    let skill: Skill;
    try {
      skill = this.skillRegistry.get(skillId);
    } catch {
      console.warn(`[SkillExecutor] Skill "${skillId}" not registered — skipping`);
      return { success: false, data: null, error: `Skill ${skillId} not found` };
    }

    // Build a SkillContext from the current execution context
    // The repository snapshot may come from the execution context (passed in by the pipeline)
    // or fall back to the one injected at construction time.
    const skillCtx: SkillContext = {
      repository: executionContext?.repositorySnapshot ?? this.repository ?? {
        files: new Map(),
        symbols: new Map(),
        dependencies: [],
        calls: [],
        fileSymbols: new Map(),
        symbolDefinitions: new Map(),
        version: 0,
        timestamp: new Date().toISOString()
      },
      events: this.eventStore,
      wicer: this.wicer,
      sessionId: executionContext?.sessionId ?? 'default',
      requestId: executionContext?.executionId ?? 'default'
    };

    // Extract input from the task if present
    const input = executionContext?.taskInput ?? {};

    try {
      return await skill.execute(skillCtx, input);
    } catch (err: any) {
      console.error(`[SkillExecutor] Skill "${skillId}" threw:`, err.message);
      return { success: false, data: null, error: err.message };
    }
  }
}
