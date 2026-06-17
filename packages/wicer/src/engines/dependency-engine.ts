import { KnowledgeUnit } from '../models';
import { RepositoryGraphSnapshot } from '@agent-os/repository/src/models';

export class DependencyWikiEngine {
  public generate(fileId: string, snapshot: RepositoryGraphSnapshot): KnowledgeUnit {
    const deps = snapshot.dependencies.filter(d => d.sourceFileId === fileId);
    const dependents = snapshot.dependencies.filter(d => d.targetFileId === fileId);

    const content = `Dependency Graph: ${fileId}

Upstream Dependencies (This file depends on):
${deps.length > 0 ? deps.map(d => `- ${d.targetFileId} (because import exists: ${d.importStatement})`).join('\n') : '- None'}

Downstream Dependents (Files depending on this):
${dependents.length > 0 ? dependents.map(d => `- ${d.sourceFileId}`).join('\n') : '- None'}

Trace:
- Graph Version: ${snapshot.version}
`;

    return {
      id: `module:${fileId}`,
      type: 'module',
      title: `Module Dependencies: ${fileId}`,
      content,
      sourceGraphRefs: [fileId, ...deps.map(d => d.targetFileId), ...dependents.map(d => d.sourceFileId)],
      sourceEventRefs: [],
      createdAt: Date.now(),
      version: 1
    };
  }
}
