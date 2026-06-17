import { describe, it, expect, beforeEach, mock } from 'bun:test';
import * as path from 'path';
import { WorkspaceManager } from '../src/workspace';
import { CommandPolicyEngine, CommandMode } from '../src/policy';

describe('WorkspaceManager', () => {
  let manager: WorkspaceManager;
  const mockRoot = path.resolve(__dirname, 'mock-workspace');

  beforeEach(() => {
    manager = new WorkspaceManager(mockRoot);
  });

  it('should allow paths inside workspace', () => {
    const allowedPath = manager.resolvePath('src/index.ts');
    expect(allowedPath).toBe(path.resolve(mockRoot, 'src/index.ts'));
    expect(manager.isWithinWorkspace(allowedPath)).toBe(true);
  });

  it('should prevent path traversal outside workspace', () => {
    expect(() => manager.resolvePath('../../../etc/passwd')).toThrow('Security Violation');
    expect(() => manager.resolvePath('src/../../outside.txt')).toThrow('Security Violation');
  });

  it('should correctly handle the root itself', () => {
    const rootPath = manager.resolvePath('.');
    expect(rootPath).toBe(mockRoot);
    expect(manager.isWithinWorkspace(rootPath)).toBe(true);
  });
});

describe('CommandPolicyEngine', () => {
  it('should allow all commands in DANGER mode', async () => {
    const engine = new CommandPolicyEngine(CommandMode.DANGER);
    const decision = await engine.evaluate('rm -rf /');
    expect(decision.allowed).toBe(true);
  });

  it('should block unsafe commands in AUTO mode', async () => {
    const engine = new CommandPolicyEngine(CommandMode.AUTO);
    const decision = await engine.evaluate('rm -rf /');
    expect(decision.allowed).toBe(false);
    expect(decision.requiresApproval).toBe(true);
  });

  it('should allow safe commands in AUTO mode', async () => {
    const engine = new CommandPolicyEngine(CommandMode.AUTO);
    const decision = await engine.evaluate('ls -la');
    expect(decision.allowed).toBe(true);
  });

  it('should enforce ASK mode and require callback', async () => {
    const engine = new CommandPolicyEngine(CommandMode.ASK);
    
    // No callback set
    let decision = await engine.evaluate('ls');
    expect(decision.allowed).toBe(false);
    expect(decision.requiresApproval).toBe(true);

    // Callback set to approve
    engine.setApprovalCallback(async () => true);
    decision = await engine.evaluate('ls');
    expect(decision.allowed).toBe(true);

    // Callback set to deny
    engine.setApprovalCallback(async () => false);
    decision = await engine.evaluate('ls');
    expect(decision.allowed).toBe(false);
  });
});
