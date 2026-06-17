import { SourceFile, SyntaxKind } from 'ts-morph';
import { CallEdge } from '../models';

export class CallGraphBuilder {
  public extractCallEdges(sourceFile: SourceFile, fileId: string): CallEdge[] {
    const edges: CallEdge[] = [];
    const filePath = fileId;

    const callExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);
    
    for (const callExpr of callExpressions) {
      const expr = callExpr.getExpression();
      const calleeName = expr.getText();
      
      // Determine the caller symbol by walking up the AST
      let callerNode = callExpr.getParent();
      let callerName = 'global';
      
      while (callerNode) {
        if (callerNode.isKind(SyntaxKind.FunctionDeclaration) ||
            callerNode.isKind(SyntaxKind.MethodDeclaration) ||
            callerNode.isKind(SyntaxKind.ArrowFunction)) {
          
          const nameNode = (callerNode as any).getNameNode?.();
          if (nameNode) {
            callerName = nameNode.getText();
            break;
          }
        }
        callerNode = callerNode.getParent();
      }

      const callerSymbolId = `${filePath}#${callerName}`;
      
      // Attempting to resolve the true calleeSymbolId if we have the symbol
      // For a purely AST-based static deterministic extraction without external typechecker resolution overhead,
      // we might just store the calleeName. A real system might use `expr.getSymbol()` to map exactly.
      // We will try `getSymbol()` safely.
      let calleeSymbolId = calleeName;
      try {
        const symbol = expr.getSymbol();
        if (symbol) {
          const decls = symbol.getDeclarations();
          if (decls && decls.length > 0) {
            const declFile = decls[0].getSourceFile().getFilePath();
            calleeSymbolId = `${declFile}#${symbol.getName()}`;
          }
        }
      } catch (e) {
        // Fallback
      }

      edges.push({
        callerSymbolId,
        calleeSymbolId,
        calleeName,
        filePath,
        line: callExpr.getStartLineNumber()
      });
    }

    return edges;
  }
}
