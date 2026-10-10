export interface FileFilter {
  name: string;
  extensions: string[];
}

export interface DirectoryPickerOptions {
  title?: string;
  defaultPath?: string;
}

export interface FilePickerOptions {
  title?: string;
  defaultPath?: string;
  filters?: FileFilter[];
}

export interface ServerInfo {
  url: string;
  port: number;
  host: string;
  status: string;
  workspaceRoot: string;
}

export interface AgentOSElectronAPI {
  getServerUrl: () => Promise<string>;
  getServerInfo: () => Promise<ServerInfo>;
  selectDirectory: (opts?: DirectoryPickerOptions) => Promise<string | null>;
  selectFile: (opts?: FilePickerOptions) => Promise<string | null>;
  openExternal: (url: string) => Promise<void>;
  windowMinimize: () => void;
  windowMaximize: () => void;
  windowClose: () => void;
  isMaximized: () => Promise<boolean>;
  getPlatform: () => string;
  getVersion: () => string;
  onMenuAction: (callback: (action: string) => void) => () => void;
}

declare global {
  interface Window {
    agentos?: AgentOSElectronAPI;
  }
}
