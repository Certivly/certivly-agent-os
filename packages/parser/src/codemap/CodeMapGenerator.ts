import { ParsedAST, ASTNode } from '../models';

export interface CodeMapOptions {
  maxTokens?: number;
  includeImports?: boolean;
  includeCalls?: boolean;
}

export class CodeMapGenerator {
  /**
   * Generates a compact structural ASCII / Markdown outline of parsed files
   * suitable for injection into LLM system prompts.
   */
  public generateMap(parsedFiles: ParsedAST[], options: CodeMapOptions = {}): string {
    const lines: string[] = [];
    const maxTokens = options.maxTokens ?? 2000;
    let approxTokens = 0;

    for (const ast of parsedFiles) {
      if (ast.nodes.length === 0) continue;

      const fileHeader = `\n📄 ${ast.filePath} (${ast.language})`;
      lines.push(fileHeader);
      approxTokens += Math.ceil(fileHeader.length / 4);

      // Group nodes by kind
      const classes = ast.nodes.filter(n => n.kind === 'class') as Extract<ASTNode, { kind: 'class' }>[];
      const interfaces = ast.nodes.filter(n => n.kind === 'interface') as Extract<ASTNode, { kind: 'interface' }>[];
      const types = ast.nodes.filter(n => n.kind === 'type' || n.kind === 'enum');
      const functions = ast.nodes.filter(n => n.kind === 'function') as Extract<ASTNode, { kind: 'function' }>[];
      const methods = ast.nodes.filter(n => n.kind === 'method') as Extract<ASTNode, { kind: 'method' }>[];

      // Classes and methods
      for (const cls of classes) {
        const clsLine = `  class ${cls.name} [L${cls.startLine}-L${cls.endLine}]`;
        lines.push(clsLine);
        approxTokens += Math.ceil(clsLine.length / 4);

        const classMethods = methods.filter(m => m.parent === cls.name);
        for (const m of classMethods) {
          const mLine = `    ├── ${m.signature || m.name}() [L${m.startLine}]`;
          lines.push(mLine);
          approxTokens += Math.ceil(mLine.length / 4);
        }
      }

      // Interfaces
      for (const iface of interfaces) {
        const ifaceLine = `  interface ${iface.name} [L${iface.startLine}]`;
        lines.push(ifaceLine);
        approxTokens += Math.ceil(ifaceLine.length / 4);
      }

      // Types & Enums
      for (const t of types) {
        const tLine = `  ${t.kind} ${t.name} [L${t.startLine}]`;
        lines.push(tLine);
        approxTokens += Math.ceil(tLine.length / 4);
      }

      // Top-level functions
      for (const fn of functions) {
        const fnLine = `  function ${fn.signature || fn.name}() [L${fn.startLine}-L${fn.endLine}]`;
        lines.push(fnLine);
        approxTokens += Math.ceil(fnLine.length / 4);
      }

      // Stop if token budget reached
      if (approxTokens >= maxTokens) {
        lines.push('\n... [CodeMap truncated to stay within token budget]');
        break;
      }
    }

    return lines.join('\n').trim();
  }
}
