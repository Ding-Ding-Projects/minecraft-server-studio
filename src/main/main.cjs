const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const path = require('node:path');
const { ServerManager } = require('./server-manager.cjs');

app.setName('Minecraft Server Studio');

let mainWindow;
let serverManager;

function sendToRenderer(event) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('studio:event', event);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 980,
    minHeight: 720,
    show: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#10131a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
}

app.whenReady().then(() => {
  serverManager = new ServerManager({
    dataDir: path.join(app.getPath('userData'), 'servers'),
    onEvent: sendToRenderer
  });
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

function requireManager() {
  if (!serverManager) throw new Error('Minecraft Server Studio is still starting.');
  return serverManager;
}

ipcMain.handle('studio:list-servers', () => requireManager().listServers());
ipcMain.handle('studio:create-server', (_event, draft) => requireManager().createServer(draft));
ipcMain.handle('studio:update-server', (_event, id, patch) => requireManager().updateServer(id, patch));
ipcMain.handle('studio:paper-versions', () => requireManager().paperVersions());
ipcMain.handle('studio:inspect-dependencies', () => requireManager().inspectDependencies());
ipcMain.handle('studio:install-dependencies', (_event, ids) => requireManager().installDependencies(ids));
ipcMain.handle('studio:provision', (_event, id) => requireManager().provisionServer(id));
ipcMain.handle('studio:start', (_event, id) => requireManager().startServer(id));
ipcMain.handle('studio:stop', (_event, id) => requireManager().stopServer(id));
ipcMain.handle('studio:console', (_event, id, command) => requireManager().sendConsoleCommand(id, command));
ipcMain.handle('studio:rcon', (_event, id, command) => requireManager().rconCommand(id, command));
ipcMain.handle('studio:list-plugins', (_event, id) => requireManager().listPlugins(id));
ipcMain.handle('studio:install-plugin', (_event, id, sourcePath) => requireManager().installPlugin(id, sourcePath));
ipcMain.handle('studio:pick-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory', 'createDirectory'] });
  return result.canceled ? null : result.filePaths[0];
});
ipcMain.handle('studio:pick-plugin', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'Java archive', extensions: ['jar'] }]
  });
  return result.canceled ? null : result.filePaths[0];
});
ipcMain.handle('studio:open-folder', async (_event, folder) => {
  const error = await shell.openPath(folder);
  if (error) throw new Error(error);
});
ipcMain.handle('studio:data-directory', () => path.join(app.getPath('userData'), 'servers'));
