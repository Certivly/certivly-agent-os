import { app, Menu, MenuItemConstructorOptions, BrowserWindow } from 'electron';

export function createApplicationMenu(getMainWindow: () => BrowserWindow | null): Menu {
  const isMac = process.platform === 'darwin';

  const sendAction = (action: string) => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('desktop:menu-action', action);
    }
  };

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? ([
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              {
                label: 'Preferences / Key Vault...',
                accelerator: 'CmdOrCtrl+,',
                click: () => sendAction('open-key-vault'),
              },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          },
        ] as MenuItemConstructorOptions[])
      : []),
    {
      label: '&File',
      submenu: [
        {
          label: 'New Session',
          accelerator: 'CmdOrCtrl+N',
          click: () => sendAction('new-session'),
        },
        {
          label: 'Open Workspace Directory...',
          accelerator: 'CmdOrCtrl+O',
          click: () => sendAction('open-directory'),
        },
        { type: 'separator' },
        {
          label: 'Key Vault & Providers...',
          accelerator: 'CmdOrCtrl+,',
          click: () => sendAction('open-key-vault'),
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: '&Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: '&View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        {
          label: 'Toggle Developer Tools',
          accelerator: isMac ? 'Alt+Command+I' : 'Ctrl+Shift+I',
          click: () => {
            const win = getMainWindow();
            if (win && !win.isDestroyed()) {
              win.webContents.toggleDevTools();
            }
          },
        },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: '&Agent',
      submenu: [
        {
          label: 'Switch to Plan Mode',
          click: () => sendAction('set-mode-plan'),
        },
        {
          label: 'Switch to Manual Mode',
          click: () => sendAction('set-mode-manual'),
        },
        {
          label: 'Switch to Auto Mode',
          click: () => sendAction('set-mode-auto'),
        },
        { type: 'separator' },
        {
          label: 'Deep Research...',
          click: () => sendAction('start-research'),
        },
      ],
    },
    {
      label: '&Help',
      submenu: [
        {
          label: 'Documentation & Guides',
          click: async () => {
            const { shell } = await import('electron');
            await shell.openExternal('https://github.com/najam/agent-os');
          },
        },
        {
          label: 'System Doctor',
          click: () => sendAction('run-doctor'),
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
  return menu;
}
