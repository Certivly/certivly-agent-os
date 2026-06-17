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

  /**
   * Resolves a path against the workspace root and ensures it remains within the workspace.
   * Throws an error if the path attempts to escape the workspace.
   */
  resolvePath(targetPath: string): string {
    const resolvedPath = path.resolve(this.workspaceRoot, targetPath);
    
    // Ensure the resolved path starts with the workspace root directory
    // Add trailing separator to prevent partial match like /workspace-foo matching /workspace
    const rootWithSep = this.workspaceRoot.endsWith(path.sep) 
      ? this.workspaceRoot 
      : this.workspaceRoot + path.sep;
      
    // Handle exact root match or subdirectories
    if (resolvedPath !== this.workspaceRoot && !resolvedPath.startsWith(rootWithSep)) {
      throw new Error(`Security Violation: Path '${targetPath}' is outside the workspace root '${this.workspaceRoot}'`);
    }

    return resolvedPath;
  }

  /**
   * Checks if a resolved path is within the workspace.
   */
  isWithinWorkspace(resolvedPath: string): boolean {
    const rootWithSep = this.workspaceRoot.endsWith(path.sep) 
      ? this.workspaceRoot 
      : this.workspaceRoot + path.sep;
      
    return resolvedPath === this.workspaceRoot || resolvedPath.startsWith(rootWithSep);
  }
}

export const workspaceManager = new WorkspaceManager();
