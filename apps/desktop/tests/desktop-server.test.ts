import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import * as path from 'path';
import * as fs from 'fs';
import { DesktopServer } from '../src/server/DesktopServer';

describe('AgentOS Desktop App Suite', () => {
  let server: DesktopServer;
  let serverUrl: string;
  let tempDir: string;

  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(process.cwd(), '.agentos', 'test-desktop-'));
    // Create test files in temp workspace
    fs.writeFileSync(path.join(tempDir, 'README.md'), '# Test Project\nWelcome to AgentOS Desktop.', 'utf-8');
    fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'src', 'index.ts'), 'export const hello = "world";', 'utf-8');

    server = new DesktopServer({
      port: 0, // Random ephemeral port
      host: '127.0.0.1',
      workspaceRoot: tempDir,
    });
    serverUrl = await server.start();
  });

  afterAll(async () => {
    await server.stop();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (_err) {
      void _err;
    }
  });

  it('1. serves rich HTML desktop UI on root endpoint', async () => {
    const res = await fetch(`${serverUrl}/`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('AgentOS Desktop');
    expect(html).toContain('Key Vault');
    expect(html).toContain('providerList');
    expect(html).toContain('promptInput');
  });

  it('2. health endpoint reports runtime status and workspace', async () => {
    const res = await fetch(`${serverUrl}/api/health`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('ok');
    expect(data.workspaceRoot).toBe(tempDir);
    expect(data.version).toBe('1.0.0');
    expect(typeof data.activeModel).toBe('string');
  });

  it('3. provider keys API retrieves configured statuses', async () => {
    const res = await fetch(`${serverUrl}/api/keys`);
    expect(res.status).toBe(200);
    const keys = await res.json();
    expect(Array.isArray(keys)).toBe(true);

    const providerIds = keys.map((k: any) => k.id);
    expect(providerIds).toContain('anthropic');
    expect(providerIds).toContain('openai');
    expect(providerIds).toContain('deepseek');
    expect(providerIds).toContain('gemini');
    expect(providerIds).toContain('ollama');
  });

  it('4. saves API key and updates provider configuration', async () => {
    const saveRes = await fetch(`${serverUrl}/api/keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'anthropic',
        apiKey: 'sk-ant-test-key-1234567890',
      }),
    });
    expect(saveRes.status).toBe(200);
    const saved = await saveRes.json();
    expect(saved.success).toBe(true);

    // Verify retrieval reflects saved key
    const listRes = await fetch(`${serverUrl}/api/keys`);
    const keys = await listRes.json();
    const anthropic = keys.find((k: any) => k.id === 'anthropic');
    expect(anthropic).toBeDefined();
    expect(anthropic.isConfigured).toBe(true);
    expect(anthropic.maskedKey).toContain('sk-ant');
  });

  it('5. tests API key connectivity with mock key', async () => {
    const testRes = await fetch(`${serverUrl}/api/keys/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'openai',
        apiKey: 'sk-test-mock-key-for-unit-test',
      }),
    });
    expect(testRes.status).toBe(200);
    const testData = await testRes.json();
    expect(testData.success).toBe(true);
    expect(testData.latencyMs).toBeGreaterThan(0);
  });

  it('6. models API returns catalog and switches active reasoning model', async () => {
    const catalogRes = await fetch(`${serverUrl}/api/models`);
    expect(catalogRes.status).toBe(200);
    const data = await catalogRes.json();
    expect(Array.isArray(data.models)).toBe(true);
    expect(data.models.length).toBeGreaterThan(5);

    const switchRes = await fetch(`${serverUrl}/api/models/active`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modelId: 'claude-3-7-sonnet-20250219', provider: 'anthropic' }),
    });
    expect(switchRes.status).toBe(200);
    const switchData = await switchRes.json();
    expect(switchData.activeModel).toBe('claude-3-7-sonnet-20250219');
  });

  it('7. creates, retrieves, lists, and deletes sessions', async () => {
    // Create
    const createRes = await fetch(`${serverUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Desktop Test Session' }),
    });
    expect(createRes.status).toBe(200);
    const session = await createRes.json();
    expect(session.id).toBeDefined();
    expect(session.title).toBe('Desktop Test Session');

    // List
    const listRes = await fetch(`${serverUrl}/api/sessions`);
    const sessions = await listRes.json();
    expect(sessions.some((s: any) => s.id === session.id)).toBe(true);

    // Get details
    const getRes = await fetch(`${serverUrl}/api/sessions/${session.id}`);
    expect(getRes.status).toBe(200);
    const details = await getRes.json();
    expect(details.session.id).toBe(session.id);
    expect(Array.isArray(details.messages)).toBe(true);

    // Delete
    const deleteRes = await fetch(`${serverUrl}/api/sessions/${session.id}`, { method: 'DELETE' });
    expect(deleteRes.status).toBe(200);
    const delData = await deleteRes.json();
    expect(delData.success).toBe(true);
  });

  it('8. workspace tree API returns repository files and folders', async () => {
    const treeRes = await fetch(`${serverUrl}/api/workspace/tree`);
    expect(treeRes.status).toBe(200);
    const data = await treeRes.json();
    expect(data.root).toBe(tempDir);
    expect(Array.isArray(data.tree)).toBe(true);

    const fileNames = data.tree.map((t: any) => t.name);
    expect(fileNames).toContain('README.md');
    expect(fileNames).toContain('src');
  });

  it('9. workspace file API reads file contents with safety checks', async () => {
    const fileRes = await fetch(`${serverUrl}/api/workspace/file?path=README.md`);
    expect(fileRes.status).toBe(200);
    const fileData = await fileRes.json();
    expect(fileData.content).toContain('Welcome to AgentOS Desktop.');

    // Traversal attempt is rejected
    const badRes = await fetch(`${serverUrl}/api/workspace/file?path=../../etc/passwd`);
    expect(badRes.status).toBe(403);
  });

  it('10. resolves interactive approval requests accurately', async () => {
    const approveRes = await fetch(`${serverUrl}/api/sessions/sess_test_appr/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        approvalId: 'appr_non_existent',
        approved: true,
      }),
    });
    expect(approveRes.status).toBe(200);
    const data = await approveRes.json();
    // Non-existent approval resolves to false gracefully without throwing
    expect(data.success).toBe(false);
  });
});
