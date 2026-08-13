const { app, BrowserWindow, dialog, ipcMain, safeStorage, shell } = require('electron');
const path = require('node:path');
const { ServerManager } = require('./server-manager.cjs');
const { MinecraftManagementProtocolClient } = require('./minecraft-management-protocol.cjs');
let CredentialVault;
try {
  ({ CredentialVault } = require('./credential-vault.cjs'));
} catch {
  CredentialVault = null;
}

app.setName('Minecraft Server Studio');

let mainWindow;
let serverManager;
let credentialVault;

function rconPacket(id, type, body) {
  const payload = Buffer.from(String(body), 'utf8');
  const packet = Buffer.alloc(14 + payload.length);
  packet.writeInt32LE(packet.length - 4, 0);
  packet.writeInt32LE(id, 4);
  packet.writeInt32LE(type, 8);
  payload.copy(packet, 12);
  return packet;
}

function sendVaultBackedRconCommand({ host, port, password, command }) {
  const net = require('node:net');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('RCON port must be between 1 and 65535.');
  const text = String(command || '').replace(/[\r\n]/g, '').trim();
  if (!text || text.length > 1024) throw new Error('RCON commands must contain between 1 and 1024 characters.');
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    let buffer = Buffer.alloc(0);
    let authenticated = false;
    let settled = false;
    const finish = (handler) => (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      handler(value);
    };
    const succeed = finish(resolve);
    const fail = finish(reject);
    const timer = setTimeout(() => fail(new Error('RCON did not respond within 10 seconds.')), 10_000);
    socket.once('connect', () => socket.write(rconPacket(1, 3, password)));
    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length >= 4) {
        const length = buffer.readInt32LE(0);
        if (length < 10 || length > 1024 * 1024 || buffer.length < length + 4) return;
        const packet = buffer.subarray(0, length + 4);
        buffer = buffer.subarray(length + 4);
        const packetId = packet.readInt32LE(4);
        const type = packet.readInt32LE(8);
        if (!authenticated && type === 2) {
          if (packetId === -1) return fail(new Error('RCON rejected the protected password.'));
          authenticated = true;
          socket.write(rconPacket(2, 2, text));
        } else if (authenticated && packetId === 2) {
          return succeed(packet.subarray(12, packet.length - 2).toString('utf8'));
        }
      }
    });
    socket.once('error', () => fail(new Error('RCON connection failed.')));
  });
}

