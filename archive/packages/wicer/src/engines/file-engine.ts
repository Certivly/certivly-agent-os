import { KnowledgeUnit } from '../models';
import { RepositoryGraphSnapshot } from '@agent-os/repository/src/models';

export class FileWikiEngine {
  public generate(fileId: string, snapshot: RepositoryGraphSnapshot): KnowledgeUnit {
    const fileNode = snapshot.files.get(fileId);
    if (!fileNode) throw new Error(`File ${fileId} not found in graph`);

    const symbols = snapshot.fileSymbols.get(fileId) || [];
    const deps = snapshot.dependencies.filter(d => d.sourceFileId === fileId);
    const dependents = snapshot.dependencies.filter(d => d.targetFileId === fileId || d.targetFileId === fileNode.path);
    const calls = snapshot.calls.filter(c => c.filePath === fileId);

    const content = `File: ${fileNode.path}

## Purpose (STRUCTURAL ONLY)
Derived from:
- exports
- imports
- symbol composition

## Symbols
${symbols.length > 0 ? symbols.map(s => `- ${s}`).join('\n') : '- None'}

## Dependencies
${deps.length > 0 ? deps.map(d => `- ${d.targetFileId}`).join('\n') : '- None'}

## Call Relationships
${calls.length > 0 ? calls.map(c => `- ${c.callerSymbolId} calls ${c.calleeName}`).join('\n') : '- None'}

## Impact Surface
${dependents.length > 0 ? dependents.map(d => `- ${d.sourceFileId} depends on this file`).join('\n') : '- None'}

## Source Trace
- Graph Version: ${snapshot.version}
`;

    return {
      id: `file:${fileId}`,
      type: 'file',
      title: `File: ${fileNode.path}`,
      content,
      sourceGraphRefs: [fileId, ...symbols, ...deps.map(d => d.targetFileId), ...calls.map(c => c.callerSymbolId)],
      sourceEventRefs: [],
      createdAt: Date.now(),
      version: 1
    };
  }
}
