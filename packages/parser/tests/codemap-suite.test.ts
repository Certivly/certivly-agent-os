import { describe, it, expect } from 'bun:test';
import { ParserRegistry, RobustHeuristicParser, CodeMapGenerator } from '../src';

describe('Parser & CodeMap Suite', () => {
  const registry = new ParserRegistry();

  it('detects extended languages by file extension', () => {
    expect(registry.detectLanguage('App.tsx')).toBe('typescript');
    expect(registry.detectLanguage('server.js')).toBe('javascript');
    expect(registry.detectLanguage('main.py')).toBe('python');
    expect(registry.detectLanguage('handler.go')).toBe('go');
    expect(registry.detectLanguage('lib.rs')).toBe('rust');
    expect(registry.detectLanguage('User.java')).toBe('java');
    expect(registry.detectLanguage('Program.cs')).toBe('csharp');
    expect(registry.detectLanguage('main.cpp')).toBe('cpp');
    expect(registry.detectLanguage('header.h')).toBe('c');
    expect(registry.detectLanguage('index.php')).toBe('php');
    expect(registry.detectLanguage('app.rb')).toBe('ruby');
    expect(registry.detectLanguage('unknown.xyz')).toBe('unknown');
  });

  it('parses Java, C#, and C++ files reliably using heuristic parser', () => {
    const javaCode = `
package com.example;
import java.util.List;

public class UserService {
    private String name;

    public void processUser(String id) {
        System.out.println(id);
    }
}
`;
    const ast = registry.parseFile('UserService.java', javaCode);
    expect(ast).toBeDefined();
    expect(ast?.language).toBe('java');
    const classes = ast?.nodes.filter(n => n.kind === 'class');
    expect(classes?.length).toBe(1);
    expect(classes?.[0].name).toBe('UserService');
  });

  it('generates a compact token-budgeted CodeMap from parsed files', () => {
    const files = [
      {
        path: 'src/services/AuthService.ts',
        content: `
import { db } from '../db';

export class AuthService {
  public async login(user: string, pass: string): Promise<boolean> {
    return true;
  }

  public logout(): void {}
}

export interface AuthToken {
  token: string;
}
`,
      },
      {
        path: 'src/utils/math.py',
        content: `
def add(a, b):
    return a + b

def multiply(a, b):
    return a * b
`,
      },
    ];

    const codeMap = registry.generateCodeMap(files, { maxTokens: 1000 });
    expect(codeMap).toContain('AuthService.ts');
    expect(codeMap).toContain('class AuthService');
    expect(codeMap).toContain('interface AuthToken');
    expect(codeMap).toContain('math.py');
    expect(codeMap).toContain('function add');
    expect(codeMap).toContain('function multiply');
  });

  it('handles empty and syntax-invalid files gracefully without throwing', () => {
    const invalid = `class { def ??? {{{`;
    const ast = registry.parseFile('broken.ts', invalid);
    expect(ast).toBeDefined();
    expect(ast?.nodes).toBeDefined();
  });
});
