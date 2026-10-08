import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as path from 'path';
import * as fs from 'fs';
import { readFileTool } from '../src/implementations/read_file';
import type { ToolContext } from '../src/types';

describe('Action 6-08: read_file line ranges beyond 64KB', () => {
  const testWorkspace = path.join(__dirname, '.tmp-read-range-ws');
  const context: ToolContext = { workspaceRoot: testWorkspace };

  beforeEach(() => {
    if (fs.existsSync(testWorkspace)) {
      fs.rmSync(testWorkspace, { recursive: true, force: true });
    }
    fs.mkdirSync(testWorkspace, { recursive: true });
  });

  afterEach(() => {
    try {
      if (fs.existsSync(testWorkspace)) {
        fs.rmSync(testWorkspace, { recursive: true, force: true });
      }
    } catch {}
  });

  it('1. correctly reads line ranges beyond 64KB with exact line numbers', async () => {
    const filePath = path.join(testWorkspace, 'large-source.ts');
    // Generate a file with 3,000 lines, each line ~50 bytes -> ~150 KB (larger than 64 KB)
    const lines: string[] = [];
    for (let i = 1; i <= 3000; i++) {
      if (i === 2500) {
        lines.push('export const SPECIAL_FUNCTION = () => "unique_code_here";');
      } else {
        lines.push(`// Line ${i}: standard filler text to expand file size beyond 64kb`);
      }
    }
    fs.writeFileSync(filePath, lines.join('\n'), 'utf8');

    const stat = fs.statSync(filePath);
    expect(stat.size).toBeGreaterThan(64 * 1024);

    // Read range beyond 64KB (lines 2498 to 2502)
    const res = await readFileTool.execute(
      { path: 'large-source.ts', startLine: 2498, endLine: 2502 },
      context
    );

    expect(res.isError).toBe(false);
    expect(res.content).toContain('2500 | export const SPECIAL_FUNCTION = () => "unique_code_here";');
    expect(res.content).toContain('2498 |');
    expect(res.content).toContain('2502 |');
    expect(res.content).not.toContain('2503 |');
    expect(res.content.startsWith('1 | ')).toBe(false);
  });

  it('2. truncates with explicit marker when output exceeds maxBytes', async () => {
    const filePath = path.join(testWorkspace, 'long.txt');
    const content = Array.from({ length: 500 }, (_, i) => `Line ${i + 1}: Some verbose text for testing truncation`).join('\n');
    fs.writeFileSync(filePath, content, 'utf8');

    const res = await readFileTool.execute(
      { path: 'long.txt', maxBytes: 500 },
      context
    );

    expect(res.isError).toBe(false);
    expect(res.content).toContain('[... truncated file content ...]');
  });

  it('3. handles startLine beyond end of file gracefully', async () => {
    const filePath = path.join(testWorkspace, 'short.txt');
    fs.writeFileSync(filePath, 'line 1\nline 2\nline 3\n', 'utf8');

    const res = await readFileTool.execute(
      { path: 'short.txt', startLine: 50, endLine: 60 },
      context
    );

    expect(res.isError).toBe(false);
    expect(res.content).toContain('beyond end of file');
  });
});
