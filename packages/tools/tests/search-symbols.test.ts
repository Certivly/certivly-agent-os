import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { searchSymbolsTool } from '../src/implementations/search_symbols';

describe('search_symbols Tool (Qwen Code Code Intelligence)', () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'search-symbols-test-'));

    // Create fixture files with symbols
    const srcDir = path.join(tmpDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });

    fs.writeFileSync(
      path.join(srcDir, 'auth.ts'),
      `
export class AuthService {
  private secretKey: string;

  constructor(secretKey: string) {
    this.secretKey = secretKey;
  }

  public verifyToken(token: string): boolean {
    return token.length > 10;
  }
}

export function generateToken(userId: string): string {
  return "token_" + userId;
}
`
    );

    fs.writeFileSync(
      path.join(srcDir, 'routes.ts'),
      `
import { AuthService, generateToken } from './auth';

export function handleLogin(user: string): string {
  const service = new AuthService('supersecret');
  return generateToken(user);
}
`
    );
  });

  afterAll(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error on Windows
    }
  });

  it('1. locates class and function definitions by query substring', async () => {
    const result = await searchSymbolsTool.execute(
      { query: 'AuthService' },
      { workspaceRoot: tmpDir }
    );

    expect(result.isError).toBe(false);
    expect(result.content).toContain('AuthService');
    expect(result.content).toContain('Class `AuthService`');
  });

  it('2. filters symbols by kind (Function vs Class)', async () => {
    const funcResult = await searchSymbolsTool.execute(
      { query: 'token', kind: 'Function' },
      { workspaceRoot: tmpDir }
    );

    expect(funcResult.isError).toBe(false);
    expect(funcResult.content).toContain('generateToken');
    expect(funcResult.content).not.toContain('Class `AuthService`');
  });

  it('3. returns callers when includeCallers is true', async () => {
    const callersResult = await searchSymbolsTool.execute(
      { query: 'generateToken', includeCallers: true },
      { workspaceRoot: tmpDir }
    );

    expect(callersResult.isError).toBe(false);
    expect(callersResult.content).toContain('generateToken');
  });

  it('4. returns graceful message when no symbols match', async () => {
    const notFound = await searchSymbolsTool.execute(
      { query: 'NonExistentSymbolxyz123' },
      { workspaceRoot: tmpDir }
    );

    expect(notFound.isError).toBe(false);
    expect(notFound.content).toContain('No symbols matching "NonExistentSymbolxyz123" found');
  });
});
