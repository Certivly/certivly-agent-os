import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { execSync } from 'child_process';

const rootDir = path.resolve(__dirname, '..');
const binDir = path.join(rootDir, 'bin');
const cliEntry = path.join(rootDir, 'apps', 'cli', 'src', 'index.ts');

console.log('======================================================');
console.log(' 🛠️  AgentOS Binary Compiler & Packager');
console.log('======================================================\n');

// 1. Ensure bin/ directory exists
if (!fs.existsSync(binDir)) {
  fs.mkdirSync(binDir, { recursive: true });
}

// 2. Determine native binary name based on platform
const isWindows = process.platform === 'win32';
const exeName = isWindows ? 'agentos.exe' : 'agentos';
const targetExePath = path.join(binDir, exeName);

console.log(`[1/5] Compiling standalone native CLI binary: ${exeName}...`);
const compileStart = Date.now();

try {
  execSync(`bun build --compile "${cliEntry}" --outfile "${targetExePath}"`, {
    cwd: rootDir,
    stdio: 'inherit',
  });
  const duration = ((Date.now() - compileStart) / 1000).toFixed(2);
  const stats = fs.statSync(targetExePath);
  const mb = (stats.size / (1024 * 1024)).toFixed(2);
  console.log(`✓ Compiled ${exeName} in ${duration}s (${mb} MB)\n`);
} catch (err: any) {
  console.error(`✗ Compilation failed: ${err.message}`);
  process.exit(1);
}

// 3. Generate Shell & Batch Wrappers for cross-platform convenience
console.log('[2/5] Creating environment wrappers in bin/...');

// Windows CMD wrapper
const cmdContent = `@echo off
setlocal
set "BIN_DIR=%~dp0"
if exist "%BIN_DIR%\\agentos.exe" (
  "%BIN_DIR%\\agentos.exe" %*
) else (
  bun run "%BIN_DIR%\\..\\apps\\cli\\src\\index.ts" %*
)
`;
fs.writeFileSync(path.join(binDir, 'agentos.cmd'), cmdContent, 'utf-8');

// Windows PowerShell wrapper
const ps1Content = `$BinDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$ExePath = Join-Path $BinDir "agentos.exe"
if (Test-Path $ExePath) {
  & $ExePath $args
} else {
  bun run (Join-Path $BinDir "..\\apps\\cli\\src\\index.ts") $args
}
`;
fs.writeFileSync(path.join(binDir, 'agentos.ps1'), ps1Content, 'utf-8');

// POSIX Shell wrapper
const shContent = `#!/usr/bin/env bash
BIN_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$BIN_DIR/agentos" ] && [ -x "$BIN_DIR/agentos" ]; then
  exec "$BIN_DIR/agentos" "$@"
elif [ -f "$BIN_DIR/agentos.exe" ]; then
  exec "$BIN_DIR/agentos.exe" "$@"
else
  exec bun run "$BIN_DIR/../apps/cli/src/index.ts" "$@"
fi
`;
fs.writeFileSync(path.join(binDir, 'agentos'), shContent, { encoding: 'utf-8', mode: 0o755 });

console.log('✓ Created agentos.cmd, agentos.ps1, and agentos wrappers\n');

// 4. Verification Check: Execute compiled binary
console.log('[3/5] Verifying binary functionality...');
try {
  const versionOutput = execSync(`"${targetExePath}" --version`, { encoding: 'utf-8' }).trim();
  console.log(`✓ agentos --version output: ${versionOutput}`);

  const helpOutput = execSync(`"${targetExePath}" --help`, { encoding: 'utf-8' });
  if (helpOutput.includes('AgentOS Power CLI')) {
    console.log('✓ agentos --help output verified\n');
  } else {
    throw new Error('Help output did not contain expected AgentOS banner');
  }
} catch (err: any) {
  console.error(`✗ Binary verification check failed: ${err.message}`);
  process.exit(1);
}

// 5. Compute SHA-256 Checksums
console.log('[4/5] Generating cryptographic SHA-256 checksums...');
const checksums: string[] = [];

for (const file of fs.readdirSync(binDir)) {
  if (file === 'checksums.txt') continue;
  const filePath = path.join(binDir, file);
  if (!fs.statSync(filePath).isFile()) continue;

  const content = fs.readFileSync(filePath);
  const hash = crypto.createHash('sha256').update(content).digest('hex');
  checksums.push(`${hash}  ${file}`);
}

const checksumFile = path.join(binDir, 'checksums.txt');
fs.writeFileSync(checksumFile, checksums.join('\n') + '\n', 'utf-8');
console.log(`✓ Wrote ${checksums.length} checksums to bin/checksums.txt\n`);

console.log('[5/5] Standalone binary package ready at ./bin/');
console.log('======================================================');
console.log(` 🚀 Executable: ${targetExePath}`);
console.log('======================================================\n');
