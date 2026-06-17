import { DependencyEdge } from '../models';
import { ParsedAST } from '@agent-os/parser';

export class DependencyGraphBuilder {
  public extractDependencies(parsedAst: ParsedAST, fileId: string): DependencyEdge[] {
    const edges: DependencyEdge[] = [];
    const filePath = fileId;

    for (const node of parsedAst.nodes) {
      if (node.kind === 'import') {
        edges.push({
          sourceFileId: filePath,
          targetFileId: node.source,
          importStatement: node.statement
        });
      }
    }

    return edges;
  }
}
