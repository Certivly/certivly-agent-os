import Parser from 'web-tree-sitter';
import { ParsedAST, ASTNode, ASTEdge } from '../models';
import { LanguageParser } from '../registry';

export class GoParser implements LanguageParser {
  public language = 'go';
  private parser: Parser | null = null;
  private lang: Parser.Language | null = null;

  public async initialize(wasmPath: string): Promise<void> {
    await Parser.init();
    this.parser = new Parser();
    this.lang = await Parser.Language.load(wasmPath);
    this.parser.setLanguage(this.lang);
  }

  public parse(filePath: string, sourceCode: string): ParsedAST {
    if (!this.parser) throw new Error('GoParser not initialized');

    const tree = this.parser.parse(sourceCode);
    const nodes: ASTNode[] = [];
    const edges: ASTEdge[] = [];

    const walk = (node: Parser.SyntaxNode) => {
      // Types / Structs / Interfaces
      if (node.type === 'type_declaration') {
        const typeSpec = node.descendantsOfType('type_spec')[0];
        if (typeSpec) {
          const nameNode = typeSpec.childForFieldName('name');
          const typeNode = typeSpec.childForFieldName('type');
          
          if (nameNode && typeNode) {
            const kind = typeNode.type === 'interface_type' ? 'interface' : 'class'; // Map struct to class
            nodes.push({
              kind: kind as 'class' | 'interface',
              name: nameNode.text,
              startLine: node.startPosition.row + 1,
              endLine: node.endPosition.row + 1
            });
          }
        }
      }

      // Functions and Methods
      if (node.type === 'function_declaration' || node.type === 'method_declaration') {
        const nameNode = node.childForFieldName('name');
        const name = nameNode ? nameNode.text : 'Anonymous';
        
        const receiverNode = node.childForFieldName('receiver');
        if (receiverNode) {
          // It's a method
          const receiverType = receiverNode.descendantsOfType('type_identifier')[0];
          nodes.push({
            kind: 'method',
            name,
            parent: receiverType ? receiverType.text : 'unknown',
            startLine: node.startPosition.row + 1,
            endLine: node.endPosition.row + 1,
            signature: `func ${name}()`
          });
        } else {
          nodes.push({
            kind: 'function',
            name,
            startLine: node.startPosition.row + 1,
            endLine: node.endPosition.row + 1,
            signature: `func ${name}()`
          });
        }
      }

      // Imports
      if (node.type === 'import_spec') {
        const pathNode = node.childForFieldName('path');
        if (pathNode) {
          nodes.push({
            kind: 'import',
            source: pathNode.text.replace(/['"]/g, ''),
            statement: node.text,
            startLine: node.startPosition.row + 1
          });
        }
      }

      // Calls
      if (node.type === 'call_expression') {
        const functionNode = node.childForFieldName('function');
        if (functionNode) {
          nodes.push({
            kind: 'call',
            callee: functionNode.text,
            context: 'global', // precise scoping requires semantic inference
            startLine: node.startPosition.row + 1
          });
        }
      }

      for (let i = 0; i < node.childCount; i++) {
        walk(node.child(i));
      }
    };

    walk(tree.rootNode);

    return { filePath, language: this.language, nodes, edges };
  }
}
