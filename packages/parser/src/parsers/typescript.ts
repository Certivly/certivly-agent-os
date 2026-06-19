import Parser from 'web-tree-sitter';
import { ParsedAST, ASTNode, ASTEdge } from '../models';
import { LanguageParser } from '../registry';

export class TypeScriptParser implements LanguageParser {
  public language = 'typescript';
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
    if (!this.parser || !this.lang) {
      throw new Error('TypeScriptParser not initialized');
    }

    const tree = this.parser.parse(sourceCode);
    const nodes: ASTNode[] = [];
    const edges: ASTEdge[] = [];

    const walk = (node: Parser.SyntaxNode, parentClass?: string) => {
      // Classes
      if (node.type === 'class_declaration') {
        const nameNode = node.childForFieldName('name');
        const name = nameNode ? nameNode.text : 'AnonymousClass';
        nodes.push({
          kind: 'class',
          name,
          startLine: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1
        });
        
        // Walk inside class
        const body = node.childForFieldName('body');
        if (body) {
          for (let i = 0; i < body.childCount; i++) {
            walk(body.child(i), name);
          }
        }
        return; // we handled children
      }

      // Methods
      if (node.type === 'method_definition' && parentClass) {
        const nameNode = node.childForFieldName('name');
        const name = nameNode ? nameNode.text : 'AnonymousMethod';
        nodes.push({
          kind: 'method',
          name,
          parent: parentClass,
          startLine: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1,
          signature: node.text.split('{')[0].trim()
        });
      }

      // Functions
      if (node.type === 'function_declaration' || node.type === 'arrow_function') {
        let name = 'AnonymousFunction';
        if (node.type === 'function_declaration') {
          const nameNode = node.childForFieldName('name');
          if (nameNode) name = nameNode.text;
        } else {
          if (node.parent?.type === 'variable_declarator') {
            const nameNode = node.parent.childForFieldName('name');
            if (nameNode) name = nameNode.text;
          }
        }

        nodes.push({
          kind: 'function',
          name,
          startLine: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1,
          signature: node.text.split('{')[0].trim()
        });
      }

      // Interfaces
      if (node.type === 'interface_declaration') {
        const nameNode = node.childForFieldName('name');
        const name = nameNode ? nameNode.text : 'AnonymousInterface';
        nodes.push({
          kind: 'interface',
          name,
          startLine: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1
        });
      }

      // Types
      if (node.type === 'type_alias_declaration') {
        const nameNode = node.childForFieldName('name');
        const name = nameNode ? nameNode.text : 'AnonymousType';
        nodes.push({
          kind: 'type',
          name,
          startLine: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1
        });
      }

      // Enums
      if (node.type === 'enum_declaration') {
        const nameNode = node.childForFieldName('name');
        const name = nameNode ? nameNode.text : 'AnonymousEnum';
        nodes.push({
          kind: 'enum',
          name,
          startLine: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1
        });
      }

      // Imports
      if (node.type === 'import_statement') {
        const sourceNode = node.childForFieldName('source');
        if (sourceNode) {
          nodes.push({
            kind: 'import',
            source: sourceNode.text.replace(/['"]/g, ''),
            statement: node.text,
            startLine: node.startPosition.row + 1
          });
        }
      }

      // Call Expressions
      if (node.type === 'call_expression') {
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

      // Recursively walk children
      for (let i = 0; i < node.childCount; i++) {
        walk(node.child(i), parentClass);
      }
    };

    walk(tree.rootNode);

    return {
      filePath,
      language: this.language,
      nodes,
      edges
    };
  }
}
