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
  updateStatus: () => ipcRenderer.invoke('studio:update-status'),
  checkForUpdates: () => ipcRenderer.invoke('studio:check-for-updates'),
  setUpdatesEnabled: (enabled) => ipcRenderer.invoke('studio:set-updates-enabled', Boolean(enabled)),
  deferUpdate: () => ipcRenderer.invoke('studio:defer-update'),
  restartForUpdate: () => ipcRenderer.invoke('studio:restart-for-update'),
  openUpdateNotes: () => ipcRenderer.invoke('studio:open-update-notes'),
  onUnsavedWorkQuery: (callback) => {
    if (typeof callback !== 'function') throw new Error('Unsaved-work callbacks must be functions.');
    const listener = async (_event, request) => {
      let response = { hasUnsavedWork: true, detail: 'The renderer could not confirm unsaved work.' };
      try {
        const result = await callback();
        response = {
          hasUnsavedWork: Boolean(result?.hasUnsavedWork),
          detail: typeof result?.detail === 'string' ? result.detail.slice(0, 160) : ''
        };
      } catch {
        // A renderer-side query failure intentionally blocks update restart.
      }
      ipcRenderer.send('studio:unsaved-work-response', { requestId: String(request?.requestId || ''), ...response });
    };
    ipcRenderer.on('studio:query-unsaved-work', listener);
    return () => ipcRenderer.removeListener('studio:query-unsaved-work', listener);
  },
  onEvent: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('studio:event', listener);
    return () => ipcRenderer.removeListener('studio:event', listener);
  }
});
