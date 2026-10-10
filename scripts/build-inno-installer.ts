import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { execSync } from 'child_process';

const rootDir = path.resolve(__dirname, '..');
const installerDir = path.join(rootDir, 'installer');
const issFile = path.join(installerDir, 'agentos.iss');
const outDir = path.join(rootDir, 'dist-installer');
const binExe = path.join(rootDir, 'bin', 'agentos.exe');
const desktopDist = path.join(rootDir, 'apps', 'desktop', 'dist');

console.log('======================================================');
console.log(' 💎 AgentOS Inno Setup Compiler');
console.log('======================================================\n');

// 1. Ensure required binaries and bundles exist
if (!fs.existsSync(binExe)) {
  console.log('[1/4] Standalone binary bin/agentos.exe not found, building...');
  execSync('bun run scripts/build-binaries.ts', { cwd: rootDir, stdio: 'inherit' });
} else {
  console.log('[1/4] Standalone binary bin/agentos.exe present.');
}

if (!fs.existsSync(desktopDist)) {
  console.log('[2/4] Desktop distribution apps/desktop/dist not found, building...');
  execSync('bun run desktop:build', { cwd: rootDir, stdio: 'inherit' });
} else {
  console.log('[2/4] Desktop distribution apps/desktop/dist present.');
}

// Ensure dist-installer directory exists
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

// 2. Locate Inno Setup Compiler (ISCC.exe)
console.log('[3/4] Locating Inno Setup Compiler (ISCC.exe)...');

function findIscc(): string | null {
  const candidates = [
    process.env.ISCC_PATH,
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Inno Setup 6', 'ISCC.exe'),
    path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Inno Setup 6', 'ISCC.exe'),
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Inno Setup 6', 'ISCC.exe'),
    'ISCC.exe',
  ].filter(Boolean) as string[];

  for (const c of candidates) {
    if (fs.existsSync(c)) {
      return c;
    }
  }

  try {
    const which = execSync('where ISCC.exe', { encoding: 'utf-8' }).trim().split('\n')[0];
    if (which && fs.existsSync(which)) return which;
  } catch {
    // Not in PATH
  }

  return null;
}

const isccPath = findIscc();
if (!isccPath) {
  console.error('✗ Inno Setup Compiler (ISCC.exe) not found on system.');
  console.error('Please install Inno Setup 6 via:');
  console.error('  winget install --id JRSoftware.InnoSetup -e');
  process.exit(1);
}

console.log(`✓ Located Inno Setup compiler: ${isccPath}\n`);

// 3. Compile installer script
console.log('[4/4] Compiling installer with ISCC.exe...');
const compileStart = Date.now();

try {
  execSync(`"${isccPath}" "${issFile}"`, {
    cwd: installerDir,
    stdio: 'inherit',
  });
  const duration = ((Date.now() - compileStart) / 1000).toFixed(2);
  console.log(`\n✓ Inno Setup compilation completed in ${duration}s`);
} catch (err: any) {
  console.error(`✗ Inno Setup compilation failed: ${err.message}`);
  process.exit(1);
}

// 4. Verify generated installer output
const expectedInstaller = path.join(outDir, 'AgentOS-Setup-1.0.0.exe');
if (!fs.existsSync(expectedInstaller)) {
  console.error(`✗ Expected output installer not found: ${expectedInstaller}`);
  process.exit(1);
}

const stats = fs.statSync(expectedInstaller);
const mb = (stats.size / (1024 * 1024)).toFixed(2);

// Generate SHA-256 Checksum
const content = fs.readFileSync(expectedInstaller);
const sha256 = crypto.createHash('sha256').update(content).digest('hex');
fs.writeFileSync(expectedInstaller + '.sha256', `${sha256}  AgentOS-Setup-1.0.0.exe\n`, 'utf-8');

console.log('\n======================================================');
console.log(' 🎉 AgentOS Windows GUI Setup Wizard Ready!');
console.log(` 📦 Installer: ${expectedInstaller} (${mb} MB)`);
console.log(` 🔑 SHA-256:   ${sha256}`);
console.log('======================================================\n');
