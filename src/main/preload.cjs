const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('studio', {
  listServers: () => ipcRenderer.invoke('studio:list-servers'),
  createServer: (draft) => ipcRenderer.invoke('studio:create-server', draft),
  updateServer: (id, patch) => ipcRenderer.invoke('studio:update-server', id, patch),
  paperVersions: () => ipcRenderer.invoke('studio:paper-versions'),
  inspectDependencies: () => ipcRenderer.invoke('studio:inspect-dependencies'),
  installDependencies: (ids) => ipcRenderer.invoke('studio:install-dependencies', ids),
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
  onEvent: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('studio:event', listener);
    return () => ipcRenderer.removeListener('studio:event', listener);
  }
});
