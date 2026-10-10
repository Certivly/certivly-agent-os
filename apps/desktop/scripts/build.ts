import * as fs from 'fs';
import * as path from 'path';

const desktopDir = path.resolve(__dirname, '..');
const distDir = path.join(desktopDir, 'dist');
const distRenderer = path.join(distDir, 'renderer');
const distPreload = path.join(distDir, 'preload');
const distMain = path.join(distDir, 'main');

fs.mkdirSync(distRenderer, { recursive: true });
fs.mkdirSync(distPreload, { recursive: true });
fs.mkdirSync(distMain, { recursive: true });

console.log('[AgentOS Desktop] Building React Renderer...');
const rendererResult = await Bun.build({
  entrypoints: [path.join(desktopDir, 'src/renderer/main.tsx')],
  outdir: distRenderer,
  target: 'browser',
  minify: false,
});

if (!rendererResult.success) {
  console.error('Renderer build failed:', rendererResult.logs);
  process.exit(1);
}

// Copy index.html into dist/renderer
fs.copyFileSync(
  path.join(desktopDir, 'src/renderer/index.html'),
  path.join(distRenderer, 'index.html')
);

console.log('[AgentOS Desktop] Building Electron Preload...');
const preloadResult = await Bun.build({
  entrypoints: [path.join(desktopDir, 'src/preload/index.ts')],
  outdir: distPreload,
  target: 'node',
  external: ['electron'],
});

if (!preloadResult.success) {
  console.error('Preload build failed:', preloadResult.logs);
  process.exit(1);
}

console.log('[AgentOS Desktop] Building Electron Main...');
const mainResult = await Bun.build({
  entrypoints: [path.join(desktopDir, 'src/main/index.ts')],
  outdir: distMain,
  target: 'node',
  external: ['electron'],
});

if (!mainResult.success) {
  console.error('Main build failed:', mainResult.logs);
  process.exit(1);
}

console.log('✓ AgentOS Desktop build complete!');
