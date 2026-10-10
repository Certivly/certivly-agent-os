import { ParsedAST, ASTNode } from '../models';

/**
 * Robust heuristic parser for extracting structural symbols (classes, functions,
 * interfaces, methods, imports, calls) when tree-sitter wasm is unavailable or
 * fails to parse invalid syntax.
 */
export class RobustHeuristicParser {
  public parse(filePath: string, sourceCode: string, language: string): ParsedAST {
    const lines = sourceCode.split('\n');
    const nodes: ASTNode[] = [];

    let currentClass: string | null = null;
    let classStartLine = 1;

    for (let i = 0; i < lines.length; i++) {
      const lineNum = i + 1;
      const rawLine = lines[i];
      const trimmed = rawLine.trim();

      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('/*')) {
        continue;
      }

      // Check for Imports
      const importMatch = this.matchImport(trimmed, language);
      if (importMatch) {
        nodes.push({
          kind: 'import',
          source: importMatch.source,
          statement: trimmed,
          startLine: lineNum,
        });
        continue;
      }

      // Check for Class / Struct / Interface / Type / Enum
      const typeMatch = this.matchTypeDeclaration(trimmed, language);
      if (typeMatch) {
        currentClass = typeMatch.name;
        classStartLine = lineNum;

        if (typeMatch.kind === 'class') {
          nodes.push({
            kind: 'class',
            name: typeMatch.name,
            startLine: lineNum,
            endLine: lineNum + 1, // rough estimate
            visibility: typeMatch.visibility,
          });
        } else if (typeMatch.kind === 'interface') {
          nodes.push({
            kind: 'interface',
            name: typeMatch.name,
            startLine: lineNum,
            endLine: lineNum + 1,
          });
        } else if (typeMatch.kind === 'type') {
          nodes.push({
            kind: 'type',
            name: typeMatch.name,
            startLine: lineNum,
            endLine: lineNum + 1,
          });
        } else if (typeMatch.kind === 'enum') {
          nodes.push({
            kind: 'enum',
            name: typeMatch.name,
            startLine: lineNum,
            endLine: lineNum + 1,
          });
        }
        continue;
      }

      // Check for Functions / Methods
      const fnMatch = this.matchFunction(trimmed, language);
      if (fnMatch) {
        // If indented inside a class, classify as method
        const isIndented = rawLine.startsWith('  ') || rawLine.startsWith('\t');
        if (currentClass && isIndented) {
          nodes.push({
            kind: 'method',
            name: fnMatch.name,
            parent: currentClass,
            startLine: lineNum,
            endLine: lineNum + 1,
            signature: fnMatch.signature,
            visibility: fnMatch.visibility,
          });
        } else {
          // Top-level function
          nodes.push({
            kind: 'function',
            name: fnMatch.name,
            startLine: lineNum,
            endLine: lineNum + 1,
            signature: fnMatch.signature,
            visibility: fnMatch.visibility,
          });
          currentClass = null;
        }
        continue;
      }

      // Check for Function Calls
      const callMatch = this.matchCalls(trimmed);
      for (const callee of callMatch) {
        nodes.push({
          kind: 'call',
          callee,
          context: currentClass ?? 'module',
          startLine: lineNum,
        });
      }
    }

