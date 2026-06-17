import { CallEdge } from '../models';
import { ParsedAST } from '@agent-os/parser';

export class CallGraphBuilder {
  public extractCallEdges(parsedAst: ParsedAST, fileId: string): CallEdge[] {
    const edges: CallEdge[] = [];
    const filePath = fileId;

    for (const node of parsedAst.nodes) {
      if (node.kind === 'call') {
        const callerName = node.context;
        const callerSymbolId = `${filePath}#${callerName}`;
        
        edges.push({
          callerSymbolId,
          calleeSymbolId: node.callee, // Phase 3.1: Only syntactic calls
          calleeName: node.callee,
          filePath,
          line: node.startLine
        });
      }
    }

    return edges;
  }
}
