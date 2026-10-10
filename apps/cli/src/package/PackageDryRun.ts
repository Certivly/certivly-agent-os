import * as path from 'path';
import * as fs from 'fs';

export interface PackageManifestCheck {
  binaryExists: boolean;
  standaloneBinExists: boolean;
  installersExist: boolean;
  desktopConfigExists: boolean;
  configSchemaExists: boolean;
  smokeTasksExist: boolean;
  docsExist: boolean;
  changelogExists: boolean;
  allValid: boolean;
  missing: string[];
}

export class PackageDryRun {
  public static checkPackage(
    workspaceRoot: string = process.cwd(),
    overrides?: Partial<Record<string, boolean>>
  ): PackageManifestCheck {
    const missing: string[] = [];

    const distBin = path.join(workspaceRoot, 'apps', 'cli', 'dist', 'index.js');
    const binaryExists = overrides?.binaryExists ?? fs.existsSync(distBin);
    if (!binaryExists) missing.push('Built binary (apps/cli/dist/index.js)');

    const isWindows = process.platform === 'win32';
    const standaloneExe = path.join(workspaceRoot, 'bin', isWindows ? 'agentos.exe' : 'agentos');
    const standaloneBinExists = overrides?.standaloneBinExists ?? fs.existsSync(standaloneExe);
    if (!standaloneBinExists) missing.push('Standalone native binary (bin/agentos.exe)');

    const ps1Installer = path.join(workspaceRoot, 'install.ps1');
    const shInstaller = path.join(workspaceRoot, 'install.sh');
    const installersExist = overrides?.installersExist ?? (fs.existsSync(ps1Installer) && fs.existsSync(shInstaller));
    if (!installersExist) missing.push('Cross-platform installers (install.ps1, install.sh)');

    const desktopConfig = path.join(workspaceRoot, 'apps', 'desktop', 'electron-builder.json');
    const desktopConfigExists = overrides?.desktopConfigExists ?? fs.existsSync(desktopConfig);
    if (!desktopConfigExists) missing.push('Desktop electron-builder config (apps/desktop/electron-builder.json)');

    const configSchema = path.join(workspaceRoot, 'packages', 'config', 'src', 'schema.ts');
    const configSchemaExists = overrides?.configSchemaExists ?? fs.existsSync(configSchema);
    if (!configSchemaExists) missing.push('Config schema (packages/config/src/schema.ts)');

    const smokeTask = path.join(workspaceRoot, 'evals', 'tasks', 'ts-off-by-one', 'prompt.md');
    const smokeTasksExist = overrides?.smokeTasksExist ?? fs.existsSync(smokeTask);
    if (!smokeTasksExist) missing.push('Smoke eval tasks (evals/tasks)');

    const readme = path.join(workspaceRoot, 'README.md');
    const docsExist = overrides?.docsExist ?? fs.existsSync(readme);
    if (!docsExist) missing.push('Documentation (README.md)');

    const changelog = path.join(workspaceRoot, 'CHANGELOG.md');
    const changelogExists = overrides?.changelogExists ?? fs.existsSync(changelog);
    if (!changelogExists) missing.push('Changelog (CHANGELOG.md)');

    const allValid = missing.length === 0;

    return {
      binaryExists,
      standaloneBinExists,
      installersExist,
      desktopConfigExists,
      configSchemaExists,
      smokeTasksExist,
      docsExist,
      changelogExists,
      allValid,
      missing,
    };
  }

  public static formatReport(check: PackageManifestCheck): string {
    const lines: string[] = [];
    lines.push('# Package Release Dry Run Report');
    lines.push('');
    lines.push(`- **Status**: ${check.allValid ? '✓ PASS' : '✗ FAIL'}`);
    lines.push('');
    lines.push('| Asset | Status |');
    lines.push('| --- | --- |');
    lines.push(`| CLI Executable (apps/cli/dist/index.js) | ${check.binaryExists ? '✓ PRESENT' : '✗ MISSING'} |`);
    lines.push(`| Native Standalone Binary (bin/agentos) | ${check.standaloneBinExists ? '✓ PRESENT' : '✗ MISSING'} |`);
    lines.push(`| Cross-Platform Installers (install.ps1 / .sh) | ${check.installersExist ? '✓ PRESENT' : '✗ MISSING'} |`);
    lines.push(`| Desktop Installer Config (electron-builder.json) | ${check.desktopConfigExists ? '✓ PRESENT' : '✗ MISSING'} |`);
    lines.push(`| Default Config Schema | ${check.configSchemaExists ? '✓ PRESENT' : '✗ MISSING'} |`);
    lines.push(`| Smoke Evaluation Tasks | ${check.smokeTasksExist ? '✓ PRESENT' : '✗ MISSING'} |`);
    lines.push(`| Documentation (README.md) | ${check.docsExist ? '✓ PRESENT' : '✗ MISSING'} |`);
    lines.push(`| Release Changelog (CHANGELOG.md) | ${check.changelogExists ? '✓ PRESENT' : '✗ MISSING'} |`);
    lines.push('');

    if (!check.allValid) {
      lines.push('### Missing Required Assets:');
      for (const m of check.missing) {
        lines.push(`- ${m}`);
      }
    } else {
      lines.push('All required distribution assets are verified.');
    }

    return lines.join('\n');
  }
}
