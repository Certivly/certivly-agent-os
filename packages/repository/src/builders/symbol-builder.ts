import { Project, SourceFile, Node, SyntaxKind, ClassDeclaration, FunctionDeclaration, MethodDeclaration, InterfaceDeclaration, TypeAliasDeclaration, EnumDeclaration } from 'ts-morph';
import { SymbolNode, SymbolVisibility } from '../models';

export class SymbolExtractor {
  public extractSymbols(sourceFile: SourceFile, fileId: string): SymbolNode[] {
    const symbols: SymbolNode[] = [];
    
    // Classes
    sourceFile.getClasses().forEach(cls => {
      symbols.push(this.mapClass(cls, fileId));
      
      // Methods inside classes
      cls.getMethods().forEach(method => {
        symbols.push(this.mapMethod(method, cls.getName() || 'Anonymous', fileId));
      });
    });

    // Functions
    sourceFile.getFunctions().forEach(func => {
      symbols.push(this.mapFunction(func, fileId));
    });

    // Interfaces
    sourceFile.getInterfaces().forEach(iface => {
      symbols.push(this.mapInterface(iface, fileId));
    });

    // Types
    sourceFile.getTypeAliases().forEach(typeAlias => {
      symbols.push(this.mapType(typeAlias, fileId));
    });

    // Enums
    sourceFile.getEnums().forEach(enm => {
      symbols.push(this.mapEnum(enm, fileId));
    });

    return symbols.filter(s => s.name !== undefined && s.name !== '');
  }

  private getVisibility(node: Node): SymbolVisibility {
    if (Node.isModifierable(node)) {
      if (node.hasModifier(SyntaxKind.PrivateKeyword)) return 'private';
      if (node.hasModifier(SyntaxKind.ProtectedKeyword)) return 'protected';
      if (node.hasModifier(SyntaxKind.PublicKeyword)) return 'public';
    }
    return 'public'; // default in TS/JS if not specified, though structurally could be unknown
  }

  private mapClass(node: ClassDeclaration, filePath: string): SymbolNode {
    return {
      symbolId: `${filePath}#${node.getName()}`,
      name: node.getName() || 'AnonymousClass',
      type: 'Class',
      filePath,
      startLine: node.getStartLineNumber(),
      endLine: node.getEndLineNumber(),
      signature: node.getText().split('{')[0].trim(),
      visibility: this.getVisibility(node)
    };
  }

  private mapMethod(node: MethodDeclaration, className: string, filePath: string): SymbolNode {
    return {
      symbolId: `${filePath}#${className}.${node.getName()}`,
      name: node.getName(),
      type: 'Method',
      filePath,
      startLine: node.getStartLineNumber(),
      endLine: node.getEndLineNumber(),
      signature: node.getSignature().getDeclaration()?.getText() || node.getName(), // fallback
      visibility: this.getVisibility(node)
    };
  }

  private mapFunction(node: FunctionDeclaration, filePath: string): SymbolNode {
    return {
      symbolId: `${filePath}#${node.getName()}`,
      name: node.getName() || 'AnonymousFunction',
      type: 'Function',
      filePath,
      startLine: node.getStartLineNumber(),
      endLine: node.getEndLineNumber(),
      signature: node.getSignature().getDeclaration()?.getText() || node.getName() || '',
      visibility: this.getVisibility(node)
    };
  }

  private mapInterface(node: InterfaceDeclaration, filePath: string): SymbolNode {
    return {
      symbolId: `${filePath}#${node.getName()}`,
      name: node.getName(),
      type: 'Interface',
      filePath,
      startLine: node.getStartLineNumber(),
      endLine: node.getEndLineNumber(),
      signature: `interface ${node.getName()}`,
      visibility: this.getVisibility(node)
    };
  }

  private mapType(node: TypeAliasDeclaration, filePath: string): SymbolNode {
    return {
      symbolId: `${filePath}#${node.getName()}`,
      name: node.getName(),
      type: 'Type',
      filePath,
      startLine: node.getStartLineNumber(),
      endLine: node.getEndLineNumber(),
      signature: `type ${node.getName()}`,
      visibility: this.getVisibility(node)
    };
  }

  private mapEnum(node: EnumDeclaration, filePath: string): SymbolNode {
    return {
      symbolId: `${filePath}#${node.getName()}`,
      name: node.getName(),
      type: 'Enum',
      filePath,
      startLine: node.getStartLineNumber(),
      endLine: node.getEndLineNumber(),
      signature: `enum ${node.getName()}`,
      visibility: this.getVisibility(node)
    };
  }
}
