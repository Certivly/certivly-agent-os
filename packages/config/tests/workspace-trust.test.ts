import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { WorkspaceTrustManager } from '../src/trust';
import * as fs from 'fs';
import * as path from 'path';

describe('WorkspaceTrustManager', () => {
  const testStorePath = path.join(__dirname, 'test-trusted-workspaces.json');
  const dummyWorkspace = path.join(__dirname, 'dummy-repo');

  beforeEach(() => {
    if (fs.existsSync(testStorePath)) fs.unlinkSync(testStorePath);
  });

  afterEach(() => {
    if (fs.existsSync(testStorePath)) fs.unlinkSync(testStorePath);
  });

  it('manages workspace trust lifecycle: query, trust, and revoke', () => {
    const manager = new WorkspaceTrustManager(testStorePath);

    // Initial check: not trusted
    expect(manager.isWorkspaceTrusted(dummyWorkspace)).toBe(false);

    // Trust workspace
    manager.trustWorkspace(dummyWorkspace);
    expect(manager.isWorkspaceTrusted(dummyWorkspace)).toBe(true);

    // Check persistence by creating a new manager instance
    const freshManager = new WorkspaceTrustManager(testStorePath);
    expect(freshManager.isWorkspaceTrusted(dummyWorkspace)).toBe(true);
    expect(freshManager.listTrusted().length).toBe(1);

    // Revoke trust
    freshManager.revokeWorkspace(dummyWorkspace);
    expect(freshManager.isWorkspaceTrusted(dummyWorkspace)).toBe(false);
  });
});
