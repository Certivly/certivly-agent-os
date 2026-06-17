import * as path from 'path';
import { ParsedAST } from './models';
import { TypeScriptParser } from './parsers/typescript';
import { PythonParser } from './parsers/python';
import { GoParser } from './parsers/go';
import { RustParser } from './parsers/rust';

export interface LanguageParser {
  language: string;
  initialize(wasmPath: string): Promise<void>;
  parse(filePath: string, sourceCode: string): ParsedAST;
}

export class ParserRegistry {
  private parsers: Map<string, LanguageParser> = new Map();
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

    this.initialized = true;
  }

  public register(parser: LanguageParser) {
    this.parsers.set(parser.language, parser);
  }

  public detectLanguage(filePath: string): string {
    if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) return 'typescript';
    if (filePath.endsWith('.js') || filePath.endsWith('.jsx')) return 'javascript';
    if (filePath.endsWith('.py')) return 'python';
    if (filePath.endsWith('.go')) return 'go';
    if (filePath.endsWith('.rs')) return 'rust';
    return 'unknown';
  }

  public getParser(language: string): LanguageParser | undefined {
    return this.parsers.get(language);
  }

  public parseFile(filePath: string, sourceCode: string): ParsedAST | null {
    if (!this.initialized) throw new Error('ParserRegistry not initialized');
    
    const language = this.detectLanguage(filePath);
    const parser = this.getParser(language);
    
    if (!parser) {
      return null; // unsupported language
    }

    return parser.parse(filePath, sourceCode);
  }
}
