import * as path from 'path';
import * as fs from 'fs';

export class WorkspaceManager {
  private workspaceRoot: string;

  constructor(workspaceRoot?: string) {
    this.workspaceRoot = path.resolve(workspaceRoot || process.cwd());
  }

  get root(): string {
    return this.workspaceRoot;
  }

  getRoot(): string {
    return this.workspaceRoot;
  }

  /**
   * Resolves a path against the workspace root and ensures it remains within the workspace.
   * Throws an error if the path attempts to escape the workspace or access forbidden paths.
   */
  resolvePath(targetPath: string): string {
    if (!targetPath || typeof targetPath !== 'string') {
      throw new Error('Security Violation: Invalid empty or non-string path');
    }

    // Reject null byte injection
    if (targetPath.includes('\0')) {
      throw new Error('Security Violation: Null bytes are not permitted in file paths');
    }

    const trimmed = targetPath.trim();
    if (!trimmed) {
      throw new Error('Security Violation: Whitespace-only path is not permitted');
    }

    // Reject URL-like paths (e.g. file://, http://, ftp://)
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)) {
      throw new Error(`Security Violation: URL-like path '${targetPath}' is forbidden`);
    }

    // Reject UNC and device paths (e.g. \\server\share, //server/share, \\?\C:\)
    if (trimmed.startsWith('\\\\') || trimmed.startsWith('//') || trimmed.startsWith('\\\\?\\')) {
      throw new Error(`Security Violation: UNC or device path '${targetPath}' is forbidden`);
    }

    const resolvedPath = path.resolve(this.workspaceRoot, trimmed);

    // Normalize separators for case-insensitive and slash-agnostic comparison
    const normRoot = path.normalize(this.workspaceRoot).toLowerCase();
    const normResolved = path.normalize(resolvedPath).toLowerCase();

    const rootWithSep = normRoot.endsWith(path.sep) ? normRoot : normRoot + path.sep;

    // Must be either exact workspace root or inside the workspace root
    if (normResolved !== normRoot && !normResolved.startsWith(rootWithSep)) {
      throw new Error(
        `Security Violation: Path '${targetPath}' is outside the workspace root '${this.workspaceRoot}'`
      );
    }

    // Reject access to .git directory and subpaths
    const rel = path.relative(this.workspaceRoot, resolvedPath);
    const normalizedRel = rel.replace(/\\/g, '/');
    if (
      normalizedRel === '.git' ||
      normalizedRel.startsWith('.git/') ||
      /(?:^|\/)\.git(?:\/|$)/.test(normalizedRel)
    ) {
      throw new Error(`Security Violation: Access to .git directory is forbidden: '${targetPath}'`);
    }

    return resolvedPath;
  }

  /**
   * Checks if a resolved path is within the workspace and not in forbidden locations.
   */
  isWithinWorkspace(resolvedPath: string): boolean {
    if (!resolvedPath || typeof resolvedPath !== 'string') return false;
    if (resolvedPath.includes('\0')) return false;

    const trimmed = resolvedPath.trim();
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)) return false;
    if (trimmed.startsWith('\\\\') || trimmed.startsWith('//') || trimmed.startsWith('\\\\?\\')) return false;

    const normRoot = path.normalize(this.workspaceRoot).toLowerCase();
    const normResolved = path.normalize(resolvedPath).toLowerCase();
    const rootWithSep = normRoot.endsWith(path.sep) ? normRoot : normRoot + path.sep;

    const inBounds = normResolved === normRoot || normResolved.startsWith(rootWithSep);
    if (!inBounds) return false;

    const rel = path.relative(this.workspaceRoot, resolvedPath);
    const normalizedRel = rel.replace(/\\/g, '/');
    if (
      normalizedRel === '.git' ||
      normalizedRel.startsWith('.git/') ||
      /(?:^|\/)\.git(?:\/|$)/.test(normalizedRel)
    ) {
      return false;
    }

    return true;
  }

  /**
   * Resolves the real path (evaluating symlinks) and ensures it remains within the workspace.
   */
  resolveReal(targetPath: string): string {
    const resolvedPath = this.resolvePath(targetPath);
    if (fs.existsSync(resolvedPath)) {
      const real = fs.realpathSync(resolvedPath);
      if (!this.isWithinWorkspace(real)) {
        throw new Error(
          `Security Violation: Path '${targetPath}' resolves outside the workspace via symlink '${real}'`
        );
      }
      return real;
    }
    return resolvedPath;
  }
}

export const workspaceManager = new WorkspaceManager();
