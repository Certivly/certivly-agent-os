import { contextBridge, ipcRenderer } from 'electron';
import type { AgentOSElectronAPI, DirectoryPickerOptions, FilePickerOptions } from './types';

const api: AgentOSElectronAPI = {
  getServerUrl: () => ipcRenderer.invoke('desktop:get-server-url'),
  getServerInfo: () => ipcRenderer.invoke('desktop:get-server-info'),
  selectDirectory: (opts?: DirectoryPickerOptions) =>
    ipcRenderer.invoke('desktop:select-directory', opts),
  selectFile: (opts?: FilePickerOptions) =>
    ipcRenderer.invoke('desktop:select-file', opts),
  openExternal: (url: string) =>
    ipcRenderer.invoke('desktop:open-external', url),
  windowMinimize: () => ipcRenderer.send('desktop:window-minimize'),
  windowMaximize: () => ipcRenderer.send('desktop:window-maximize'),
  windowClose: () => ipcRenderer.send('desktop:window-close'),
  isMaximized: () => ipcRenderer.invoke('desktop:is-maximized'),
  getPlatform: () => process.platform,
  getVersion: () => '1.0.0',
  onMenuAction: (callback: (action: string) => void) => {
    const handler = (_event: any, action: string) => callback(action);
    ipcRenderer.on('desktop:menu-action', handler);
    return () => {
      ipcRenderer.removeListener('desktop:menu-action', handler);
    };
  },
};

contextBridge.exposeInMainWorld('agentos', api);
