import { AgentTask, AgentResult } from '../models/AgentTask';
import { AgentContext } from '../runtime/AgentContext';
import { SubAgent } from './SubAgent';

/**
 * Uses RepositoryBrain to build context and produces a patch plan — the list of
 * files to change and what type of change, ready for the execution engine.
 */
export class PatchAgent implements SubAgent {
  id = 'patch-agent';
  name = 'Patch Agent';

  async execute(task: AgentTask, context: AgentContext): Promise<AgentResult> {
    const start = performance.now();

    // Gather upstream results from context (set by coordinator after prior agents)
    const searchResults = task.payload?.searchResults ?? {};
    const repoResults = task.payload?.repoResults ?? {};
    const memoryResults = task.payload?.memoryResults ?? {};

    const affectedFiles: string[] = [
      ...(searchResults.files ?? []),
      ...(repoResults.dependencies ?? []),
    ].filter(Boolean);

    let patchPlan: string[] = [];
    let systemPrompt = '';

    try {
      const brain = context.workspace.brain;
      if (brain && typeof brain.answer === 'function') {
        const goal = task.payload?.goal ?? task.payload?.q ?? 'Implement the required changes';
        const brainResponse = await brain.answer(goal);
        systemPrompt = brainResponse.assembledText ?? '';

        // Derive patch plan from brain context + affected files
        patchPlan = affectedFiles.length > 0
          ? affectedFiles.map(f => `MODIFY ${f}`)
          : ['IMPLEMENT changes in relevant files based on brain context'];
      } else {
        patchPlan = affectedFiles.map(f => `MODIFY ${f}`);
      }
    } catch (e: any) {
      patchPlan = ['IMPLEMENT changes (brain unavailable)'];
    }

    return {
      taskId: task.id,
      agentId: this.id,
      status: 'success',
      data: {
        patchPlan,
        affectedFiles: [...new Set(affectedFiles)],
        systemPrompt: systemPrompt.slice(0, 500), // Truncated for summary
        impactRadius: repoResults.impactRadius ?? []
      },
      durationMs: performance.now() - start
    };
  }
}
