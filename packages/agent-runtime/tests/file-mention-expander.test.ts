import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { FileMentionExpander } from '../src/input/FileMentionExpander';

describe('FileMentionExpander (Learned from Qwen Code Context Awareness)', () => {
  let tempWs: string;

  beforeEach(() => {
    tempWs = fs.mkdtempSync(path.join(os.tmpdir(), 'mention-test-ws-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempWs, { recursive: true, force: true });
    } catch (_e) {
      // Cleanup temp workspace
    }
  });

  it('1. Extracts candidate paths and ignores email addresses', () => {
    const input = 'Check out @src/index.ts and contact alice@example.com or @package.json';
    const candidates = FileMentionExpander.extractCandidatePaths(input);

    expect(candidates).toContain('src/index.ts');
    expect(candidates).toContain('package.json');
    expect(candidates).not.toContain('example.com');
  });

  it('2. Expands valid workspace file and embeds <context_file> block', () => {
    const filePath = path.join(tempWs, 'src', 'math.ts');
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, 'export function add(a: number, b: number) { return a + b; }');

    const input = 'Please review @src/math.ts and optimize it';
    const result = FileMentionExpander.expand(input, { workspaceRoot: tempWs });

    expect(result.attachedFiles.length).toBe(1);
    expect(result.attachedFiles[0].path).toBe('src/math.ts');
    expect(result.attachedFiles[0].truncated).toBe(false);
    expect(result.expandedInput).toContain('<context_file path="src/math.ts"');
    expect(result.expandedInput).toContain('export function add');
  });

  it('3. Rejects path traversal attempts outside workspace', () => {
    const outsideFile = path.join(os.tmpdir(), 'outside-secret.txt');
    fs.writeFileSync(outsideFile, 'SECRET_KEY=12345');

    try {
      const input = 'Show me @../outside-secret.txt please';
      const result = FileMentionExpander.expand(input, { workspaceRoot: tempWs });

      expect(result.attachedFiles.length).toBe(0);
      expect(result.expandedInput).toBe(input);
    } finally {
      try {
        fs.unlinkSync(outsideFile);
      } catch (_e) {
        // cleanup
      }
    }
  });

  it('4. Truncates large files exceeding maxBytesPerFile', () => {
    const largeFile = path.join(tempWs, 'large.txt');
    const content = Array.from({ length: 300 }, (_, i) => `Line ${i + 1}: Some long data content here`).join('\n');
    fs.writeFileSync(largeFile, content);

    const input = 'Analyze @large.txt';
    const result = FileMentionExpander.expand(input, { workspaceRoot: tempWs, maxBytesPerFile: 500 });

    expect(result.attachedFiles.length).toBe(1);
    expect(result.attachedFiles[0].truncated).toBe(true);
    expect(result.attachedFiles[0].content).toContain('lines omitted');
    expect(result.expandedInput).toContain('truncated="true"');
  });

  it('5. Gracefully handles missing files without modifying user query', () => {
    const input = 'Look at @nonexistent/file.ts for details';
    const result = FileMentionExpander.expand(input, { workspaceRoot: tempWs });

    expect(result.attachedFiles.length).toBe(0);
    expect(result.expandedInput).toBe(input);
  });
});
