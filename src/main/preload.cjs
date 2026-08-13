const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('studio', {
  listServers: () => ipcRenderer.invoke('studio:list-servers'),
  createServer: (draft) => ipcRenderer.invoke('studio:create-server', draft),
  updateServer: (id, patch) => ipcRenderer.invoke('studio:update-server', id, patch),
  paperVersions: () => ipcRenderer.invoke('studio:paper-versions'),
  inspectDependencies: () => ipcRenderer.invoke('studio:inspect-dependencies'),
  installDependencies: (ids, serverId) => ipcRenderer.invoke('studio:install-dependencies', ids, serverId),
  provision: (id) => ipcRenderer.invoke('studio:provision', id),
  start: (id) => ipcRenderer.invoke('studio:start', id),
  stop: (id) => ipcRenderer.invoke('studio:stop', id),
  console: (id, command) => ipcRenderer.invoke('studio:console', id, command),
  rcon: (id, command) => ipcRenderer.invoke('studio:rcon', id, command),
  listPlugins: (id) => ipcRenderer.invoke('studio:list-plugins', id),
  installPlugin: (id, sourcePath) => ipcRenderer.invoke('studio:install-plugin', id, sourcePath),
  pickFolder: () => ipcRenderer.invoke('studio:pick-folder'),
  pickPlugin: () => ipcRenderer.invoke('studio:pick-plugin'),
  openFolder: (folder) => ipcRenderer.invoke('studio:open-folder', folder),
  dataDirectory: () => ipcRenderer.invoke('studio:data-directory'),
  localStatus: () => ipcRenderer.invoke('studio:local-status'),
  statusHubBridge: () => ipcRenderer.invoke('studio:status-hub-bridge'),
  configureStatusHubBridge: (configuration) => ipcRenderer.invoke('studio:configure-status-hub-bridge', configuration),
  syncStatusHubBridge: () => ipcRenderer.invoke('studio:sync-status-hub-bridge'),
  refreshSpigotVersions: () => ipcRenderer.invoke('studio:refresh-spigot-versions'),
  buildToolsPreflight: (id, input) => ipcRenderer.invoke('studio:buildtools-preflight', id, input),
  executeBuildToolsPlan: (id, confirmation) => ipcRenderer.invoke('studio:execute-buildtools-plan', id, confirmation),
  pickJava: () => ipcRenderer.invoke('studio:pick-java'),
  runtimeInventory: (id) => ipcRenderer.invoke('studio:runtime-inventory', id),
  configureManagement: (id, configuration) => ipcRenderer.invoke('studio:configure-management', id, configuration),
  discoverManagement: (id) => ipcRenderer.invoke('studio:discover-management', id),
  invokeManagement: (id, method, params) => ipcRenderer.invoke('studio:invoke-management', id, method, params),
  commandCatalog: (id) => ipcRenderer.invoke('studio:command-catalog', id),
  commandPlan: (id, request) => ipcRenderer.invoke('studio:command-plan', id, request),
  onEvent: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('studio:event', listener);
    return () => ipcRenderer.removeListener('studio:event', listener);
  }
});
