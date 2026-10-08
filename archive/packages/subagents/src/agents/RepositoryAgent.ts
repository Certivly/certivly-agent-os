import { AgentTask, AgentResult } from '../models/AgentTask';
import { AgentContext } from '../runtime/AgentContext';
import { SubAgent } from './SubAgent';

/**
 * Analyzes repository graph to find dependencies, callers, and impact radius for files.
 */
export class RepositoryAgent implements SubAgent {
  id = 'repository-agent';
  name = 'Repository Agent';

  async execute(task: AgentTask, context: AgentContext): Promise<AgentResult> {
    const start = performance.now();
    const targetFiles: string[] = task.payload?.files ?? [];
    const query: string = task.payload?.q ?? '';

    const dependencies: string[] = [];
    const callers: string[] = [];
    const impactRadius: string[] = [];

    try {
      const graph = context.workspace.repositoryGraph;
      if (graph) {
        // Find files relevant to the query if no files specified
        const filesToAnalyze = targetFiles.length > 0
          ? targetFiles
          : this.matchFiles(graph, query);

        for (const file of filesToAnalyze) {
          // Dependencies: files this one imports
          if (graph.dependencies) {
            const deps = (graph.dependencies as any[])
              .filter((d: any) => d.from === file)
              .map((d: any) => d.to);
            dependencies.push(...deps);
          }

          // Callers: files that call symbols defined in this file
          if (graph.fileSymbols && graph.calls) {
            const fileSymbols = graph.fileSymbols.get(file) ?? [];
            const callerFiles = (graph.calls as any[])
              .filter((c: any) => fileSymbols.includes(c.symbol))
              .map((c: any) => c.from);
            callers.push(...callerFiles);
          }

          // Impact radius: unique top-level directories affected
          const allAffected = [file, ...dependencies, ...callers];
          for (const f of allAffected) {
            const area = f.split('/')[0];
            if (area && !impactRadius.includes(area)) impactRadius.push(area);
          }
        }
      }
    } catch (e: any) {
      // Non-fatal
    }

    return {
      taskId: task.id,
      agentId: this.id,
      status: 'success',
      data: { dependencies: [...new Set(dependencies)], callers: [...new Set(callers)], impactRadius },
      durationMs: performance.now() - start
    };
  }

  private matchFiles(graph: any, query: string): string[] {
    if (!query || !graph.files) return [];
    const lower = query.toLowerCase();
    const results: string[] = [];
    for (const [path] of graph.files) {
      if (path.toLowerCase().includes(lower)) {
        results.push(path);
        if (results.length >= 5) break;
      }
    }
    return results;
  }
}
