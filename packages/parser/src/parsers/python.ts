import Parser from 'web-tree-sitter';
import { ParsedAST, ASTNode, ASTEdge } from '../models';
import { LanguageParser } from '../registry';

export class PythonParser implements LanguageParser {
  public language = 'python';
  private parser: Parser | null = null;
  private lang: Parser.Language | null = null;

  public async initialize(wasmPath: string): Promise<void> {
    await Parser.init();
    this.parser = new Parser();
    this.lang = await Parser.Language.load(wasmPath);
    this.parser.setLanguage(this.lang);
  }

  public getRawParser(): Parser | null {
    return this.parser;
  }

  public parse(filePath: string, sourceCode: string): ParsedAST {
    if (!this.parser) throw new Error('PythonParser not initialized');

    const tree = this.parser.parse(sourceCode);
    const nodes: ASTNode[] = [];
    const edges: ASTEdge[] = [];

    const walk = (node: Parser.SyntaxNode, parentClass?: string) => {
      // Classes
      if (node.type === 'class_definition') {
        const nameNode = node.childForFieldName('name');
        const name = nameNode ? nameNode.text : 'AnonymousClass';
        nodes.push({
          kind: 'class',
          name,
          startLine: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1
        });
        
        const body = node.childForFieldName('body');
        if (body) {
          for (let i = 0; i < body.childCount; i++) {
            walk(body.child(i), name);
          }
        }
        return;
      }

      // Methods / Functions
      if (node.type === 'function_definition') {
        const nameNode = node.childForFieldName('name');
        const name = nameNode ? nameNode.text : 'AnonymousFunction';
        
        if (parentClass) {
          nodes.push({
            kind: 'method',
            name,
            parent: parentClass,
            startLine: node.startPosition.row + 1,
            endLine: node.endPosition.row + 1,
            signature: `def ${name}(...)`
          });
        } else {
          nodes.push({
            kind: 'function',
            name,
            startLine: node.startPosition.row + 1,
            endLine: node.endPosition.row + 1,
            signature: `def ${name}(...)`
          });
        }
      }

      // Imports
      if (node.type === 'import_statement' || node.type === 'import_from_statement') {
        const moduleNameNode = node.childForFieldName('module_name');
        const names = node.descendantsOfType('dotted_name');
        if (names.length > 0) {
          nodes.push({
            kind: 'import',
            source: moduleNameNode ? moduleNameNode.text : names[0].text,
            statement: node.text,
            startLine: node.startPosition.row + 1
          });
        }
      }

      // Calls
      if (node.type === 'call') {
        const functionNode = node.childForFieldName('function');
        if (functionNode) {
          nodes.push({
            kind: 'call',
            callee: functionNode.text,
            context: parentClass || 'global',
            startLine: node.startPosition.row + 1
          });
        }
      }

      for (let i = 0; i < node.childCount; i++) {
        walk(node.child(i), parentClass);
      }
    };

    walk(tree.rootNode);

    return { filePath, language: this.language, nodes, edges };
  }
}
