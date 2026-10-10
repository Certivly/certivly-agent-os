import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ToolOutputStore, toolOutputStore } from '../src/storage/ToolOutputStore';

describe('ToolOutputStore (OpenCode Managed Spillover Pattern)', () => {
  const tmpDir = path.join(os.tmpdir(), `test-tool-output-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);

  beforeEach(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('1. returns short output within bounds as-is with no truncation or file spillover', async () => {
    const store = new ToolOutputStore(tmpDir);
    const shortText = 'Line 1: Build started\nLine 2: Build complete\n';

    const result = await store.boundOutput(shortText, {
      maxLines: 100,
      maxBytes: 10_000,
    });

    expect(result.isTruncated).toBe(false);
    expect(result.preview).toBe(shortText);
    expect(result.spilloverPath).toBeUndefined();
    expect(result.totalLines).toBe(3); // 'Line 1', 'Line 2', ''
  });

  it('2. truncates output exceeding maxLines and spills full content to disk', async () => {
    const store = new ToolOutputStore(tmpDir);
    const lines: string[] = [];
    for (let i = 1; i <= 200; i++) {
      lines.push(`Line ${i}: processing item ${i}`);
    }
    const fullText = lines.join('\n');

    const result = await store.boundOutput(fullText, {
      maxLines: 20,
      maxBytes: 100_000,
      toolName: 'test_runner',
    });

    expect(result.isTruncated).toBe(true);
    expect(result.spilloverPath).toBeDefined();
    expect(fs.existsSync(result.spilloverPath!)).toBe(true);

    // Verify disk content is 100% full and intact
    const diskContent = fs.readFileSync(result.spilloverPath!, 'utf8');
    expect(diskContent).toBe(fullText);

    // Verify preview contains head, tail, and pointer marker
    expect(result.preview).toContain('Line 1: processing item 1');
    expect(result.preview).toContain('Line 200: processing item 200');
    expect(result.preview).toContain('output truncated:');
    expect(result.preview).toContain(result.spilloverPath!);
  });

  it('3. truncates output exceeding maxBytes and preserves bidirectional boundaries', async () => {
    const store = new ToolOutputStore(tmpDir);
    const head = 'START_OF_OUTPUT_LOGS_ABC123\n';
    const filler = 'X'.repeat(80_000);
    const tail = '\nEND_OF_OUTPUT_LOGS_XYZ789';
    const largeText = `${head}${filler}${tail}`;

    const result = await store.boundOutput(largeText, {
      maxLines: 1000,
      maxBytes: 2000,
      toolName: 'bundle_build',
    });

    expect(result.isTruncated).toBe(true);
    expect(result.spilloverPath).toBeDefined();
    expect(fs.existsSync(result.spilloverPath!)).toBe(true);

    expect(result.preview).toContain('START_OF_OUTPUT_LOGS_ABC123');
    expect(result.preview).toContain('END_OF_OUTPUT_LOGS_XYZ789');
    expect(result.preview).toContain('Full output saved to:');
    expect(Buffer.byteLength(result.preview, 'utf8')).toBeLessThanOrEqual(2500);
  });

  it('4. cleans up expired spillover files according to retention policy', async () => {
    const store = new ToolOutputStore(tmpDir);

    // Create an old file
    const oldFilePath = path.join(tmpDir, 'tool_cmd_old.txt');
    fs.writeFileSync(oldFilePath, 'Old output', 'utf8');
    const oldTime = Date.now() - (8 * 24 * 60 * 60 * 1000); // 8 days ago
    fs.utimesSync(oldFilePath, new Date(oldTime), new Date(oldTime));

    // Create a fresh file
    const newFilePath = path.join(tmpDir, 'tool_cmd_new.txt');
    fs.writeFileSync(newFilePath, 'Fresh output', 'utf8');

    // Clean up with 7-day retention
    const removedCount = await store.cleanupExpired(undefined, 7 * 24 * 60 * 60 * 1000);

    expect(removedCount).toBe(1);
    expect(fs.existsSync(oldFilePath)).toBe(false);
    expect(fs.existsSync(newFilePath)).toBe(true);
  });

  it('5. counts lines accurately across single and multiline strings', () => {
    expect(ToolOutputStore.countLines('')).toBe(0);
    expect(ToolOutputStore.countLines('Single line')).toBe(1);
    expect(ToolOutputStore.countLines('Line 1\nLine 2\nLine 3')).toBe(3);
    expect(ToolOutputStore.countLines('Line 1\r\nLine 2\r\n')).toBe(3);
  });
});
