import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { repoMapTool, indexerMap } from '../src/implementations/repo_map';

describe('repo_map tool', () => {
  let tempDir: string;

  beforeEach(() => {
    indexerMap.clear();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-map-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
    indexerMap.clear();
  });

  it('1. Query returns ranked files with matching file ranked first', async () => {
    const srcDir = path.join(tempDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });

    fs.writeFileSync(
      path.join(srcDir, 'approval.ts'),
      'export class ApprovalService { approve() { return true; } }'
    );
    fs.writeFileSync(
      path.join(srcDir, 'user.ts'),
      'export class UserService { getUser() { return "alice"; } }'
    );
    fs.writeFileSync(
      path.join(srcDir, 'math.ts'),
      'export function add(a: number, b: number): number { return a + b; }'
    );

    const result = await repoMapTool.execute({ query: 'approval' }, { workspaceRoot: tempDir });
    expect(result.isError).toBe(false);
    expect(result.content).toContain('approval.ts');

    const approvalIndex = result.content.indexOf('approval.ts');
    const userIndex = result.content.indexOf('user.ts');
    const mathIndex = result.content.indexOf('math.ts');

    expect(approvalIndex).toBeGreaterThan(-1);
    if (userIndex !== -1) expect(approvalIndex).toBeLessThan(userIndex);
    if (mathIndex !== -1) expect(approvalIndex).toBeLessThan(mathIndex);
  });

  it('2. Token truncation triggers when content exceeds budget', async () => {
    const srcDir = path.join(tempDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });

    for (let i = 0; i < 10; i++) {
      fs.writeFileSync(
        path.join(srcDir, `module_${i}.ts`),
        `export class Module${i} { runAction${i}() { return ${i}; } }`
      );
    }

    // Very small maxTokens budget: 15 tokens -> ~60 chars
    const result = await repoMapTool.execute({ maxTokens: 15 }, { workspaceRoot: tempDir });
    expect(result.isError).toBe(false);
    expect(result.content).toContain('...(truncated');
  });

  it('3. Empty workspace returns graceful empty result', async () => {
    const result = await repoMapTool.execute({}, { workspaceRoot: tempDir });
    expect(result.isError).toBe(false);
    expect(result.content).toBe('No matching files found.');
  });

  it('4. Lazy init reuses cached indexer for same workspace root', async () => {
    const srcDir = path.join(tempDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'index.ts'), 'export const ready = true;');

    const res1 = await repoMapTool.execute({}, { workspaceRoot: tempDir });
    expect(res1.isError).toBe(false);
    expect(indexerMap.has(tempDir)).toBe(true);

    const cachedEntry = indexerMap.get(tempDir);
    expect(cachedEntry).toBeDefined();
    expect(cachedEntry!.buildCount).toBe(1);

    // Call again on the same workspace root
    const res2 = await repoMapTool.execute({}, { workspaceRoot: tempDir });
    expect(res2.isError).toBe(false);

    // Entry should still be the exact same instance with buildCount = 1
    const secondEntry = indexerMap.get(tempDir);
    expect(secondEntry).toBe(cachedEntry);
    expect(secondEntry!.buildCount).toBe(1);
  });
});
