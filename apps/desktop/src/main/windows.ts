import * as path from 'path';
import { BrowserWindow, app } from 'electron';

export interface WindowOptions {
  serverUrl: string;
  preloadPath?: string;
  width?: number;
  height?: number;
}

export function createMainWindow(options: WindowOptions): BrowserWindow {
  const isMac = process.platform === 'darwin';
  const isWin = process.platform === 'win32';

  const defaultPreload = path.join(__dirname, '../preload/index.js');
  const preload = options.preloadPath || defaultPreload;

  const win = new BrowserWindow({
    width: options.width || 1400,
    height: options.height || 900,
    minWidth: 1000,
    minHeight: 650,
    show: false,
    backgroundColor: '#0b0f19',
    title: 'AgentOS Desktop',
    ...(isWin
      ? {
          frame: false,
          titleBarStyle: 'hidden',
          titleBarOverlay: {
            color: '#0b0f19',
            symbolColor: '#94a3b8',
            height: 38,
          },
        }
      : {}),
    ...(isMac
      ? {
          titleBarStyle: 'hiddenInset',
          trafficLightPosition: { x: 14, y: 12 },
        }
      : {}),
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      const { shell } = require('electron');
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  win.once('ready-to-show', () => {
    win.show();
  });

  return win;
}
