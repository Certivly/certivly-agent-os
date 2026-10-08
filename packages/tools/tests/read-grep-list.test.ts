import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as path from 'path';
import * as fs from 'fs';
import { readFileTool } from '../src/implementations/read_file';
import { grepTool } from '../src/implementations/grep';
import { listDirTool } from '../src/implementations/list_dir';
import type { ToolContext } from '../src/types';

describe('Read, Grep, and List Tools (Action 2.02)', () => {
  const testWorkspace = path.join(__dirname, '.tmp-read-grep-list-ws');
  const outsideWorkspace = path.join(__dirname, '.tmp-read-grep-outside');
  const context: ToolContext = { workspaceRoot: testWorkspace };

  beforeEach(() => {
    if (fs.existsSync(testWorkspace)) {
      fs.rmSync(testWorkspace, { recursive: true, force: true });
    }
    if (fs.existsSync(outsideWorkspace)) {
      fs.rmSync(outsideWorkspace, { recursive: true, force: true });
    }

    fs.mkdirSync(testWorkspace, { recursive: true });
    fs.mkdirSync(outsideWorkspace, { recursive: true });

    // Seed workspace structure
    fs.mkdirSync(path.join(testWorkspace, 'src', 'utils'), { recursive: true });
    fs.mkdirSync(path.join(testWorkspace, 'dist'), { recursive: true });
    fs.mkdirSync(path.join(testWorkspace, 'node_modules', 'dep'), { recursive: true });

    fs.writeFileSync(path.join(testWorkspace, 'src', 'index.ts'), 'console.log("hello index");\nconst x = 42;\nexport const foo = "bar";\n');
    fs.writeFileSync(path.join(testWorkspace, 'src', 'utils', 'helper.ts'), 'export function help() {\n  return "helping";\n}\n');
    fs.writeFileSync(path.join(testWorkspace, 'dist', 'bundle.js'), 'console.log("compiled bundle");\n');
    fs.writeFileSync(path.join(testWorkspace, 'node_modules', 'dep', 'index.js'), 'module.exports = {};\n');

    // Outside file
    fs.writeFileSync(path.join(outsideWorkspace, 'secret.txt'), 'SUPER_SECRET_TOKEN\n');

    // .gitignore
    fs.writeFileSync(path.join(testWorkspace, '.gitignore'), 'dist/\n*.tmp\nignored_dir/\n');
    fs.mkdirSync(path.join(testWorkspace, 'ignored_dir'), { recursive: true });
    fs.writeFileSync(path.join(testWorkspace, 'ignored_dir', 'file.txt'), 'should not be visible\n');
    fs.writeFileSync(path.join(testWorkspace, 'src', 'scratch.tmp'), 'temporary content\n');
  });

  afterEach(() => {
    try {
      if (fs.existsSync(testWorkspace)) fs.rmSync(testWorkspace, { recursive: true, force: true });
      if (fs.existsSync(outsideWorkspace)) fs.rmSync(outsideWorkspace, { recursive: true, force: true });
    } catch {}
  });

  it('1. line-numbered read returns line numbers', async () => {
    const res = await readFileTool.execute({ path: 'src/index.ts' }, context);
    expect(res.isError).toBe(false);
    expect(res.content).toContain('1 | console.log("hello index");');
    expect(res.content).toContain('2 | const x = 42;');
    expect(res.content).toContain('3 | export const foo = "bar";');
  });

  it('2. line range read returns only specified lines', async () => {
    const res = await readFileTool.execute({ path: 'src/index.ts', startLine: 2, endLine: 2 }, context);
    expect(res.isError).toBe(false);
    expect(res.content).toBe('2 | const x = 42;');
    expect(res.content).not.toContain('1 | console.log');
    expect(res.content).not.toContain('3 | export');
  });

  it('3. large file cap truncates content with marker', async () => {
    const largeFilePath = path.join(testWorkspace, 'large.txt');
    fs.writeFileSync(largeFilePath, 'A'.repeat(5000));

    const res = await readFileTool.execute({ path: 'large.txt', maxBytes: 500 }, context);
    expect(res.isError).toBe(false);
    expect(res.content).toContain('[... truncated file content ...]');
  });

  it('4. binary rejection refuses to read binary files', async () => {
    const binPath = path.join(testWorkspace, 'binary.bin');
    const binBuffer = Buffer.from([0x00, 0x01, 0x02, 0xff, 0x00]);
    fs.writeFileSync(binPath, binBuffer);

    const res = await readFileTool.execute({ path: 'binary.bin' }, context);
    expect(res.isError).toBe(true);
    expect(res.content).toContain('Cannot read binary file');
  });

  it('5. .. rejection prevents path traversal', async () => {
    const res = await readFileTool.execute({ path: '../secret.txt' }, context);
    expect(res.isError).toBe(true);
    expect(res.content).toContain('Security Violation');
  });

  it('6. symlink escape rejection prevents reading targets outside workspace', async () => {
    const symlinkPath = path.join(testWorkspace, 'escape_link');
    try {
      fs.symlinkSync(path.join(outsideWorkspace, 'secret.txt'), symlinkPath, 'file');
    } catch {
      // Symlinks might require admin on Windows; if so, skip test
      return;
    }

    const res = await readFileTool.execute({ path: 'escape_link' }, context);
    expect(res.isError).toBe(true);
    expect(res.content).toContain('Security Violation');
  });

  it('7. plain grep finds matching lines with path:line:text', async () => {
    const res = await grepTool.execute({ pattern: 'hello index' }, context);
    expect(res.isError).toBe(false);
    expect(res.content).toContain('src/index.ts:1:console.log("hello index");');
  });

  it('8. regex grep finds matches using pattern', async () => {
    const res = await grepTool.execute({ pattern: 'x = \\d+', regex: true }, context);
    expect(res.isError).toBe(false);
    expect(res.content).toContain('src/index.ts:2:const x = 42;');
  });

  it('9. .gitignore is respected during grep', async () => {
    const res = await grepTool.execute({ pattern: 'compiled bundle' }, context);
    expect(res.isError).toBe(false);
    // dist is in .gitignore
    expect(res.content).not.toContain('dist/bundle.js');
    expect(res.content).toContain('No matches found');
  });

  it('10. grep results cap limits matches', async () => {
    const multiPath = path.join(testWorkspace, 'multi.txt');
    fs.writeFileSync(multiPath, Array.from({ length: 50 }, (_, i) => `match_${i}`).join('\n'));

    const res = await grepTool.execute({ pattern: 'match_', maxResults: 5 }, context);
    expect(res.isError).toBe(false);
    expect(res.content).toContain('[... matches capped at 5 results ...]');
  });

  it('11. list depth limits traversal depth', async () => {
    const resDepth1 = await listDirTool.execute({ depth: 1 }, context);
    expect(resDepth1.isError).toBe(false);
    expect(resDepth1.content).toContain('src/');
    expect(resDepth1.content).not.toContain('src/utils/');

    const resDepth2 = await listDirTool.execute({ depth: 2 }, context);
    expect(resDepth2.isError).toBe(false);
    expect(resDepth2.content).toContain('src/utils/');
  });

  it('12. ignored dirs skipped in list_dir', async () => {
    const res = await listDirTool.execute({ depth: 3 }, context);
    expect(res.isError).toBe(false);
    expect(res.content).not.toContain('node_modules/');
    expect(res.content).not.toContain('dist/');
    expect(res.content).not.toContain('ignored_dir/');
    expect(res.content).not.toContain('scratch.tmp');
  });
});
