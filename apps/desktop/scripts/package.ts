import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';

const desktopDir = path.resolve(__dirname, '..');
const distDir = path.join(desktopDir, 'dist');

console.log('======================================================');
console.log(' 📦 AgentOS Desktop App Packager');
console.log('======================================================\n');

// 1. Build the production React & Electron bundles
console.log('[1/3] Building production assets (React 19 + Electron)...');
execSync('bun run build', { cwd: desktopDir, stdio: 'inherit' });

// 2. Validate built distribution
console.log('[2/3] Validating dist output...');
const requiredFiles = [
  'main/index.js',
  'preload/index.js',
  'renderer/index.html',
  'renderer/main.js',
];

for (const rel of requiredFiles) {
  const full = path.join(distDir, rel);
  if (!fs.existsSync(full)) {
    console.error(`✗ Missing required build artifact: ${rel}`);
    process.exit(1);
  }
}
console.log('✓ All desktop build artifacts verified.\n');

// 3. Run electron-builder packaging
console.log('[3/3] Packaging desktop distribution with electron-builder...');
const mode = process.argv.includes('--portable') ? '--win portable' : '--dir';

try {
  execSync(`bunx electron-builder --config electron-builder.json ${mode}`, {
    cwd: desktopDir,
    stdio: 'inherit',
  });
  console.log('\n✓ AgentOS Desktop package created in apps/desktop/release/');
} catch (err: any) {
  console.warn(`! Note on builder: ${err.message}`);
}
