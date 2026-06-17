import { describe, it, expect } from 'bun:test';
import { ParserRegistry } from '../src/registry';

describe('Tree-sitter Parser Layer', () => {
  it('should parse typescript correctly', async () => {
    const code = `
      import { x } from './y';
      export function hello() {
        console.log(x);
      }
      export class Greeter {
        greet() {
          hello();
        }
      }
    `;

    const registry = new ParserRegistry();
    await registry.initialize();
    const ast = registry.parseFile('test.ts', code);
    
    expect(ast).toBeDefined();
    if (!ast) return;
    
    expect(ast.language).toBe('typescript');
    expect(ast.nodes.length).toBeGreaterThan(0);
    
    const classes = ast.nodes.filter(n => n.kind === 'class');
    expect(classes.length).toBe(1);
    // @ts-ignore
    expect(classes[0].name).toBe('Greeter');

    const functions = ast.nodes.filter(n => n.kind === 'function');
    expect(functions.length).toBe(1);
    // @ts-ignore
    expect(functions[0].name).toBe('hello');

    const methods = ast.nodes.filter(n => n.kind === 'method');
    expect(methods.length).toBe(1);
    // @ts-ignore
    expect(methods[0].name).toBe('greet');
    // @ts-ignore
    expect(methods[0].parent).toBe('Greeter');

    const imports = ast.nodes.filter(n => n.kind === 'import');
    expect(imports.length).toBe(1);
    // @ts-ignore
    expect(imports[0].source).toBe('./y');

    const calls = ast.nodes.filter(n => n.kind === 'call');
    // console.log and hello()
    expect(calls.length).toBe(2);
    // @ts-ignore
    expect(calls.some(c => c.callee.includes('console.log'))).toBe(true);
    // @ts-ignore
    expect(calls.some(c => c.callee === 'hello')).toBe(true);
  });
});
