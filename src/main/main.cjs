const { app, autoUpdater, BrowserWindow, dialog, ipcMain, nativeImage, safeStorage, shell } = require('electron');
const crypto = require('node:crypto');
const path = require('node:path');
const { ServerManager } = require('./server-manager.cjs');
const { MinecraftManagementProtocolClient } = require('./minecraft-management-protocol.cjs');
const { StudioSettingsService } = require('./studio-settings.cjs');
const { NarrationScheduleSettingsService } = require('./narration-schedule-settings.cjs');
const { LocalHistoryService } = require('./local-history-service.cjs');
const { createSafeRconResponse, safeRconErrorMessage } = require('../renderer/rcon-response-safety.js');
const { createLocalStatusSnapshot } = require('./desktop-status-model.cjs');
const { FileConverter } = require('./file-converter.cjs');
const { ExternalEditorService } = require('./external-editor-service.cjs');
const { OfflineDocumentationLibrary } = require('./offline-docs.cjs');
const { LogoManager } = require('./logo-manager.cjs');
const { CANONICAL_COMMIT_BASE_URL, LocalChangelogLibrary } = require('./changelog-library.cjs');
const { UpdateController } = require('./update-controller.cjs');
const { LocalOllamaSuiteManager } = require('./ollama-suite-manager.cjs');
const { BuildToolsOrchestrationController } = require('./buildtools-orchestration.cjs');
let CredentialVault;
let SharedStatusHubClient;
let AuthenticatorService;
let ToyLockService;
let SupportTicketService;
try {
  ({ CredentialVault } = require('./credential-vault.cjs'));
} catch {
  CredentialVault = null;
}
try {
  ({ SharedStatusHubClient } = require('./shared-status-hub-client.cjs'));
} catch {
  SharedStatusHubClient = null;
}
try {
  ({ AuthenticatorService } = require('./authenticator-service.cjs'));
} catch {
  AuthenticatorService = null;
}
try {
  ({ ToyLockService } = require('./toy-lock-service.cjs'));
} catch {
  ToyLockService = null;
}
try {
  ({ SupportTicketService } = require('./support-ticket-service.cjs'));
} catch {
  SupportTicketService = null;
}

app.setName('Minecraft Server Studio');

let mainWindow;
let serverManager;
let credentialVault;
let studioSettings;
let narrationScheduleSettings;
let localHistory;
let schoolModeVault;
let schoolModeCredentialKey;

const MAX_RCON_PACKET_BYTES = 256 * 1024;
const MAX_RCON_BUFFER_BYTES = MAX_RCON_PACKET_BYTES + 64;
let statusHubBridge;
let updateController;
let ollamaSuite;
let fileConverter;
let externalEditor;
let buildToolsController;
let offlineDocumentation;
let logoManager;
let offlineChangelog;
let scheduleTickTimer;
let authenticatorService;
let toyLockService;
let supportTicketService;
const unsavedWorkQueries = new Map();

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
      try {
        if (!Buffer.isBuffer(chunk) || buffer.length + chunk.length > MAX_RCON_BUFFER_BYTES) {
          return fail(new Error('RCON response exceeded the safe response limit.'));
        }
        buffer = Buffer.concat([buffer, chunk]);
        while (buffer.length >= 4) {
          const length = buffer.readInt32LE(0);
          if (length < 10 || length > MAX_RCON_PACKET_BYTES) {
            return fail(new Error('RCON returned an invalid or oversized response frame.'));
          }
          if (buffer.length < length + 4) return;
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
      } catch {
        return fail(new Error('RCON returned an invalid response frame.'));
      }
    });
    socket.once('error', () => fail(new Error('RCON connection failed.')));
  });
}

function managementCredentialIsStored(serverId) {
  if (!credentialVault) return false;
  try {
    return credentialVault.has(credentialVault.createKey('minecraft-server-studio', `management:${serverId}`));
  } catch {
    return false;
  }
}

function managementAuthenticationBlocker(server, serverId) {
  if (!server.management?.credentialConfigured && !managementCredentialIsStored(serverId)) return null;
  return 'A protected management credential is stored, but this build has no documented provider-specific authentication adapter. The generic WebSocket client intentionally will not send it. Clear the credential or use an endpoint that does not require authentication.';
}

async function managementClientFor(server, options = {}) {
  const endpoint = server.management?.endpoint;
  if (!endpoint) throw new Error('Configure a Minecraft Server Management Protocol endpoint before discovery.');
  const authenticationBlocker = managementAuthenticationBlocker(server, options.serverId || server.id);
  if (authenticationBlocker) throw new Error(authenticationBlocker);
  const client = new MinecraftManagementProtocolClient({
    endpoint,
    allowInsecureLoopback: Boolean(server.management?.allowInsecureLoopback)
  });
  if (options.restoreDiscovery === true) client.restoreDiscovery(server.management?.discovery);
  return client;
}

function publicServerWithManagementCredentialState(server) {
  if (!server || server.management?.authentication?.credentialConfigured || !managementCredentialIsStored(server.id)) return server;
  return {
    ...server,
    management: {
      ...server.management,
      state: 'authentication-adapter-required',
      capabilities: [],
      authentication: {
        state: 'provider-adapter-required',
        credentialConfigured: true,
        message: 'A protected credential is stored, but this build has no documented provider-specific authentication adapter and will not send it.'
      }
    }
  };
}

