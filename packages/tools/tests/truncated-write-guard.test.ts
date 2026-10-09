import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { TruncatedWriteGuard } from '../src/guards/TruncatedWriteGuard';
import { writeFileTool } from '../src/implementations/write_file';
import { editFileTool } from '../src/implementations/edit_file';
import * as fs from 'fs';
import * as path from 'path';

describe('TruncatedWriteGuard', () => {
  const tmpDir = path.join(process.cwd(), '.agentos', 'test-write-guard');
  const targetFile = path.join(tmpDir, 'large-file.ts');

  beforeEach(() => {
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('detects unclosed JSON prefix strings correctly', () => {
    expect(TruncatedWriteGuard.isTruncatedJsonPrefix('{ "path": "src/foo.ts", "content": "func')).toBe(true);
    expect(TruncatedWriteGuard.isTruncatedJsonPrefix('{ "path": "src/foo.ts", "content": [1, 2')).toBe(true);
    expect(TruncatedWriteGuard.isTruncatedJsonPrefix('{"complete": true}')).toBe(false);
    expect(TruncatedWriteGuard.isTruncatedJsonPrefix('[1, 2, 3]')).toBe(false);
    expect(TruncatedWriteGuard.isTruncatedJsonPrefix('')).toBe(false);
  });

  it('counts net open brackets correctly', () => {
    expect(TruncatedWriteGuard.netOpenBrackets('function test() { if (x) {')).toBe(2);
    expect(TruncatedWriteGuard.netOpenBrackets('function test() { return (1 + 2); }')).toBe(0);
    expect(TruncatedWriteGuard.netOpenBrackets('return [1, 2, (3 + 4)];')).toBe(0);
  });

  it('detects cut-off rewrite on 30+ line files with open brackets and under 60% ratio', () => {
    const originalLines = Array.from({ length: 40 }, (_, i) => `export const val${i} = ${i};`).join('\n');
    const cutOffFragment = 'export const val0 = 0;\nfunction unfinished(x: number) {\n  if (x > 0) {';

    const check = TruncatedWriteGuard.detectTruncatedRewrite(originalLines, cutOffFragment);
    expect(check.isTruncated).toBe(true);
    expect(check.reason).toBeDefined();
    expect(check.reason).toContain('leaves 2 unclosed bracket(s)');
  });

  it('does not reject small files or legitimate complete rewrites', () => {
    // Small file under 30 lines
    const smallFile = 'export const a = 1;\nexport const b = 2;\n';
    const smallRewrite = 'export const c = 3;\n';
    expect(TruncatedWriteGuard.detectTruncatedRewrite(smallFile, smallRewrite).isTruncated).toBe(false);

    // 40 line file replaced by a complete shorter file that closes all brackets
    const originalLines = Array.from({ length: 40 }, (_, i) => `export const val${i} = ${i};`).join('\n');
    const cleanRewrite = 'export const simplified = true;\n';
    expect(TruncatedWriteGuard.detectTruncatedRewrite(originalLines, cleanRewrite).isTruncated).toBe(false);
  });

  it('writeFileTool refuses cut-off rewrite unless allowTruncation is true', async () => {
    const originalLines = Array.from({ length: 50 }, (_, i) => `export const line${i} = "data_${i}";`).join('\n');
    fs.writeFileSync(targetFile, originalLines, 'utf8');

    const cutOffContent = 'export const line0 = "data_0";\nfunction partial() {\n';

    // 1. Without allowTruncation -> refused!
    const resultRefused = await writeFileTool.execute({
      path: '.agentos/test-write-guard/large-file.ts',
      content: cutOffContent,
      overwrite: true,
    }, { workspaceRoot: process.cwd() });

    expect(resultRefused.isError).toBe(true);
    expect(resultRefused.content).toContain('Truncated rewrite refused');
    // Verify file on disk is unchanged!
    expect(fs.readFileSync(targetFile, 'utf8')).toBe(originalLines);

    // 2. With allowTruncation -> permitted!
    const resultAllowed = await writeFileTool.execute({
      path: '.agentos/test-write-guard/large-file.ts',
      content: cutOffContent,
      overwrite: true,
      allowTruncation: true,
    }, { workspaceRoot: process.cwd() });

    expect(resultAllowed.isError).toBe(false);
    expect(fs.readFileSync(targetFile, 'utf8')).toBe(cutOffContent);
  });

  it('editFileTool refuses cut-off replacement block on large sections unless allowTruncation is true', async () => {
    const sectionToReplace = Array.from({ length: 40 }, (_, i) => `function block${i}() { return ${i}; }`).join('\n');
    const fullContent = `// header\n${sectionToReplace}\n// footer`;
    fs.writeFileSync(targetFile, fullContent, 'utf8');

    const cutOffReplacement = 'function replacement() {\n  if (true) {';

    // 1. Without allowTruncation -> refused!
    const resultRefused = await editFileTool.execute({
      path: '.agentos/test-write-guard/large-file.ts',
      oldText: sectionToReplace,
      newText: cutOffReplacement,
    }, { workspaceRoot: process.cwd() });

    expect(resultRefused.isError).toBe(true);
    expect(resultRefused.content).toContain('Refusing edit');
    expect(fs.readFileSync(targetFile, 'utf8')).toBe(fullContent);

    // 2. With allowTruncation -> permitted!
    const resultAllowed = await editFileTool.execute({
      path: '.agentos/test-write-guard/large-file.ts',
      oldText: sectionToReplace,
      newText: cutOffReplacement,
      allowTruncation: true,
    }, { workspaceRoot: process.cwd() });

    expect(resultAllowed.isError).toBe(false);
    expect(fs.readFileSync(targetFile, 'utf8')).toBe(`// header\n${cutOffReplacement}\n// footer`);
  });
});
