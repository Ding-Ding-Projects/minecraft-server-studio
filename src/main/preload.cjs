const { contextBridge, ipcRenderer } = require('electron');

function rconResponseEnvelope(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.version !== 1 || value.kind !== 'rcon-response' || typeof value.text !== 'string') {
    return { version: 1, kind: 'rcon-response', text: '', redacted: true, truncated: false, sanitized: true };
  }
  return {
    version: 1,
    kind: 'rcon-response',
    text: value.text,
    redacted: value.redacted === true,
    truncated: value.truncated === true,
    sanitized: value.sanitized === true
  };
}

contextBridge.exposeInMainWorld('studio', {
  experienceSettings: () => ipcRenderer.invoke('studio:experience-settings'),
  updateExperienceSettings: (patch) => ipcRenderer.invoke('studio:update-experience-settings', patch),
  createSchoolModeRecord: () => ipcRenderer.invoke('studio:create-school-mode-record'),
  updateSchoolModeLabel: (label) => ipcRenderer.invoke('studio:update-school-mode-label', label),
  saveSchoolModeCredential: (input) => ipcRenderer.invoke('studio:save-school-mode-credential', input),
  setSchoolMode: (input) => ipcRenderer.invoke('studio:set-school-mode', input),
  listServers: () => ipcRenderer.invoke('studio:list-servers'),
  createServer: (draft) => ipcRenderer.invoke('studio:create-server', draft),
  updateServer: (id, patch) => ipcRenderer.invoke('studio:update-server', id, patch),
  paperVersions: () => ipcRenderer.invoke('studio:paper-versions'),
  inspectDependencies: (serverId) => ipcRenderer.invoke('studio:inspect-dependencies', serverId),
  installDependencies: (ids, serverId) => ipcRenderer.invoke('studio:install-dependencies', ids, serverId),
  provision: (id) => ipcRenderer.invoke('studio:provision', id),
  start: (id) => ipcRenderer.invoke('studio:start', id),
  stop: (id) => ipcRenderer.invoke('studio:stop', id),
  console: (id, command) => ipcRenderer.invoke('studio:console', id, command),
  applyGameRules: (id, gameRules) => ipcRenderer.invoke('studio:apply-gamerules', id, gameRules),
  rcon: async (id, command) => rconResponseEnvelope(await ipcRenderer.invoke('studio:rcon', id, command)),
  listPlugins: (id) => ipcRenderer.invoke('studio:list-plugins', id),
  planPluginInstall: (id, sourcePath) => ipcRenderer.invoke('studio:plan-plugin-install', id, sourcePath),
  installPlugin: (id, sourcePath) => ipcRenderer.invoke('studio:install-plugin', id, sourcePath),
  promoteStagedPlugins: (id) => ipcRenderer.invoke('studio:promote-staged-plugins', id),
  pickFolder: () => ipcRenderer.invoke('studio:pick-folder'),
  pickPlugin: () => ipcRenderer.invoke('studio:pick-plugin'),
  openFolder: (folder) => ipcRenderer.invoke('studio:open-folder', folder),
  dataDirectory: () => ipcRenderer.invoke('studio:data-directory'),
  localStatus: () => ipcRenderer.invoke('studio:local-status'),
  authenticatorStatus: () => ipcRenderer.invoke('studio:authenticator-status'),
  authenticatorSnapshot: () => ipcRenderer.invoke('studio:authenticator-snapshot'),
  createAuthenticatorEntry: (input) => ipcRenderer.invoke('studio:create-authenticator-entry', input),
  toyLockStatus: () => ipcRenderer.invoke('studio:toy-lock-status'),
  listToyLocks: () => ipcRenderer.invoke('studio:list-toy-locks'),
  createToyLock: (input) => ipcRenderer.invoke('studio:create-toy-lock', input),
  unlockToyLock: (lockId, credential) => ipcRenderer.invoke('studio:unlock-toy-lock', lockId, credential),
  relockToyLock: (lockId) => ipcRenderer.invoke('studio:relock-toy-lock', lockId),
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
  refreshCommandDiscovery: (id, input) => ipcRenderer.invoke('studio:refresh-command-discovery', id, input),
  commandPlan: (id, request) => ipcRenderer.invoke('studio:command-plan', id, request),
  backupOverview: (id) => ipcRenderer.invoke('studio:backup-overview', id),
  backupPreflight: (id) => ipcRenderer.invoke('studio:backup-preflight', id),
  createBackup: (id, confirmation) => ipcRenderer.invoke('studio:create-backup', id, confirmation),
  restorePreflight: (id, backupId) => ipcRenderer.invoke('studio:restore-preflight', id, backupId),
  restoreBackup: (id, confirmation) => ipcRenderer.invoke('studio:restore-backup', id, confirmation),
  paperUpdatePreflight: (id) => ipcRenderer.invoke('studio:paper-update-preflight', id),
  applyPaperUpdate: (id, confirmation) => ipcRenderer.invoke('studio:apply-paper-update', id, confirmation),
  paperRollbackPreflight: (id) => ipcRenderer.invoke('studio:paper-rollback-preflight', id),
  applyPaperRollback: (id, confirmation) => ipcRenderer.invoke('studio:apply-paper-rollback', id, confirmation),
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