async function managementClientFor(server) {
  const endpoint = server.management?.endpoint;
  if (!endpoint) throw new Error('Configure a Minecraft Server Management Protocol endpoint before discovery.');
  return new MinecraftManagementProtocolClient({
    endpoint,
    allowInsecureLoopback: Boolean(server.management?.allowInsecureLoopback)
  });
}

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
  credentialVault = CredentialVault ? new CredentialVault({
    dataDir: path.join(app.getPath('userData'), 'credential-vault'),
    safeStorage
  }) : null;
  serverManager = new ServerManager({
    dataDir: path.join(app.getPath('userData'), 'servers'),
    credentialSecretProvider: async (kind, serverId) => {
      if (!credentialVault) return null;
      return credentialVault.read(credentialVault.createKey('minecraft-server-studio', `${kind}:${serverId}`));
    },
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
ipcMain.handle('studio:update-server', async (_event, id, patch) => {
  const safePatch = patch && typeof patch === 'object' ? { ...patch } : patch;
  if (safePatch?.settings && Object.prototype.hasOwnProperty.call(safePatch.settings, 'rcon.password')) {
    const secret = String(safePatch.settings['rcon.password'] || '');
    safePatch.settings = { ...safePatch.settings, 'rcon.password': '' };
    if (secret) {
      if (!credentialVault) throw new Error('The protected credential vault is unavailable in this app build.');
      credentialVault.save(credentialVault.createKey('minecraft-server-studio', `rcon:${id}`), secret);
      safePatch.rconSecretConfigured = true;
    }
  }
  return requireManager().updateServer(id, safePatch);
});
ipcMain.handle('studio:paper-versions', () => requireManager().paperVersions());
ipcMain.handle('studio:inspect-dependencies', () => requireManager().inspectDependencies());
ipcMain.handle('studio:install-dependencies', (_event, ids, serverId) => requireManager().installDependencies(ids, serverId));
ipcMain.handle('studio:provision', (_event, id) => requireManager().provisionServer(id));
ipcMain.handle('studio:start', (_event, id) => requireManager().startServer(id));
ipcMain.handle('studio:stop', (_event, id) => requireManager().stopServer(id));
ipcMain.handle('studio:console', (_event, id, command) => requireManager().sendConsoleCommand(id, command));
ipcMain.handle('studio:apply-gamerules', async (_event, id, gameRules) => {
  const manager = requireManager();
  const server = await manager.getServer(id);
  if (manager.isServerRunning(id)) return manager.applyGameRules(id, gameRules);
  if (!server.settings?.['enable-rcon'] || server.settings['enable-rcon'] !== 'true' || !credentialVault) {
    return manager.applyGameRules(id, gameRules);
  }
  const password = credentialVault.read(credentialVault.createKey('minecraft-server-studio', `rcon:${id}`));
  if (!password) return manager.applyGameRules(id, gameRules);
  return manager.applyGameRules(id, gameRules, {
    transport: 'rcon',
    sendCommand: async (command) => sendVaultBackedRconCommand({
      host: '127.0.0.1',
      port: Number(server.settings['rcon.port']),
      password,
      command
    })
  });
});
ipcMain.handle('studio:rcon', async (_event, id, command) => {
  const server = await requireManager().getServer(id);
  if (!server.settings?.['enable-rcon'] || server.settings['enable-rcon'] !== 'true') throw new Error('Enable RCON in the Network tab before using remote CLI commands.');
  if (!credentialVault) throw new Error('The protected credential vault is unavailable in this app build.');
  const password = credentialVault.read(credentialVault.createKey('minecraft-server-studio', `rcon:${id}`));
  if (!password) throw new Error('Save an RCON password in the Network tab before using remote CLI commands.');
  return sendVaultBackedRconCommand({ host: '127.0.0.1', port: Number(server.settings['rcon.port']), password, command });
});
ipcMain.handle('studio:list-plugins', (_event, id) => requireManager().listPlugins(id));
ipcMain.handle('studio:plan-plugin-install', (_event, id, sourcePath) => requireManager().planPluginInstallation(id, sourcePath));
ipcMain.handle('studio:install-plugin', (_event, id, sourcePath) => requireManager().installPlugin(id, sourcePath));
ipcMain.handle('studio:promote-staged-plugins', (_event, id) => requireManager().promoteStagedPlugins(id));
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
ipcMain.handle('studio:local-status', () => requireManager().localStatusSnapshot());
ipcMain.handle('studio:refresh-spigot-versions', () => requireManager().refreshSpigotVersionMetadata());
ipcMain.handle('studio:buildtools-preflight', (_event, id, input) => requireManager().buildToolsPreflight(id, input));
ipcMain.handle('studio:execute-buildtools-plan', (_event, id, confirmation) => requireManager().executeBuildToolsPlan(id, confirmation));
ipcMain.handle('studio:pick-java', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'Java executable', extensions: ['exe'] }]
  });
  return result.canceled ? null : result.filePaths[0];
});
ipcMain.handle('studio:runtime-inventory', async (_event, id) => requireManager().runtimeInventory(id));
ipcMain.handle('studio:configure-management', async (_event, id, configuration) => {
  const token = String(configuration?.token || '');
  if (token) {
    if (!credentialVault) throw new Error('The protected credential vault is unavailable in this app build.');
    credentialVault.save(credentialVault.createKey('minecraft-server-studio', `management:${id}`), token);
  }
  const server = await requireManager().getServer(id);
  const client = configuration?.endpoint
    ? new MinecraftManagementProtocolClient({ endpoint: configuration.endpoint, allowInsecureLoopback: Boolean(configuration.allowInsecureLoopback) })
    : null;
  if (client) client.validateEndpoint();
  return requireManager().updateServer(id, {
    management: {
      endpoint: configuration?.endpoint || server.management?.endpoint || '',
      allowInsecureLoopback: Boolean(configuration?.allowInsecureLoopback),
      state: configuration?.endpoint ? 'configured' : 'not-configured'
    }
  });
});
ipcMain.handle('studio:discover-management', async (_event, id) => {
  const server = await requireManager().getServer(id);
  const discovery = await (await managementClientFor(server)).discover();
  return requireManager().updateServer(id, {
    management: {
      state: 'ready',
      discoveredAt: new Date().toISOString(),
      capabilities: discovery.methods
    }
  });
});
ipcMain.handle('studio:invoke-management', async (_event, id, method, params) => {
  const server = await requireManager().getServer(id);
  if (!server.management?.capabilities?.includes(method)) throw new Error(`The selected server did not advertise '${method}'.`);
  return (await managementClientFor(server)).invokeDiscovered(method, params || {});
});
ipcMain.handle('studio:command-catalog', async (_event, id) => requireManager().commandCatalog(id));
ipcMain.handle('studio:command-plan', async (_event, id, request) => requireManager().commandPlan(id, request));
