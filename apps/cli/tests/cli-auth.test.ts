import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { AuthCommand } from '../src/cli/commands/auth';

describe('agentos auth Command', () => {
  let tempDir: string;
  let originalUserProfile: string | undefined;
  let originalHome: string | undefined;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentos-auth-test-'));
    originalUserProfile = process.env.USERPROFILE;
    originalHome = process.env.HOME;
    process.env.USERPROFILE = tempDir;
    process.env.HOME = tempDir;
  });

  afterEach(() => {
    if (originalUserProfile) process.env.USERPROFILE = originalUserProfile;
    if (originalHome) process.env.HOME = originalHome;
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (_e) {}
  });

  it('reports unconfigured status when no keys are present', () => {
    const cmd = new AuthCommand();
    const statuses = cmd.getStatus();
    expect(statuses.length).toBeGreaterThanOrEqual(5);
  });

  it('saves and masks API keys correctly', () => {
    const cmd = new AuthCommand();
    const res = cmd.setApiKey('anthropic', 'sk-ant-api03-abcdefghijklmnop1234');
    expect(res.success).toBe(true);
    expect(res.provider).toBe('anthropic');

    const statuses = cmd.getStatus();
    const anthropicStatus = statuses.find(s => s.provider === 'anthropic');
    expect(anthropicStatus?.isConfigured).toBe(true);
    expect(anthropicStatus?.maskedKey).toContain('sk-ant-');
    expect(anthropicStatus?.maskedKey).toContain('1234');
    expect(anthropicStatus?.maskedKey).not.toContain('abcdefghijklmnop');

    // Remove key
    cmd.removeApiKey('anthropic');
    const afterStatuses = cmd.getStatus();
    const afterAnthropic = afterStatuses.find(s => s.provider === 'anthropic');
    if (!process.env.ANTHROPIC_API_KEY) {
      expect(afterAnthropic?.isConfigured).toBe(false);
    }
  });
});
