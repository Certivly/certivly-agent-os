import * as crypto from 'crypto';
import * as path from 'path';

export type ChangeKind = 'add' | 'modify' | 'delete' | 'create';

export interface ChangeSetFile {
  path: string;
  kind: ChangeKind;
  before?: string;
  after?: string;
  diff: string;
  afterContent?: string;
}

export interface ChangeSet {
  id: string;
  workspaceRoot: string;
  files: ChangeSetFile[];
  createdAt: string;
}

/**
 * Normalizes a relative path to POSIX format:
 * - Replaces backslashes with forward slashes
 * - Strips leading redundant ./
 * - Collapses consecutive slashes
 */
export function normalizeChangePath(filePath: string): string {
  if (!filePath) return '';
  let normalized = filePath.trim().replace(/\\/g, '/');

  // Strip leading ./
  while (normalized.startsWith('./')) {
    normalized = normalized.slice(2);
  }

  // Collapse multiple consecutive slashes except if leading slash exists
  const isAbsolute = normalized.startsWith('/');
  const parts = normalized.split('/').filter(p => p.length > 0 && p !== '.');
  const joined = parts.join('/');
  return isAbsolute ? '/' + joined : joined;
}

/**
 * Computes SHA-256 hex digest of a string or Buffer.
 */
export function computeSha256(content: string | Buffer): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Validates a ChangeSet according to the canonical rules:
 * - Paths are workspace-relative POSIX paths
 * - No leading slash (no absolute paths)
 * - No .. path traversal
 * - No .git/ directory modifications
 * - Hashes (before/after) are valid 64-char sha256 if present
 */
export function validateChangeSet(changeSet: ChangeSet): string[] {
  const errors: string[] = [];

  if (!changeSet.id || typeof changeSet.id !== 'string') {
    errors.push('ChangeSet must have a valid string id');
  }

  if (!changeSet.workspaceRoot || typeof changeSet.workspaceRoot !== 'string') {
    errors.push('ChangeSet must specify workspaceRoot');
  }

  if (!Array.isArray(changeSet.files)) {
    errors.push('ChangeSet files must be an array');
    return errors;
  }

  const shaRegex = /^[a-f0-9]{64}$/i;

  for (let i = 0; i < changeSet.files.length; i++) {
    const file = changeSet.files[i];
    const prefix = `files[${i}]`;

    if (!file.path || typeof file.path !== 'string') {
      errors.push(`${prefix}: path is required`);
      continue;
    }

    const rawPath = file.path.trim();

    // Check for absolute path (leading slash, Windows drive letter, or path.isAbsolute)
    if (
      rawPath.startsWith('/') ||
      rawPath.startsWith('\\') ||
      /^[a-zA-Z]:/.test(rawPath) ||
      path.isAbsolute(rawPath)
    ) {
      errors.push(`${prefix}: absolute paths are not allowed ('${file.path}')`);
    }

    const normalized = normalizeChangePath(rawPath);

    // Check for .. traversal
    const segments = normalized.split('/');
    if (segments.includes('..') || rawPath.includes('..')) {
      errors.push(`${prefix}: path traversal '..' is not allowed ('${file.path}')`);
    }

    // Check for .git/ protection
    if (segments[0] === '.git') {
      errors.push(`${prefix}: modifying '.git/' paths is forbidden ('${file.path}')`);
    }

    // Check kind
    if (!['add', 'modify', 'delete', 'create'].includes(file.kind)) {
      errors.push(`${prefix}: invalid kind '${file.kind}', must be add, modify, delete, or create`);
    }

    // Validate SHA hashes if provided
    if (file.before && !shaRegex.test(file.before)) {
      errors.push(`${prefix}: 'before' must be a valid 64-character SHA-256 hash`);
    }
    if (file.after && !shaRegex.test(file.after)) {
      errors.push(`${prefix}: 'after' must be a valid 64-character SHA-256 hash`);
    }

    // Validate consistency
    if (file.kind === 'add' && file.before) {
      errors.push(`${prefix}: 'before' hash should not be provided for added file`);
    }
    if (file.kind === 'delete' && file.after) {
      errors.push(`${prefix}: 'after' hash should not be provided for deleted file`);
    }

    if (typeof file.diff !== 'string') {
      errors.push(`${prefix}: 'diff' must be a string`);
    }
  }

  return errors;
}
