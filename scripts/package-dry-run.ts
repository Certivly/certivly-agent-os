import { PackageDryRun } from '../apps/cli/src/package/PackageDryRun';

const check = PackageDryRun.checkPackage(process.cwd());
console.log(PackageDryRun.formatReport(check));

if (!check.allValid) {
  process.exit(1);
}
