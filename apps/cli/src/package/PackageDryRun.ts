import * as path from 'path';
import * as fs from 'fs';

export interface PackageManifestCheck {
  binaryExists: boolean;
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
