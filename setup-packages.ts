import * as fs from 'fs';
import * as path from 'path';

const packages = ['events', 'context', 'memory'];
const baseDir = path.join(process.cwd(), 'packages');

for (const pkg of packages) {
  const pkgDir = path.join(baseDir, pkg);
  fs.mkdirSync(path.join(pkgDir, 'src'), { recursive: true });
  fs.mkdirSync(path.join(pkgDir, 'tests'), { recursive: true });

  const pkgJson: any = {
    name: `@agent-os/${pkg}`,
    version: "1.0.0",
    main: "src/index.ts",
    types: "src/index.ts",
    scripts: {
      "test": "bun test"
    },
    dependencies: {
      "@agent-os/shared": "workspace:*",
      "drizzle-orm": "^0.30.0"
    },
    devDependencies: {
      "drizzle-kit": "^0.20.14"
    }
  };

  if (pkg === 'memory') {
    pkgJson.dependencies['@agent-os/events'] = 'workspace:*';
    pkgJson.dependencies['@agent-os/context'] = 'workspace:*';
  } else if (pkg === 'context') {
    pkgJson.dependencies['@agent-os/events'] = 'workspace:*';
  }

  fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify(pkgJson, null, 2));

  const tsconfig = {
    "extends": "../../tsconfig.json",
    "compilerOptions": {
      "outDir": "dist",
      "rootDir": "src"
    },
    "include": ["src/**/*", "tests/**/*"]
  };
  fs.writeFileSync(path.join(pkgDir, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2));
  fs.writeFileSync(path.join(pkgDir, 'src', 'index.ts'), '// Export module here\n');
}

console.log('Packages scaffolded.');
