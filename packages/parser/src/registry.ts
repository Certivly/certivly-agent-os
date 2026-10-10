import * as path from 'path';
import { ParsedAST } from './models';
import { TypeScriptParser } from './parsers/typescript';
import { PythonParser } from './parsers/python';
import { GoParser } from './parsers/go';
import { RustParser } from './parsers/rust';
import { RobustHeuristicParser } from './parsers/heuristic';
import { CodeMapGenerator, CodeMapOptions } from './codemap/CodeMapGenerator';

export interface LanguageParser {
  language: string;
  initialize(wasmPath: string): Promise<void>;
  parse(filePath: string, sourceCode: string): ParsedAST;
  getRawParser(): any;
}

export class ParserRegistry {
  private parsers: Map<string, LanguageParser> = new Map();
  private heuristicParser = new RobustHeuristicParser();
  private codeMapGenerator = new CodeMapGenerator();
  private initialized = false;

  public async initialize(): Promise<void> {
    if (this.initialized) return;

    let wasmsDir = '';
    try {
      wasmsDir = path.dirname(require.resolve('tree-sitter-wasms/package.json'));
      wasmsDir = path.join(wasmsDir, 'out');
    } catch(e) {
      wasmsDir = path.resolve(__dirname, '../../../node_modules/tree-sitter-wasms/out');
    }

    try {
      const tsParser = new TypeScriptParser();
      await tsParser.initialize(path.join(wasmsDir, 'tree-sitter-typescript.wasm'));
      this.register(tsParser);

      const jsParser = new TypeScriptParser();
      jsParser.language = 'javascript';
      await jsParser.initialize(path.join(wasmsDir, 'tree-sitter-javascript.wasm'));
      this.register(jsParser);

      const pyParser = new PythonParser();
      await pyParser.initialize(path.join(wasmsDir, 'tree-sitter-python.wasm'));
      this.register(pyParser);

      const goParser = new GoParser();
      await goParser.initialize(path.join(wasmsDir, 'tree-sitter-go.wasm'));
      this.register(goParser);

      const rustParser = new RustParser();
      await rustParser.initialize(path.join(wasmsDir, 'tree-sitter-rust.wasm'));
      this.register(rustParser);
    } catch (_err) {
      // Tree-sitter wasms not available on this platform; heuristic fallback will seamlessly activate
    }

    this.initialized = true;
  }

  public register(parser: LanguageParser) {
    this.parsers.set(parser.language, parser);
  }

  public detectLanguage(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.ts' || ext === '.tsx') return 'typescript';
    if (ext === '.js' || ext === '.jsx' || ext === '.mjs' || ext === '.cjs') return 'javascript';
    if (ext === '.py') return 'python';
    if (ext === '.go') return 'go';
    if (ext === '.rs') return 'rust';
    if (ext === '.java') return 'java';
    if (ext === '.cs') return 'csharp';
    if (ext === '.cpp' || ext === '.cc' || ext === '.cxx' || ext === '.hpp') return 'cpp';
    if (ext === '.c' || ext === '.h') return 'c';
    if (ext === '.php') return 'php';
    if (ext === '.rb') return 'ruby';
    return 'unknown';
  }

  public getParser(language: string): LanguageParser | undefined {
    return this.parsers.get(language);
  }

  public parseFile(filePath: string, sourceCode: string): ParsedAST | null {
    const language = this.detectLanguage(filePath);
    if (language === 'unknown') {
      return null;
    }

    // Attempt tree-sitter parse if initialized and parser registered
    if (this.initialized) {
      const parser = this.getParser(language);
      if (parser) {
        try {
          return parser.parse(filePath, sourceCode);
        } catch (_err) {
          // Fall through to heuristic fallback
        }
      }
    }

    // Heuristic fallback guarantees reliable parsing
    return this.heuristicParser.parse(filePath, sourceCode, language);
  }

  public generateCodeMap(
    files: Array<{ path: string; content: string }>,
    options: CodeMapOptions = {}
  ): string {
    const parsed: ParsedAST[] = [];
    for (const f of files) {
      const ast = this.parseFile(f.path, f.content);
      if (ast) parsed.push(ast);
    }
    return this.codeMapGenerator.generateMap(parsed, options);
  }
}
