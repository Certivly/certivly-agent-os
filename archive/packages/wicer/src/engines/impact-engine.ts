import { ImpactReport, KnowledgeUnit } from '../models';
import { RepositoryGraphSnapshot } from '@agent-os/repository/src/models';

export class ImpactAnalysisEngine {
  public explainImpact(targetId: string, targetType: 'file' | 'symbol', snapshot: RepositoryGraphSnapshot): ImpactReport {
    const dependentFiles = new Set<string>();
    const dependentSymbols = new Set<string>();
    const cascadeChain: string[] = [];

    // Simple BFS for impact
    const queue: { id: string, type: 'file' | 'symbol', depth: number }[] = [{ id: targetId, type: targetType, depth: 0 }];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current.id)) continue;
      visited.add(current.id);

      if (current.depth > 0) {
        cascadeChain.push(`Level ${current.depth}: -> ${current.id} (${current.type})`);
      }

      if (current.type === 'file') {
        const deps = snapshot.dependencies.filter(d => d.targetFileId === current.id || d.targetFileId.includes(current.id));
        for (const dep of deps) {
          if (!visited.has(dep.sourceFileId)) {
            dependentFiles.add(dep.sourceFileId);
            queue.push({ id: dep.sourceFileId, type: 'file', depth: current.depth + 1 });
          }
        }
      } else if (current.type === 'symbol') {
        const calls = snapshot.calls.filter(c => c.calleeSymbolId === current.id || c.calleeName === current.id.split('#')[1]);
        for (const call of calls) {
          if (!visited.has(call.callerSymbolId)) {
            dependentSymbols.add(call.callerSymbolId);
            queue.push({ id: call.callerSymbolId, type: 'symbol', depth: current.depth + 1 });
            // The file of the caller is also impacted
            if (!visited.has(call.filePath)) {
              dependentFiles.add(call.filePath);
              queue.push({ id: call.filePath, type: 'file', depth: current.depth + 1 });
            }
          }
        }
      }
    }

    return {
      targetId,
      targetType,
      dependentFiles: Array.from(dependentFiles),
      dependentSymbols: Array.from(dependentSymbols),
      cascadeChain
    };
  }

  public generateImpactWiki(targetId: string, targetType: 'file' | 'symbol', snapshot: RepositoryGraphSnapshot): KnowledgeUnit {
    const report = this.explainImpact(targetId, targetType, snapshot);
    
    const content = `Impact Analysis for ${targetType}: ${targetId}

If ${targetId} changes:

${report.cascadeChain.join('\n')}

Summary:
- Total impacted files: ${report.dependentFiles.length}
- Total impacted symbols: ${report.dependentSymbols.length}
`;

    return {
      id: `impact:${targetId}`,
      type: 'system',
      title: `Impact Report: ${targetId}`,
      content,
      sourceGraphRefs: [targetId, ...report.dependentFiles, ...report.dependentSymbols],
      sourceEventRefs: [],
      createdAt: Date.now(),
      version: 1
    };
  }
}
