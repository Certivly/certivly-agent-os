import Parser from 'web-tree-sitter';
import { ParsedAST, ASTNode, ASTEdge } from '../models';
import { LanguageParser } from '../registry';

export class RustParser implements LanguageParser {
  public language = 'rust';
  private parser: Parser | null = null;
  private lang: Parser.Language | null = null;

  public async initialize(wasmPath: string): Promise<void> {
    await Parser.init();
    this.parser = new Parser();
    this.lang = await Parser.Language.load(wasmPath);
    this.parser.setLanguage(this.lang);
  }

  public parse(filePath: string, sourceCode: string): ParsedAST {
    if (!this.parser) throw new Error('RustParser not initialized');

    const tree = this.parser.parse(sourceCode);
    const nodes: ASTNode[] = [];
    const edges: ASTEdge[] = [];

    const walk = (node: Parser.SyntaxNode, parentStruct?: string) => {
      // Structs / Enums / Traits
      if (node.type === 'struct_item' || node.type === 'enum_item' || node.type === 'trait_item') {
        const nameNode = node.childForFieldName('name');
        const name = nameNode ? nameNode.text : 'Anonymous';
        
        const kind = node.type === 'enum_item' ? 'enum' : (node.type === 'trait_item' ? 'interface' : 'class');
        nodes.push({
          kind: kind as 'enum' | 'interface' | 'class',
          name,
          startLine: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1
        });
      }

      // Impl blocks
      if (node.type === 'impl_item') {
        const typeNode = node.childForFieldName('type');
        const structName = typeNode ? typeNode.text : undefined;
        
        for (let i = 0; i < node.childCount; i++) {
          walk(node.child(i), structName);
        }
        return; // Handled children with context
      }

      // Functions / Methods
      if (node.type === 'function_item') {
        const nameNode = node.childForFieldName('name');
        const name = nameNode ? nameNode.text : 'Anonymous';
        
        if (parentStruct) {
          nodes.push({
            kind: 'method',
            name,
            parent: parentStruct,
            startLine: node.startPosition.row + 1,
            endLine: node.endPosition.row + 1,
            signature: `fn ${name}()`
          });
        } else {
          nodes.push({
            kind: 'function',
            name,
            startLine: node.startPosition.row + 1,
            endLine: node.endPosition.row + 1,
            signature: `fn ${name}()`
          });
        }
      }

      // Uses (Imports)
      if (node.type === 'use_declaration') {
        const argNode = node.childForFieldName('argument');
        if (argNode) {
          nodes.push({
            kind: 'import',
            source: argNode.text,
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
            context: parentStruct || 'global',
            startLine: node.startPosition.row + 1
          });
        }
      }

      for (let i = 0; i < node.childCount; i++) {
        walk(node.child(i), parentStruct);
      }
    };

    walk(tree.rootNode);

    return { filePath, language: this.language, nodes, edges };
  }
}
