import { SymbolNode, SymbolVisibility } from '../models';
import { ParsedAST } from '@agent-os/parser';

export class SymbolExtractor {
  public extractSymbols(parsedAst: ParsedAST, fileId: string): SymbolNode[] {
    const symbols: SymbolNode[] = [];
    
    for (const node of parsedAst.nodes) {
      if (node.kind === 'class') {
        symbols.push({
          symbolId: `${fileId}#${node.name}`,
          name: node.name,
          type: 'Class',
          filePath: fileId,
          startLine: node.startLine,
          endLine: node.endLine,
          signature: `class ${node.name}`,
          visibility: 'public'
        });
      } else if (node.kind === 'function') {
        symbols.push({
          symbolId: `${fileId}#${node.name}`,
          name: node.name,
          type: 'Function',
          filePath: fileId,
          startLine: node.startLine,
          endLine: node.endLine,
          signature: node.signature || `function ${node.name}`,
          visibility: 'public'
        });
      } else if (node.kind === 'method') {
        symbols.push({
          symbolId: `${fileId}#${node.parent}.${node.name}`,
          name: node.name,
          type: 'Method',
          filePath: fileId,
          startLine: node.startLine,
          endLine: node.endLine,
          signature: node.signature || `method ${node.name}`,
          visibility: 'public'
        });
      } else if (node.kind === 'interface') {
        symbols.push({
          symbolId: `${fileId}#${node.name}`,
          name: node.name,
          type: 'Interface',
          filePath: fileId,
          startLine: node.startLine,
          endLine: node.endLine,
          signature: `interface ${node.name}`,
          visibility: 'public'
        });
      } else if (node.kind === 'type') {
        symbols.push({
          symbolId: `${fileId}#${node.name}`,
          name: node.name,
          type: 'Type',
          filePath: fileId,
          startLine: node.startLine,
          endLine: node.endLine,
          signature: `type ${node.name}`,
          visibility: 'public'
        });
      } else if (node.kind === 'enum') {
        symbols.push({
          symbolId: `${fileId}#${node.name}`,
          name: node.name,
          type: 'Enum',
          filePath: fileId,
          startLine: node.startLine,
          endLine: node.endLine,
          signature: `enum ${node.name}`,
          visibility: 'public'
        });
      }
    }

    return symbols.filter(s => s.name !== undefined && s.name !== '');
  }
}