function sendToRenderer(event) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('studio:event', event);
}

function requireStudioSettings() {
  if (!studioSettings) throw new Error('Presentation settings are still starting.');
  return studioSettings;
}

function schoolModeVaultStatus() {
  if (!schoolModeVault || !schoolModeCredentialKey) {
    return { state: 'unavailable', mode: 'none', configured: false, detail: 'Operating-system credential protection is unavailable.' };
  }
  const status = schoolModeVault.getStatus();
  let configured = false;
  try {
    configured = status.state !== 'unavailable' && schoolModeVault.has(schoolModeCredentialKey);
  } catch {
    return { state: 'unavailable', mode: 'none', configured: false, detail: 'Operating-system credential protection is unavailable.' };
  }
  return {
    state: status.state,
    mode: status.mode,
    configured,
    detail: status.state === 'ready'
      ? (configured ? 'A shared unlock credential is configured.' : 'Create an unlock password or PIN before enabling the shared mode.')
      : 'Operating-system credential protection is unavailable.'
  };
}

function experienceSnapshot() {
  const settings = requireStudioSettings().snapshot();
  const narrationSchedule = requireNarrationScheduleSettings().snapshot({ baseLanguage: settings.local.language });
  return {
    ...settings,
    effectiveLocal: {
      ...settings.local,
      language: narrationSchedule.effective.language
    },
    narrationSchedule,
    narratorRuntime: narratorRuntimeSnapshot(),
    credential: schoolModeVaultStatus()
  };
}

function narratorRuntimeSnapshot() {
  if (typeof app.accessibilitySupportEnabled !== 'boolean') {
    return {
      screenReaderActive: true,
      state: 'unavailable',
      detail: 'This Electron runtime cannot report whether a platform accessibility client is active. Narrator speech yields until an equivalent supported signal is available.'
    };
  }
  return {
    screenReaderActive: app.accessibilitySupportEnabled === true,
    state: app.accessibilitySupportEnabled === true ? 'active' : 'inactive',
    detail: app.accessibilitySupportEnabled === true
      ? 'A platform accessibility client is active, so narrator speech yields instead of competing with a screen reader.'
      : 'No platform accessibility client is currently reported by Electron.'
  };
}

function applyDisplayName(displayName) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setTitle(displayName);
}

function publishExperienceSettings() {
  const snapshot = experienceSnapshot();
  applyDisplayName(snapshot.local.displayName);
  sendToRenderer({ type: 'experience-settings', payload: snapshot });
  return snapshot;
}

function normalizeSchoolCredential(value, label) {
  if (typeof value !== 'string') throw new Error(`${label} must be text.`);
  if (value.length < 4 || value.length > 256) throw new Error(`${label} must contain between 4 and 256 characters.`);
  if (/\u0000/.test(value)) throw new Error(`${label} contains an invalid character.`);
  return value;
}

function credentialsMatch(left, right) {
  const first = Buffer.from(left, 'utf8');
  const second = Buffer.from(right, 'utf8');
  return first.length === second.length && crypto.timingSafeEqual(first, second);
}

function requireSchoolModeVault() {
  const status = schoolModeVaultStatus();
  if (!schoolModeVault || !schoolModeCredentialKey || status.state !== 'ready') {
    throw new Error('Operating-system credential protection is unavailable. Restore it before changing the shared mode.');
  }
  return status;
}

function verifySchoolModeCredential(candidate) {
  const status = requireSchoolModeVault();
  if (!status.configured) throw new Error('Create a shared unlock password or PIN before changing the shared mode.');
  const supplied = normalizeSchoolCredential(candidate, 'Unlock password or PIN');
  const stored = schoolModeVault.read(schoolModeCredentialKey);
  if (!stored || !credentialsMatch(stored, supplied)) throw new Error('The unlock password or PIN did not match. You can recover by deleting the shared local application-data record yourself.');
}

function unavailableBridgeStatus() {
  return {
    state: 'failed',
    endpoint: '',
    allowInsecureLoopback: false,
    localFallback: true,
    detail: 'The optional Status Hub bridge is unavailable in this app build. Local status remains available.',
    inboxState: 'not-polled',
    observedReplyCount: 0,
    latestReplySequence: null,
    lastFailureCode: 'BRIDGE_UNAVAILABLE'
  };
}

function requireStatusHubBridge() {
  if (!statusHubBridge) throw new Error('The optional Status Hub bridge is unavailable in this app build. Local status remains available.');
  return statusHubBridge;
}

async function localStatusWithBridge() {
  const localStatus = await requireManager().localStatusSnapshot();
  return {
    ...localStatus,
    snapshot: createLocalStatusSnapshot({
      ...localStatus.snapshot,
      statusHubBridge: statusHubBridge ? statusHubBridge.getStatus() : unavailableBridgeStatus()
    })
  };
}

function queryRendererUnsavedWork() {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) {
    return Promise.resolve({ hasUnsavedWork: true, detail: 'The application window is unavailable to confirm unsaved work.' });
  }
  const requestId = crypto.randomUUID();
  const senderId = mainWindow.webContents.id;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      unsavedWorkQueries.delete(requestId);
      resolve({ hasUnsavedWork: true, detail: 'The application did not confirm unsaved work before the restart safety timeout.' });
    }, 5_000);
    unsavedWorkQueries.set(requestId, { resolve, timer, senderId });
    mainWindow.webContents.send('studio:query-unsaved-work', { requestId });
  });
}