    return {
      filePath,
      language,
      nodes,
      edges: [],
    };
  }

  private matchImport(line: string, language: string): { source: string } | null {
    if (language === 'typescript' || language === 'javascript') {
      const match = line.match(/^import\s+.*?\s+from\s+['"]([^'"]+)['"]/);
      if (match) return { source: match[1] };
      const reqMatch = line.match(/(?:const|let|var)\s+.*?\s*=\s*require\(['"]([^'"]+)['"]\)/);
      if (reqMatch) return { source: reqMatch[1] };
    } else if (language === 'python') {
      const fromMatch = line.match(/^from\s+([a-zA-Z0-9_.]+)\s+import/);
      if (fromMatch) return { source: fromMatch[1] };
      const impMatch = line.match(/^import\s+([a-zA-Z0-9_.]+)/);
      if (impMatch) return { source: impMatch[1] };
    } else if (language === 'go') {
      const goMatch = line.match(/^import\s+(?:\([^\)]+\)|"([^"]+)")/);
      if (goMatch && goMatch[1]) return { source: goMatch[1] };
    } else if (language === 'rust') {
      const rustMatch = line.match(/^use\s+([a-zA-Z0-9_:]+)/);
      if (rustMatch) return { source: rustMatch[1] };
    } else if (language === 'java' || language === 'csharp') {
      const m = line.match(/^(?:import|using)\s+([a-zA-Z0-9_.]+);/);
      if (m) return { source: m[1] };
    }
    return null;
  }

  private matchTypeDeclaration(
    line: string,
    language: string
  ): { kind: 'class' | 'interface' | 'type' | 'enum'; name: string; visibility?: string } | null {
    // Classes
    const classMatch = line.match(
      /^(?:export\s+)?(?:default\s+)?(?:public\s+|private\s+|protected\s+)?(?:abstract\s+)?class\s+([a-zA-Z0-9_]+)/
    );
    if (classMatch) {
      const visibility = line.includes('private') ? 'private' : line.includes('protected') ? 'protected' : 'public';
      return { kind: 'class', name: classMatch[1], visibility };
    }

    // Go / Rust Structs
    if (language === 'go') {
      const goStruct = line.match(/^type\s+([a-zA-Z0-9_]+)\s+struct\b/);
      if (goStruct) return { kind: 'class', name: goStruct[1] };
      const goInterface = line.match(/^type\s+([a-zA-Z0-9_]+)\s+interface\b/);
      if (goInterface) return { kind: 'interface', name: goInterface[1] };
    }

    if (language === 'rust') {
      const rustStruct = line.match(/^(?:pub\s+)?struct\s+([a-zA-Z0-9_]+)/);
      if (rustStruct) return { kind: 'class', name: rustStruct[1] };
      const rustTrait = line.match(/^(?:pub\s+)?trait\s+([a-zA-Z0-9_]+)/);
      if (rustTrait) return { kind: 'interface', name: rustTrait[1] };
      const rustEnum = line.match(/^(?:pub\s+)?enum\s+([a-zA-Z0-9_]+)/);
      if (rustEnum) return { kind: 'enum', name: rustEnum[1] };
    }

    // Interfaces
    const ifaceMatch = line.match(/^(?:export\s+)?(?:public\s+)?interface\s+([a-zA-Z0-9_]+)/);
    if (ifaceMatch) {
      return { kind: 'interface', name: ifaceMatch[1] };
    }

    // Types
    const typeMatch = line.match(/^(?:export\s+)?type\s+([a-zA-Z0-9_]+)\s*=/);
    if (typeMatch) {
      return { kind: 'type', name: typeMatch[1] };
    }

    // Enums
    const enumMatch = line.match(/^(?:export\s+)?(?:const\s+)?enum\s+([a-zA-Z0-9_]+)/);
    if (enumMatch) {
      return { kind: 'enum', name: enumMatch[1] };
    }

    return null;
  }

  private matchFunction(
    line: string,
    language: string
  ): { name: string; signature: string; visibility?: string } | null {
    // TypeScript / JS functions & methods
    const fnMatch = line.match(
      /^(?:export\s+)?(?:default\s+)?(?:public\s+|private\s+|protected\s+)?(?:static\s+)?(?:async\s+)?function\s*([a-zA-Z0-9_]+)\s*\(([^)]*)\)/
    );
    if (fnMatch) {
      const visibility = line.includes('private') ? 'private' : line.includes('protected') ? 'protected' : 'public';
      return { name: fnMatch[1], signature: `${fnMatch[1]}(${fnMatch[2]})`, visibility };
    }

    // Class methods: public async myMethod(arg: string): void
    const methodMatch = line.match(
      /^(?:public\s+|private\s+|protected\s+)?(?:static\s+)?(?:async\s+)?([a-zA-Z0-9_]+)\s*\(([^)]*)\)\s*(?::\s*([^{;]+))?/
    );
    if (methodMatch && !['if', 'for', 'while', 'switch', 'catch'].includes(methodMatch[1])) {
      const visibility = line.includes('private') ? 'private' : line.includes('protected') ? 'protected' : 'public';
      return { name: methodMatch[1], signature: `${methodMatch[1]}(${methodMatch[2]})`, visibility };
    }

    // Python def
    if (language === 'python') {
      const pyMatch = line.match(/^(?:async\s+)?def\s+([a-zA-Z0-9_]+)\s*\(([^)]*)\)/);
      if (pyMatch) {
        return { name: pyMatch[1], signature: `${pyMatch[1]}(${pyMatch[2]})` };
      }
    }

    // Go func
    if (language === 'go') {
      const goMethod = line.match(/^func\s+\(\s*[^)]+\s*\)\s*([a-zA-Z0-9_]+)\s*\(([^)]*)\)/);
      if (goMethod) {
        return { name: goMethod[1], signature: `${goMethod[1]}(${goMethod[2]})` };
      }
      const goFn = line.match(/^func\s+([a-zA-Z0-9_]+)\s*\(([^)]*)\)/);
      if (goFn) {
        return { name: goFn[1], signature: `${goFn[1]}(${goFn[2]})` };
      }
    }

    // Rust fn
    if (language === 'rust') {
      const rustFn = line.match(/^(?:pub(?:\([^)]+\))?\s+)?(?:async\s+)?fn\s+([a-zA-Z0-9_]+)\s*(?:<[^>]+>)?\s*\(([^)]*)\)/);
      if (rustFn) {
        return { name: rustFn[1], signature: `${rustFn[1]}(${rustFn[2]})` };
      }
    }

    return null;
  }

  private matchCalls(line: string): string[] {
    const callees: string[] = [];
    const callRegex = /\b([a-zA-Z0-9_]+)\s*\(/g;
    let match;
    const keywords = new Set(['if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'typeof', 'import', 'require', 'constructor']);

    while ((match = callRegex.exec(line)) !== null) {
      const name = match[1];
      if (!keywords.has(name) && name.length > 1) {
        callees.push(name);
      }
    }

    return callees;
  }
}
