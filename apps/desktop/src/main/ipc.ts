import { ipcMain, dialog, shell, BrowserWindow } from 'electron';
import type { DesktopServer } from '../server/DesktopServer';

export interface IpcDeps {
  getServerUrl: () => string;
  getServer: () => DesktopServer;
  getMainWindow: () => BrowserWindow | null;
}

export function registerIpcHandlers(deps: IpcDeps): void {
  ipcMain.handle('desktop:get-server-url', () => {
    return deps.getServerUrl();
  });

  ipcMain.handle('desktop:get-server-info', () => {
    const server = deps.getServer();
    return {
      url: deps.getServerUrl(),
      port: server.getPort(),
      host: server.getHost(),
      status: 'ready',
      workspaceRoot: server.getWorkspaceRoot(),
    };
  });

  ipcMain.handle('desktop:select-directory', async (_event, opts?: { title?: string; defaultPath?: string }) => {
    const win = BrowserWindow.fromWebContents(_event.sender) || deps.getMainWindow();
    const result = await dialog.showOpenDialog(win || undefined as any, {
      title: opts?.title || 'Open Workspace Directory',
      defaultPath: opts?.defaultPath,
      properties: ['openDirectory', 'createDirectory'],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });

  ipcMain.handle('desktop:select-file', async (_event, opts?: { title?: string; defaultPath?: string; filters?: any[] }) => {
    const win = BrowserWindow.fromWebContents(_event.sender) || deps.getMainWindow();
    const result = await dialog.showOpenDialog(win || undefined as any, {
      title: opts?.title || 'Select File',
      defaultPath: opts?.defaultPath,
      filters: opts?.filters,
      properties: ['openFile'],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });

  ipcMain.handle('desktop:open-external', async (_event, url: string) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      await shell.openExternal(url);
    }
  });

  ipcMain.on('desktop:window-minimize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.minimize();
  });

  ipcMain.on('desktop:window-maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
      if (win.isMaximized()) {
        win.unmaximize();
      } else {
        win.maximize();
      }
    }
  });

  ipcMain.on('desktop:window-close', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.close();
  });

  ipcMain.handle('desktop:is-maximized', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return win ? win.isMaximized() : false;
  });
}