ipcMain.on('studio:unsaved-work-response', (event, response) => {
  const requestId = String(response?.requestId || '');
  const pending = unsavedWorkQueries.get(requestId);
  if (!pending || pending.senderId !== event.sender.id) return;
  unsavedWorkQueries.delete(requestId);
  clearTimeout(pending.timer);
  pending.resolve({
    hasUnsavedWork: Boolean(response?.hasUnsavedWork),
    detail: typeof response?.detail === 'string' ? response.detail.slice(0, 160) : ''
  });
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 980,
    minHeight: 720,
    show: false,
    title: experienceSnapshot().local.displayName,
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

app.whenReady().then(async () => {
  const appData = app.getPath('appData');
  const sharedSettingsDirectory = path.join(appData, 'Ding Ding Projects', 'shared-experience-settings');
  studioSettings = new StudioSettingsService({
    dataDir: path.join(app.getPath('userData'), 'settings'),
    sharedDataDir: sharedSettingsDirectory,
    onChange: publishExperienceSettings
  });
  studioSettings.initialize();
  externalEditor = new ExternalEditorService({
    dataDir: path.join(app.getPath('userData'), 'external-editor')
  });
  await externalEditor.initialize();
  localHistory = new LocalHistoryService({
    dataDir: path.join(app.getPath('userData'), 'local-history'),
    externalEditor,
    onChange: (history) => sendToRenderer({ type: 'local-history', history })
  });
  localHistory.initialize();
  narrationScheduleSettings = new NarrationScheduleSettingsService({
    dataDir: path.join(app.getPath('userData'), 'settings'),
    onChange: publishExperienceSettings
  });
  narrationScheduleSettings.initialize();
  scheduleTickTimer = setInterval(() => publishExperienceSettings(), 20_000);
  scheduleTickTimer.unref?.();
  logoManager = new LogoManager({
    dataDir: path.join(app.getPath('userData'), 'logo-customization'),
    nativeImage
  });
  await logoManager.initialize();
  credentialVault = CredentialVault ? new CredentialVault({
    dataDir: path.join(app.getPath('userData'), 'credential-vault'),
    safeStorage
  }) : null;
  authenticatorService = AuthenticatorService ? new AuthenticatorService({
    dataDir: path.join(app.getPath('userData'), 'authenticator'),
    credentialVault,
    onChange: () => sendToRenderer({ type: 'authenticator-changed' })
  }) : null;
  toyLockService = ToyLockService ? new ToyLockService({
    dataDir: path.join(app.getPath('userData'), 'toy-locks'),
    recoveryDirectory: app.getPath('userData'),
    credentialVault,
    onChange: () => sendToRenderer({ type: 'toy-locks-changed' })
  }) : null;
  supportTicketService = SupportTicketService ? new SupportTicketService({
    dataDir: path.join(app.getPath('userData'), 'support-tickets'),
    recoveryDirectory: app.getPath('userData'),
    onChange: () => sendToRenderer({ type: 'support-tickets-changed' })
  }) : null;
  authenticatorService?.initialize();
  toyLockService?.initialize();
  supportTicketService?.initialize();
  schoolModeVault = CredentialVault ? new CredentialVault({
    dataDir: path.join(sharedSettingsDirectory, 'credential-vault'),
    safeStorage
  }) : null;
  schoolModeCredentialKey = schoolModeVault
    ? schoolModeVault.createKey('ding-ding-projects', 'shared-school-mode-unlock')
    : null;
  try {
    statusHubBridge = SharedStatusHubClient ? new SharedStatusHubClient({
      dataDir: path.join(app.getPath('userData'), 'status-hub-bridge'),
      credentialVault,
      sessionTitle: 'Minecraft Server Studio desktop status',
      repository: 'Ding-Ding-Projects/minecraft-server-studio',
      agentLabel: 'minecraft-server-studio-desktop',
      onStateChange: (bridge) => sendToRenderer({ type: 'status-hub-bridge', bridge })
    }) : null;
  } catch {
    statusHubBridge = null;
  }
  serverManager = new ServerManager({
    dataDir: path.join(app.getPath('userData'), 'servers'),
    credentialSecretProvider: async (kind, serverId) => {
      if (!credentialVault) return null;
      return credentialVault.read(credentialVault.createKey('minecraft-server-studio', `${kind}:${serverId}`));
    },
    onEvent: sendToRenderer
  });
  buildToolsController = new BuildToolsOrchestrationController({
    serverManager,
    repositoryRoots: [app.getAppPath()]
  });
  fileConverter = new FileConverter({
    dataDir: path.join(app.getPath('userData'), 'file-converter'),
    onEvent: sendToRenderer
  });
  await fileConverter.initialize();
  updateController = new UpdateController({
    app,
    autoUpdater,
    dataDir: path.join(app.getPath('userData'), 'updates'),
    onStateChange: (update) => sendToRenderer({ type: 'application-update', update })
  });
  ollamaSuite = new LocalOllamaSuiteManager({
    onStateChange: (ollama) => sendToRenderer({ type: 'ollama-suite', ollama })
  });
  offlineDocumentation = new OfflineDocumentationLibrary({ appPath: app.getAppPath() });
  offlineChangelog = new LocalChangelogLibrary({
    appPath: app.getAppPath(),
    dialog,
    downloadsPath: app.getPath('downloads')
  });
  await updateController.initialize();
  createWindow();
  ollamaSuite.refresh().catch(() => {});
  serverManager.revalidateManagedJavaInventory().catch((error) => {
    serverManager.emit({ type: 'dependency-output', dependency: 'java', message: 'The app-managed Java inventory could not be revalidated at startup: ' + String(error?.message || 'unknown error').slice(0, 512) });
  });
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
  app.on('accessibility-support-changed', () => publishExperienceSettings());
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  studioSettings?.stopWatching();
  updateController?.shutdown();
  if (scheduleTickTimer) clearInterval(scheduleTickTimer);
  scheduleTickTimer = null;
});

function requireManager() {
  if (!serverManager) throw new Error('Minecraft Server Studio is still starting.');
  return serverManager;
}

function requireUpdater() {
  if (!updateController) throw new Error('Minecraft Server Studio update controls are still starting.');
  return updateController;
}

function requireLogoManager() {
  if (!logoManager) throw new Error('Logo customization controls are still starting.');
  return logoManager;
}

function requireOllamaSuite() {
  if (!ollamaSuite) throw new Error('The local Ollama suite is still starting.');
  return ollamaSuite;
}

function requireFileConverter() {
  if (!fileConverter) throw new Error('Minecraft Server Studio local converter controls are still starting.');
  return fileConverter;
}

function requireExternalEditor() {
  if (!externalEditor) throw new Error('Minecraft Server Studio external-editor controls are still starting.');
  return externalEditor;
}

function requireBuildToolsController() {
  if (!buildToolsController) throw new Error('BuildTools planning controls are still starting.');
  return buildToolsController;
}

function requireOfflineDocumentation() {
  if (!offlineDocumentation) throw new Error('Offline documentation is still starting.');
  return offlineDocumentation;
}

function requireOfflineChangelog() {
  if (!offlineChangelog) throw new Error('The offline changelog is still starting.');
  return offlineChangelog;
}

function requireNarrationScheduleSettings() {
  if (!narrationScheduleSettings) throw new Error('Narrator and scheduled settings are still starting.');
  return narrationScheduleSettings;
}

function requireLocalHistory() {
  if (!localHistory) throw new Error('Local history is still starting.');
  return localHistory;
}

function recordLocalHistory(record) {
  try {
    return Object.freeze({ recorded: true, record: requireLocalHistory().record(record) });
  } catch {
    // A journal write is auditable metadata, not permission to undo a primary
    // change that already completed. Notify the renderer without serializing
    // the triggering value or an error payload.
    sendToRenderer({
      type: 'local-history-recording-failed',
      detail: 'The requested change completed, but its local history event could not be recorded. Open History + exports for the current journal state.'
    });
    return Object.freeze({ recorded: false });
  }
}

async function recordLogoHistory(detail) {
  await recordLocalHistory({
    action: 'settings-changed',
    subject: 'presentation',
    subjectId: 'app-logo',
    label: 'App logo settings changed',
    detail
  });
}

function requireAuthenticator() {
  if (!authenticatorService) throw new Error('The local authenticator is unavailable in this app build.');
  return authenticatorService;
}

function requireToyLocks() {
  if (!toyLockService) throw new Error('Toy locks are unavailable in this app build.');
  return toyLockService;
}

function requireSupportTickets() {
  if (!supportTicketService) throw new Error('Local Support Tickets are unavailable in this app build.');
  return supportTicketService;
}

ipcMain.handle('studio:list-servers', async () => (await requireManager().listServers()).map(publicServerWithManagementCredentialState));
ipcMain.handle('studio:experience-settings', () => experienceSnapshot());
ipcMain.handle('studio:update-experience-settings', async (_event, patch) => {
  requireStudioSettings().updateLocal(patch);
  await recordLocalHistory({
    action: 'settings-changed',
    subject: 'presentation',
    subjectId: 'presentation-settings',
    label: 'Presentation settings changed',
    detail: 'A local presentation preference changed. Exact values and sensitive data were omitted from history.'
  });
  return experienceSnapshot();
});
ipcMain.handle('studio:update-appearance-navigation', async (_event, patch) => {
  requireStudioSettings().updateAppearanceNavigation(patch);
  await recordLocalHistory({
    action: 'settings-changed',
    subject: 'presentation',
    subjectId: 'appearance-navigation',
    label: 'Appearance and navigation settings changed',
    detail: 'A local appearance or navigation preference changed. Exact values and sensitive data were omitted from history.'
  });
  return experienceSnapshot();
});
ipcMain.handle('studio:logo-settings', () => requireLogoManager().snapshot());
ipcMain.handle('studio:pick-logo', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'PNG or JPEG image', extensions: ['png', 'jpg', 'jpeg'] }
    ]
  });
  if (result.canceled || !result.filePaths[0]) return requireLogoManager().snapshot();
  const snapshot = await requireLogoManager().importFile(result.filePaths[0]);
  await recordLogoHistory('A locally validated app-logo image changed. Raw image bytes, source paths, and image metadata were omitted from history.');
  return snapshot;
});
ipcMain.handle('studio:select-logo-preset', async (_event, presetId) => {
  const snapshot = await requireLogoManager().selectPreset(presetId);
  await recordLogoHistory('The selected shipped app-logo preset changed. Exact selection values were omitted from history.');
  return snapshot;
});
ipcMain.handle('studio:update-logo-presentation', async (_event, presentation) => {
  const snapshot = await requireLogoManager().updatePresentation(presentation);
  await recordLogoHistory('App-logo rendering controls changed. Exact color, crop, focal-point, and source values were omitted from history.');
  return snapshot;
});
ipcMain.handle('studio:reset-logo', async () => {
  const snapshot = await requireLogoManager().reset();
  await recordLogoHistory('The app logo returned to its shipped preset. Raw image bytes, source paths, and image metadata were omitted from history.');
  return snapshot;
});
ipcMain.handle('studio:narration-schedule-settings', () => experienceSnapshot().narrationSchedule);
ipcMain.handle('studio:update-narrator-settings', async (_event, patch) => {
  requireNarrationScheduleSettings().updateNarrator(patch);
  await recordLocalHistory({
    action: 'settings-changed',
    subject: 'presentation',
    subjectId: 'narrator-settings',
    label: 'Narrator settings changed',
    detail: 'A local narrator preference changed. Exact values and sensitive data were omitted from history.'
  });
  return experienceSnapshot();
});
ipcMain.handle('studio:add-scheduled-setting', async (_event, draft) => {
  requireNarrationScheduleSettings().addSchedule(draft);
  await recordLocalHistory({
    action: 'record-created',
    subject: 'presentation',
    subjectId: 'scheduled-setting',
    label: 'Scheduled presentation setting created',
    detail: 'A local scheduled presentation setting was created. Exact values and sensitive data were omitted from history.'
  });
  return experienceSnapshot();
});
ipcMain.handle('studio:set-scheduled-setting-enabled', async (_event, id, enabled) => {
  requireNarrationScheduleSettings().setScheduleEnabled(id, enabled);
  await recordLocalHistory({
    action: 'configuration-changed',
    subject: 'presentation',
    subjectId: 'scheduled-setting',
    label: 'Scheduled presentation setting changed',
    detail: 'A local scheduled presentation setting changed. Exact values and sensitive data were omitted from history.'
  });
  return experienceSnapshot();
});
ipcMain.handle('studio:create-school-mode-record', async () => {
  requireStudioSettings().ensureSharedRecord();
  await recordLocalHistory({
    action: 'record-created',
    subject: 'school-mode',
    subjectId: 'shared-mode',
    label: 'Shared mode record created',
    detail: 'A shared local presentation-mode record was created. Exact unlock data was omitted.'
  });
  return experienceSnapshot();
});
ipcMain.handle('studio:update-school-mode-label', async (_event, label) => {
  requireStudioSettings().updateSchoolModeLabel(label);
  await recordLocalHistory({
    action: 'settings-changed',
    subject: 'school-mode',
    subjectId: 'shared-mode',
    label: 'Shared mode label changed',
    detail: 'A shared local presentation-mode label changed. The exact label was omitted from history.'
  });
  return experienceSnapshot();
});
ipcMain.handle('studio:save-school-mode-credential', async (_event, input) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Unlock credential input is invalid.');
  requireStudioSettings().ensureSharedRecord();
  const status = requireSchoolModeVault();
  if (status.configured) verifySchoolModeCredential(input.currentCredential);
  const next = normalizeSchoolCredential(input.newCredential, 'New unlock password or PIN');
  schoolModeVault.save(schoolModeCredentialKey, next);
  await recordLocalHistory({
    action: 'configuration-changed',
    subject: 'school-mode',
    subjectId: 'shared-mode',
    label: 'Shared mode unlock configuration changed',
    detail: 'A protected local unlock configuration changed. Sensitive values were omitted from history.'
  });
  return publishExperienceSettings();
});
ipcMain.handle('studio:set-school-mode', async (_event, input) => {
  if (!input || typeof input !== 'object' || Array.isArray(input) || typeof input.enabled !== 'boolean') throw new Error('Shared mode input is invalid.');
  const settings = requireStudioSettings();
  if (input.enabled) {
    const status = requireSchoolModeVault();
    if (!status.configured) throw new Error('Create a shared unlock password or PIN before enabling the shared mode.');
  } else {
    verifySchoolModeCredential(input.credential);
  }
  settings.setSchoolModeEnabled(input.enabled);
  await recordLocalHistory({
    action: 'configuration-changed',
    subject: 'school-mode',
    subjectId: 'shared-mode',
    label: 'Shared mode state changed',
    detail: 'The shared local presentation-mode state changed. Sensitive values were omitted from history.'
  });
  return experienceSnapshot();
});
ipcMain.handle('studio:create-server', async (_event, draft) => {
  const created = await requireManager().createServer(draft);
  await recordLocalHistory({
    action: 'record-created',
    subject: 'server',
    subjectId: String(created.id),
    label: 'Server record created',
    detail: 'A local managed server record was created. Identifying, location, setting, and sensitive values were omitted from history.'
  });
  return created;
});
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
  const updated = await requireManager().updateServer(id, safePatch);
  await recordLocalHistory({
    action: 'record-updated',
    subject: 'server',
    subjectId: String(id),
    label: 'Server record updated',
    detail: 'A local managed server record changed. Identifying, location, setting, and sensitive values were omitted from history.'
  });
  return updated;
});
ipcMain.handle('studio:paper-versions', () => requireManager().paperVersions());
ipcMain.handle('studio:inspect-dependencies', (_event, serverId) => requireManager().inspectDependencies(serverId || null));
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
  try {
    const response = await sendVaultBackedRconCommand({ host: '127.0.0.1', port: Number(server.settings['rcon.port']), password, command });
    return createSafeRconResponse(response, { secrets: [password] });
  } catch (error) {
    throw new Error(safeRconErrorMessage(error, { secrets: [password] }));
  }
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
ipcMain.handle('studio:external-editor-snapshot', () => requireExternalEditor().snapshot());
ipcMain.handle('studio:refresh-external-editors', () => requireExternalEditor().refresh());
ipcMain.handle('studio:choose-external-editor-executable', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'Editor executable', extensions: ['exe'] }]
  });
  return result.canceled ? requireExternalEditor().snapshot() : requireExternalEditor().chooseExecutable(result.filePaths[0]);
});
ipcMain.handle('studio:choose-external-editor-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  return result.canceled ? requireExternalEditor().snapshot() : requireExternalEditor().chooseFolder(result.filePaths[0]);
});
ipcMain.handle('studio:select-external-editor', (_event, candidateId) => requireExternalEditor().selectCandidate(candidateId));
ipcMain.handle('studio:use-automatic-external-editor', () => requireExternalEditor().useAutomaticSelection());
ipcMain.handle('studio:open-external-editor-target', async (_event, serverId, targetKind) => {
  if (typeof serverId !== 'string' || serverId.length === 0 || serverId.length > 128) {
    throw new Error('Choose a managed local server before opening an external-editor target.');
  }
  const server = await requireManager().getServer(serverId);
  return requireExternalEditor().openServerTarget(server, targetKind);
});
ipcMain.handle('studio:converter-snapshot', () => requireFileConverter().snapshot());
ipcMain.handle('studio:pick-converter-source', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile']
  });
  return result.canceled ? null : requireFileConverter().inspectSource(result.filePaths[0]);
});
ipcMain.handle('studio:open-folder', async (_event, folder) => {
  const error = await shell.openPath(folder);
  if (error) throw new Error(error);
});
ipcMain.handle('studio:data-directory', () => path.join(app.getPath('userData'), 'servers'));
ipcMain.handle('studio:local-history-status', () => requireLocalHistory().status());
ipcMain.handle('studio:list-local-history', (_event, filters) => requireLocalHistory().list(filters || {}));
ipcMain.handle('studio:export-local-history', (_event, request) => requireLocalHistory().export(request || {}));
ipcMain.handle('studio:open-local-history-export-in-vscode', (_event, exportId) => requireLocalHistory().openInVsCode(exportId));
ipcMain.handle('studio:offline-docs', () => requireOfflineDocumentation().list());
ipcMain.handle('studio:offline-doc', (_event, id) => requireOfflineDocumentation().read(id));
ipcMain.handle('studio:offline-changelog', () => requireOfflineChangelog().list());
ipcMain.handle('studio:export-offline-changelog', (_event, request) => requireOfflineChangelog().export(request || {}));
ipcMain.handle('studio:open-changelog-commit', async (_event, value) => {
  const sha = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!/^[a-f0-9]{7,40}$/.test(sha)) throw new Error('Choose a valid recorded changelog commit before opening it.');
  await shell.openExternal(`${CANONICAL_COMMIT_BASE_URL}${sha}`);
  return Object.freeze({ state: 'opened', sha });
});
ipcMain.handle('studio:local-status', () => localStatusWithBridge());
ipcMain.handle('studio:ollama-status', () => requireOllamaSuite().status());
ipcMain.handle('studio:refresh-ollama', () => requireOllamaSuite().refresh());
ipcMain.handle('studio:authenticator-status', () => requireAuthenticator().getStatus());
ipcMain.handle('studio:authenticator-snapshot', () => requireAuthenticator().snapshot());
ipcMain.handle('studio:create-authenticator-entry', async (_event, input) => {
  const created = await requireAuthenticator().createEntry(input);
  await recordLocalHistory({
    action: 'record-created',
    subject: 'authenticator',
    subjectId: String(created.id),
    label: 'Authenticator record created',
    detail: 'A local authenticator record was created. Sensitive values were omitted from history.'
  });
  return created;
});
ipcMain.handle('studio:toy-lock-status', () => requireToyLocks().getStatus());
ipcMain.handle('studio:list-toy-locks', () => requireToyLocks().listLocks());
ipcMain.handle('studio:create-toy-lock', async (_event, input) => {
  const created = await requireToyLocks().createLock(input);
  await recordLocalHistory({
    action: 'record-created',
    subject: 'toy-lock',
    subjectId: String(created.id),
    label: 'Toy lock record created',
    detail: 'A local toy lock record was created. Sensitive values were omitted from history.'
  });
  return created;
});
ipcMain.handle('studio:unlock-toy-lock', async (_event, lockId, credential) => {
  const unlocked = await requireToyLocks().unlock(lockId, credential);
  await recordLocalHistory({
    action: 'configuration-changed',
    subject: 'toy-lock',
    subjectId: String(lockId),
    label: 'Toy lock state changed',
    detail: 'A local toy lock state changed. Sensitive values were omitted from history.'
  });
  return unlocked;
});
ipcMain.handle('studio:relock-toy-lock', async (_event, lockId) => {
  const relocked = await requireToyLocks().relock(lockId);
  await recordLocalHistory({
    action: 'configuration-changed',
    subject: 'toy-lock',
    subjectId: String(lockId),
    label: 'Toy lock state changed',
    detail: 'A local toy lock state changed. Sensitive values were omitted from history.'
  });
  return relocked;
});
ipcMain.handle('studio:support-ticket-status', () => requireSupportTickets().getStatus());
ipcMain.handle('studio:list-support-tickets', () => requireSupportTickets().listTickets());
ipcMain.handle('studio:create-support-ticket', async (_event, input) => {
  const created = await requireSupportTickets().createTicket(input);
  await recordLocalHistory({
    action: 'record-created',
    subject: 'support-ticket',
    subjectId: String(created.id),
    label: 'Local support ticket created',
    detail: 'A fictional local support ticket was created. Its description and sensitive values were omitted from history.'
  });
  return created;
});
ipcMain.handle('studio:acknowledge-support-ticket', async (_event, ticketId) => {
  const ticket = await requireSupportTickets().acknowledgeTicket(ticketId);
  await recordLocalHistory({
    action: 'configuration-changed',
    subject: 'support-ticket',
    subjectId: String(ticketId),
    label: 'Local support ticket advanced',
    detail: 'A fictional local support ticket advanced. Ticket details and sensitive values were omitted from history.'
  });
  return ticket;
});
ipcMain.handle('studio:open-support-ticket-recovery-folder', async (_event, ticketId) => {
  if (ticketId !== undefined && ticketId !== null && typeof ticketId !== 'string') throw new Error('Support ticket identifier is invalid.');
  const service = requireSupportTickets();
  const recoveryDirectory = service.getStatus().recoveryDirectory;
  const error = await shell.openPath(recoveryDirectory);
  if (error) throw new Error(error);
  const ticket = ticketId ? service.recordRecoveryFolderOpened(ticketId) : null;
  await recordLocalHistory({
    action: 'configuration-changed',
    subject: 'support-ticket',
    subjectId: ticketId ? String(ticketId) : 'recovery-folder',
    label: 'Local recovery folder opened',
    detail: 'The application-data recovery folder was opened by user request. No ticket content, credential, or path was recorded.'
  });
  return Object.freeze({ recoveryDirectory, ticket });
});
ipcMain.handle('studio:status-hub-bridge', () => statusHubBridge ? {
  status: statusHubBridge.getStatus(),
  configuration: statusHubBridge.getConfigurationForRenderer()
} : {
  status: unavailableBridgeStatus(),
  configuration: { endpoint: '', allowInsecureLoopback: false }
});
ipcMain.handle('studio:configure-status-hub-bridge', async (_event, configuration) => {
  const configured = await requireStatusHubBridge().configure(configuration);
  await recordLocalHistory({
    action: 'configuration-changed',
    subject: 'status-bridge',
    subjectId: 'optional-status-bridge',
    label: 'Status bridge configuration changed',
    detail: 'Optional status bridge configuration changed. Exact connection and sensitive values were omitted from history.'
  });
  return configured;
});
ipcMain.handle('studio:sync-status-hub-bridge', async () => {
  const localStatus = await requireManager().localStatusSnapshot();
  await requireStatusHubBridge().synchronize(localStatus.snapshot);
  return localStatusWithBridge();
});
ipcMain.handle('studio:refresh-spigot-versions', () => requireManager().refreshSpigotVersionMetadata());
ipcMain.handle('studio:buildtools-preflight', (_event, id, input) => requireManager().buildToolsPreflight(id, input));
ipcMain.handle('studio:execute-buildtools-plan', (_event, id, confirmation) => requireManager().executeBuildToolsPlan(id, confirmation));
ipcMain.handle('studio:paper-cli-preflight', (_event, id, profile) => requireManager().paperCliPreflight(id, profile));
ipcMain.handle('studio:paper-cli-probe', (_event, id) => requireManager().collectPaperCliJarEvidence(id));
ipcMain.handle('studio:pick-paper-cli-path', async (_event, kind) => {
  const requestedKind = String(kind || '');
  const definitions = {
    'config-file': {
      properties: ['openFile'],
      filters: [{ name: 'Paper configuration', extensions: ['yml', 'yaml', 'properties', 'txt'] }]
    },
    'pid-file': {
      properties: ['openFile'],
      filters: [{ name: 'PID file', extensions: ['pid', 'txt'] }]
    },
    directory: {
      properties: ['openDirectory', 'createDirectory']
    }
  };
  const definition = definitions[requestedKind];
  if (!definition) throw new Error('Choose a supported Paper CLI path type.');
  const result = await dialog.showOpenDialog(mainWindow, definition);
  return result.canceled ? null : result.filePaths[0];
});
ipcMain.handle('studio:plan-buildtools', (_event, id, input) => requireBuildToolsController().createPlan(id, input));
ipcMain.handle('studio:pick-java', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'Java executable', extensions: ['exe'] }]
  });
  return result.canceled ? null : result.filePaths[0];
});
ipcMain.handle('studio:runtime-inventory', async (_event, id) => requireManager().runtimeInventory(id));
ipcMain.handle('studio:configure-management', async (_event, id, configuration) => {
  const input = configuration && typeof configuration === 'object' ? configuration : {};
  const server = await requireManager().getServer(id);
  const endpoint = input.endpoint === undefined || input.endpoint === null || String(input.endpoint).trim() === ''
    ? (server.management?.endpoint || '')
    : String(input.endpoint).trim();
  const allowInsecureLoopback = input.allowInsecureLoopback === undefined
    ? Boolean(server.management?.allowInsecureLoopback)
    : Boolean(input.allowInsecureLoopback);
  if (endpoint) {
    const client = new MinecraftManagementProtocolClient({ endpoint, allowInsecureLoopback });
    client.validateEndpoint();
  }

  const token = String(input.token || '');
  const clearCredential = input.clearCredential === true;
  const existingCredential = Boolean(server.management?.credentialConfigured) || managementCredentialIsStored(id);
  if (token && clearCredential) throw new Error('Save or clear the protected management credential, not both in the same request.');
  if (token) {
    if (!credentialVault) throw new Error('The protected credential vault is unavailable in this app build.');
    credentialVault.save(credentialVault.createKey('minecraft-server-studio', `management:${id}`), token);
  }
  if (clearCredential) {
    if (!credentialVault) throw new Error('The protected credential vault is unavailable in this app build.');
    credentialVault.delete(credentialVault.createKey('minecraft-server-studio', `management:${id}`));
  }
  const updated = await requireManager().updateServer(id, {
    management: {
      endpoint,
      allowInsecureLoopback,
      credentialConfigured: token ? true : (clearCredential ? false : existingCredential)
    }
  });
  await recordLocalHistory({
    action: 'configuration-changed',
    subject: 'server',
    subjectId: String(id),
    label: 'Server management configuration changed',
    detail: 'A local server management configuration changed. Exact connection and sensitive values were omitted from history.'
  });
  return updated;
});
ipcMain.handle('studio:discover-management', async (_event, id) => {
  const server = await requireManager().getServer(id);
  const client = await managementClientFor(server, { serverId: id });
  await client.discover();
  const discovery = client.getDiscoverySnapshot();
  return requireManager().updateServer(id, {
    management: {
      discovery
    }
  });
});
ipcMain.handle('studio:invoke-management', async (_event, id, method, params) => {
  const server = await requireManager().getServer(id);
  const client = await managementClientFor(server, { serverId: id, restoreDiscovery: true });
  if (!client.hasDiscoveredMethod(method)) throw new Error(`The selected server did not advertise '${method}'.`);
  return client.invokeDiscovered(method, params || {});
});
ipcMain.handle('studio:command-catalog', async (_event, id) => requireManager().commandCatalog(id));
ipcMain.handle('studio:refresh-command-discovery', async (_event, id, input) => requireManager().refreshCommandDiscovery(id, input));
ipcMain.handle('studio:command-plan', async (_event, id, request) => requireManager().commandPlan(id, request));
ipcMain.handle('studio:backup-overview', async (_event, id) => requireManager().backupOverview(id));
ipcMain.handle('studio:backup-preflight', async (_event, id) => requireManager().prepareBackupPlan(id));
ipcMain.handle('studio:create-backup', async (_event, id, confirmation) => requireManager().createBackup(id, confirmation));
ipcMain.handle('studio:restore-preflight', async (_event, id, backupId) => requireManager().prepareRestorePlan(id, backupId));
ipcMain.handle('studio:restore-backup', async (_event, id, confirmation) => requireManager().restoreBackup(id, confirmation));
ipcMain.handle('studio:paper-update-preflight', async (_event, id) => requireManager().preparePaperUpdatePlan(id));
ipcMain.handle('studio:apply-paper-update', async (_event, id, confirmation) => requireManager().applyPaperUpdate(id, confirmation));
ipcMain.handle('studio:paper-rollback-preflight', async (_event, id) => requireManager().preparePaperRollbackPlan(id));
ipcMain.handle('studio:apply-paper-rollback', async (_event, id, confirmation) => requireManager().applyPaperRollback(id, confirmation));
ipcMain.handle('studio:update-status', () => requireUpdater().status());
ipcMain.handle('studio:check-for-updates', () => requireUpdater().checkForUpdates({ reason: 'manual' }));
ipcMain.handle('studio:set-updates-enabled', (_event, enabled) => requireUpdater().setEnabled(enabled));
ipcMain.handle('studio:defer-update', () => requireUpdater().deferUpdate());
ipcMain.handle('studio:restart-for-update', () => requireUpdater().restartForUpdate(queryRendererUnsavedWork));
ipcMain.handle('studio:open-update-notes', async () => {
  const releaseNotesUrl = requireUpdater().status().releaseNotesUrl;
  const url = releaseNotesUrl ? new URL(releaseNotesUrl) : null;
  const expectedPrefix = '/Ding-Ding-Projects/minecraft-server-studio/releases/';
  if (!url || url.protocol !== 'https:' || url.hostname !== 'github.com' || !url.pathname.startsWith(expectedPrefix)) throw new Error('No verified public release-notes link is available for this update state.');
  await shell.openExternal(url.toString());
});
