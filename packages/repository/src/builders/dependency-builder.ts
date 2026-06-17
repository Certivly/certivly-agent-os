import { SourceFile, StringLiteral, SyntaxKind } from 'ts-morph';
import { DependencyEdge } from '../models';

export class DependencyGraphBuilder {
  public extractDependencies(sourceFile: SourceFile, fileId: string): DependencyEdge[] {
    const edges: DependencyEdge[] = [];
    const filePath = fileId;

    // Import declarations: import { x } from 'y';
    sourceFile.getImportDeclarations().forEach(importDecl => {
      const moduleSpecifier = importDecl.getModuleSpecifierValue();
      edges.push({
        sourceFileId: filePath,
        targetFileId: moduleSpecifier, // we don't resolve the absolute path yet, just raw target
        importStatement: importDecl.getText()
      });
    });

    // Export declarations: export * from 'y';
    sourceFile.getExportDeclarations().forEach(exportDecl => {
      if (exportDecl.hasModuleSpecifier()) {
        const moduleSpecifier = exportDecl.getModuleSpecifierValue();
        if (moduleSpecifier) {
          edges.push({
            sourceFileId: filePath,
            targetFileId: moduleSpecifier,
            importStatement: exportDecl.getText()
          });
        }
      }
    });

    // Dynamic imports & requires: require('y'), import('y')
    sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression).forEach(callExpr => {
      const expressionText = callExpr.getExpression().getText();
      if (expressionText === 'require' || expressionText === 'import') {
        const args = callExpr.getArguments();
        if (args.length > 0 && args[0].getKind() === SyntaxKind.StringLiteral) {
          const moduleSpecifier = (args[0] as StringLiteral).getLiteralValue();
          edges.push({
            sourceFileId: filePath,
            targetFileId: moduleSpecifier,
            importStatement: callExpr.getText()
          });
        }
      }
    });

    return edges;
  }
}
