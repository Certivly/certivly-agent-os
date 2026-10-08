import { describe, it, expect } from 'bun:test';
import {
  ChangeSet,
  normalizeChangePath,
  validateChangeSet,
  computeSha256,
} from '../index';

describe('Action 2.06: Canonical ChangeSet Model and Validation', () => {
  const dummyShaA = computeSha256('before-content');
  const dummyShaB = computeSha256('after-content');

  it('1. accepts a valid modify ChangeSet', () => {
    const cs: ChangeSet = {
      id: 'cs-modify-1',
      workspaceRoot: '/workspace/project',
      createdAt: new Date().toISOString(),
      files: [
        {
          path: 'src/index.ts',
          kind: 'modify',
          before: dummyShaA,
          after: dummyShaB,
          diff: '--- a/src/index.ts\n+++ b/src/index.ts\n@@ -1 +1 @@\n-before-content\n+after-content\n',
        },
      ],
    };

    const errors = validateChangeSet(cs);
    expect(errors).toHaveLength(0);
  });

  it('2. accepts a valid add ChangeSet', () => {
    const cs: ChangeSet = {
      id: 'cs-add-1',
      workspaceRoot: '/workspace/project',
      createdAt: new Date().toISOString(),
      files: [
        {
          path: 'src/components/Header.tsx',
          kind: 'add',
          after: dummyShaB,
          diff: '--- /dev/null\n+++ b/src/components/Header.tsx\n@@ -0,0 +1 @@\n+after-content\n',
        },
      ],
    };

    const errors = validateChangeSet(cs);
    expect(errors).toHaveLength(0);
  });

  it('3. accepts a valid delete ChangeSet', () => {
    const cs: ChangeSet = {
      id: 'cs-delete-1',
      workspaceRoot: '/workspace/project',
      createdAt: new Date().toISOString(),
      files: [
        {
          path: 'temp/obsolete.log',
          kind: 'delete',
          before: dummyShaA,
          diff: '--- a/temp/obsolete.log\n+++ /dev/null\n@@ -1 +0,0 @@\n-before-content\n',
        },
      ],
    };

    const errors = validateChangeSet(cs);
    expect(errors).toHaveLength(0);
  });

  it('4. rejects absolute paths with leading slash or drive letter', () => {
    const csWithSlash: ChangeSet = {
      id: 'cs-abs-1',
      workspaceRoot: '/workspace/project',
      createdAt: new Date().toISOString(),
      files: [
        {
          path: '/etc/passwd',
          kind: 'modify',
          before: dummyShaA,
          after: dummyShaB,
          diff: 'diff text',
        },
      ],
    };

    const errorsSlash = validateChangeSet(csWithSlash);
    expect(errorsSlash.length).toBeGreaterThan(0);
    expect(errorsSlash[0]).toContain('absolute paths are not allowed');

    const csWithDrive: ChangeSet = {
      id: 'cs-abs-2',
      workspaceRoot: 'C:\\workspace\\project',
      createdAt: new Date().toISOString(),
      files: [
        {
          path: 'C:\\Windows\\System32\\drivers.txt',
          kind: 'modify',
          before: dummyShaA,
          after: dummyShaB,
          diff: 'diff text',
        },
      ],
    };

    const errorsDrive = validateChangeSet(csWithDrive);
    expect(errorsDrive.length).toBeGreaterThan(0);
    expect(errorsDrive[0]).toContain('absolute paths are not allowed');
  });

  it('5. rejects .. path traversal attempts', () => {
    const csTraversal: ChangeSet = {
      id: 'cs-traversal-1',
      workspaceRoot: '/workspace/project',
      createdAt: new Date().toISOString(),
      files: [
        {
          path: '../../outside.txt',
          kind: 'modify',
          diff: 'diff text',
        },
        {
          path: 'src/../../escaped.ts',
          kind: 'modify',
          diff: 'diff text',
        },
      ],
    };

    const errors = validateChangeSet(csTraversal);
    expect(errors.length).toBe(2);
    expect(errors[0]).toContain("path traversal '..' is not allowed");
    expect(errors[1]).toContain("path traversal '..' is not allowed");
  });

  it('6. rejects .git/ and .git/config protected paths', () => {
    const csGit: ChangeSet = {
      id: 'cs-git-1',
      workspaceRoot: '/workspace/project',
      createdAt: new Date().toISOString(),
      files: [
        {
          path: '.git/config',
          kind: 'modify',
          diff: 'diff text',
        },
        {
          path: '.git/hooks/pre-commit',
          kind: 'add',
          diff: 'diff text',
        },
      ],
    };

    const errors = validateChangeSet(csGit);
    expect(errors.length).toBe(2);
    expect(errors[0]).toContain("modifying '.git/' paths is forbidden");
    expect(errors[1]).toContain("modifying '.git/' paths is forbidden");
  });

  it('7. normalizes Windows backslashes and redundant ./', () => {
    expect(normalizeChangePath('src\\components\\Button.tsx')).toBe('src/components/Button.tsx');
    expect(normalizeChangePath('.\\src\\index.ts')).toBe('src/index.ts');
    expect(normalizeChangePath('a/b/c')).toBe('a/b/c');
    expect(normalizeChangePath('./nested/file.txt')).toBe('nested/file.txt');
  });
});
