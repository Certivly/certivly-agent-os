import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { McpDoctor } from '../src/doctor/McpDoctor';

describe('McpDoctor Diagnostics (Phase 2)', () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-doc-test-'));
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('reports config not found when .agentos/mcp.json does not exist', async () => {
    const res = await McpDoctor.diagnose({ workspaceRoot: tmpDir });
    expect(res.configFound).toBe(false);
    expect(res.servers.length).toBe(0);

    const report = McpDoctor.formatReport(res);
    expect(report).toContain('None found');
  });

  it('reports syntax error when mcp.json contains malformed JSON', async () => {
    const configDir = path.join(tmpDir, '.agentos');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, 'mcp.json'), '{ broken: json');

    const res = await McpDoctor.diagnose({ workspaceRoot: tmpDir });
    expect(res.configFound).toBe(true);
    expect(res.servers[0].healthy).toBe(false);
    expect(res.servers[0].error).toContain('JSON');

    const report = McpDoctor.formatReport(res);
    expect(report).toContain('[FAIL]');
  });
});
