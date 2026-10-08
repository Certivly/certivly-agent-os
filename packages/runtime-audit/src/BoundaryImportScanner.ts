import * as fs from 'fs';
import * as path from 'path';

export interface BoundaryViolation {
  file: string;
  relativeFile: string;
  line: number;
  importPath: string;
  type: 'relative-cross-package' | 'deep-package-import';
  message: string;
}

export class BoundaryImportScanner {
  constructor(private workspaceRoot: string) {}

  public async scanImports(): Promise<BoundaryViolation[]> {
    const violations: BoundaryViolation[] = [];
    const roots = [
      path.join(this.workspaceRoot, 'packages'),
      path.join(this.workspaceRoot, 'apps'),
    ];

    for (const root of roots) {
      if (!fs.existsSync(root)) continue;
      const packageDirs = fs.readdirSync(root, { withFileTypes: true });

      for (const pkgDir of packageDirs) {
        if (!pkgDir.isDirectory()) continue;
        const packagePath = path.join(root, pkgDir.name);
        const srcDir = path.join(packagePath, 'src');
        if (!fs.existsSync(srcDir)) continue;

        await this.scanDirectory(srcDir, packagePath, violations);
      }
    }

    return violations;
  }

  private async scanDirectory(
    dir: string,
    packagePath: string,
    violations: BoundaryViolation[]
  ): Promise<void> {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await this.scanDirectory(fullPath, packagePath, violations);
      } else if (/\.(ts|tsx|js|mjs)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
        this.scanFile(fullPath, packagePath, violations);
      }
    }
  }

  public scanFile(
    filePath: string,
    packagePath: string,
    violations: BoundaryViolation[]
  ): void {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const relFile = path.relative(this.workspaceRoot, filePath);

    // Regex to match import / require / export from statements
    // 1. Deep package import: @agent-os/<pkg>/src/...
    const deepImportRegex = /['"](@agent-os\/[a-zA-Z0-9_-]+\/src(?:\/[^'"]*)?)['"]/;

    // 2. Relative cross-package import
    const relativeImportRegex = /(?:from\s+|import\s*\(\s*|require\s*\(\s*)['"](\.\.[^'"]+)['"]/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      const deepMatch = line.match(deepImportRegex);
      if (deepMatch) {
        violations.push({
          file: filePath,
          relativeFile: relFile,
          line: i + 1,
          importPath: deepMatch[1],
          type: 'deep-package-import',
          message: `Deep package import forbidden: '${deepMatch[1]}'. Import from package root instead.`,
        });
      }

      const relMatch = line.match(relativeImportRegex);
      if (relMatch) {
        const importSpec = relMatch[1];
        const resolvedPath = path.resolve(path.dirname(filePath), importSpec);
        const relToPkg = path.relative(packagePath, resolvedPath);

        // If the relative path escapes the package root (starts with ..), it's a cross-package boundary violation
        if (relToPkg.startsWith('..') || importSpec.includes('/packages/') || importSpec.includes('/apps/')) {
          violations.push({
            file: filePath,
            relativeFile: relFile,
            line: i + 1,
            importPath: importSpec,
            type: 'relative-cross-package',
            message: `Relative cross-package import forbidden: '${importSpec}'. Use package name instead.`,
          });
        }
      }
    }
  }
}
