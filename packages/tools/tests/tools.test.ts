import { describe, it, expect } from 'bun:test';
import { ToolRegistry } from '../src/registry';
import { readFileTool, writeFileTool } from '../src/index';
import * as fs from 'fs';
import * as path from 'path';

describe('ToolRegistry', () => {
  it('should register and invoke tools', async () => {
    const registry = new ToolRegistry();
    registry.register(writeFileTool);
    registry.register(readFileTool);

    const testFile = path.join(__dirname, 'test-tool-file.txt');
    
    // Test write
    await registry.invoke('write_file', { path: testFile, content: 'hello tool' });
    expect(fs.existsSync(testFile)).toBe(true);

    // Test read
    const readResult = await registry.invoke('read_file', { path: testFile });
    expect(readResult).toContain('hello tool');

    // Cleanup
    fs.unlinkSync(testFile);
  });

  it('should throw when tool not found', async () => {
    const registry = new ToolRegistry();
    expect(registry.invoke('unknown_tool', {})).rejects.toThrow();
  });
});
