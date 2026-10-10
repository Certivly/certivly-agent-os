import * as path from 'path';
import { app, BrowserWindow } from 'electron';
import { DesktopServer } from '../server/DesktopServer';
import { registerIpcHandlers } from './ipc';
import { createApplicationMenu } from './menu';
import { createMainWindow } from './windows';

let mainWindow: BrowserWindow | null = null;
let server: DesktopServer | null = null;
let serverUrl = '';

async function bootstrap() {
  const port = parseInt(process.env.AGENTOS_DESKTOP_PORT || '3456', 10);
  const host = process.env.AGENTOS_DESKTOP_HOST || '127.0.0.1';
  const workspaceRoot = process.env.AGENTOS_WORKSPACE_ROOT || process.cwd();

  // 1. Initialize and start the AgentOS Desktop Server sidecar
  server = new DesktopServer({
    port,
    host,
    workspaceRoot,
    openBrowser: false,
  });

  serverUrl = await server.start();
  console.log(`[AgentOS Electron] Sidecar server ready at ${serverUrl}`);

  // 2. Register IPC handlers for renderer communication
  registerIpcHandlers({
    getServerUrl: () => serverUrl,
    getServer: () => server!,
    getMainWindow: () => mainWindow,
  });

  // 3. Setup Native Application Menu
  createApplicationMenu(() => mainWindow);

  // 4. Create the main Cyber-Luxe frameless window
  mainWindow = createMainWindow({
    serverUrl,
  });

  // 5. Load the application
  await mainWindow.loadURL(serverUrl);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  try {
    await bootstrap();
  } catch (err: any) {
    console.error('[AgentOS Electron] Failed to bootstrap:', err);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0 && serverUrl) {
    mainWindow = createMainWindow({ serverUrl });
    mainWindow.loadURL(serverUrl);
  }
});

app.on('before-quit', async () => {
  if (server) {
    try {
      await server.stop();
    } catch (_err) {
      void _err;
    }
  }
});
