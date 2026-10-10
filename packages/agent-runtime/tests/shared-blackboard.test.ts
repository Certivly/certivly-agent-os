import { describe, it, expect } from 'bun:test';
import { SharedBlackboard } from '../src/multiagent/SharedBlackboard';

describe('SharedBlackboard (Cross-Subagent State Sharing)', () => {
  it('1. writes and reads namespaced entries with author attribution', () => {
    const bb = new SharedBlackboard();
    bb.write('files', ['src/auth/jwt.ts', 'src/auth/session.ts'], 'explorer', 'auth');
    bb.write('status', 'tests_passing', 'verifier', 'test');

    expect(bb.has('files', 'auth')).toBe(true);
    expect(bb.read<string[]>('files', 'auth')).toEqual(['src/auth/jwt.ts', 'src/auth/session.ts']);
    expect(bb.read<string>('status', 'test')).toBe('tests_passing');
    expect(bb.read('nonexistent')).toBeUndefined();
  });

  it('2. filters entries by namespace or writer', () => {
    const bb = new SharedBlackboard();
    bb.write('item1', 'val1', 'explorer', 'discovery');
    bb.write('item2', 'val2', 'librarian', 'discovery');
    bb.write('item3', 'val3', 'coder', 'implementation');

    const discoveryEntries = bb.listEntries({ namespace: 'discovery' });
    expect(discoveryEntries.length).toBe(2);

    const coderEntries = bb.listEntries({ writer: 'coder' });
    expect(coderEntries.length).toBe(1);
    expect(coderEntries[0].value).toBe('val3');
  });

  it('3. generates clean Markdown digest for prompt injection', () => {
    const bb = new SharedBlackboard();
    bb.write('token_api', 'POST /auth/token supports PKCE code_challenge', 'librarian');
    bb.write('vulnerability', 'None found in dependency tree', 'reviewer');

    const digest = bb.formatDigest();
    expect(digest).toContain('### [Multi-Agent Shared Blackboard Findings]');
    expect(digest).toContain('token_api');
    expect(digest).toContain('librarian');
    expect(digest).toContain('reviewer');
  });
});
