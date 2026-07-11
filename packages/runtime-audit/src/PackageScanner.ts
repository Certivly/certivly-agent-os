import * as fs from 'fs';
import * as path from 'path';

export interface ScannedPackage {
  dirName: string;
  absolutePath: string;
  name: string;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
}

export class PackageScanner {
  constructor(private workspaceRoot: string) {}

  public async scanPackages(): Promise<ScannedPackage[]> {
    const packagesDir = path.join(this.workspaceRoot, 'packages');
    const appsDir = path.join(this.workspaceRoot, 'apps');
    
    const packages: ScannedPackage[] = [];

    const scanDir = async (dir: string) => {
      if (!fs.existsSync(dir)) return;
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const packageJsonPath = path.join(dir, entry.name, 'package.json');
          if (fs.existsSync(packageJsonPath)) {
            const content = await fs.promises.readFile(packageJsonPath, 'utf8');
            try {
              const parsed = JSON.parse(content);
              packages.push({
                dirName: entry.name,
                absolutePath: path.join(dir, entry.name),
                name: parsed.name || entry.name,
                dependencies: parsed.dependencies || {},
                devDependencies: parsed.devDependencies || {}
              });
            } catch (e) {
              console.error(`Failed to parse ${packageJsonPath}`);
            }
          }
        }
      }
    };

    await scanDir(packagesDir);
    await scanDir(appsDir);

    return packages;
  }
}
