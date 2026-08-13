const state = {
  servers: [],
  selectedId: null,
  dependencies: null,
  dependencyErrors: {},
  logs: [],
  localStatus: null,
  buildToolsMetadata: null,
  buildToolsPlan: null,
  activeTab: 'general',
  pluginPath: '',
  experience: null
};

const ADVANCED_FIELDS = [
  { key: 'accepts-transfers', label: 'Accept player transfers', type: 'boolean', help: 'Allow compatible server-transfer requests.' },
  { key: 'broadcast-console-to-ops', label: 'Broadcast console messages to operators', type: 'boolean', help: 'Forward console output to online operators.' },
  { key: 'bug-report-link', label: 'Bug report link', type: 'url', help: 'Optional URL included in crash reporting context.' },
  { key: 'debug', label: 'Debug logging', type: 'boolean', help: 'Enable additional server debug output.' },
  { key: 'enable-jmx-monitoring', label: 'Enable JMX monitoring', type: 'boolean', help: 'Expose Java management metrics for supported monitoring tools.' },
  { key: 'enable-status', label: 'Enable server-list status', type: 'boolean', help: 'Respond to normal Minecraft status pings.' },
  { key: 'enforce-whitelist', label: 'Enforce whitelist after reload', type: 'boolean', help: 'Remove non-whitelisted players after whitelist updates.' },
  { key: 'generator-settings', label: 'Generator settings', type: 'text', help: 'Version-specific generator configuration text.' },
  { key: 'initial-disabled-packs', label: 'Initially disabled data packs', type: 'text', help: 'Comma-separated pack IDs for new worlds.' },
  { key: 'initial-enabled-packs', label: 'Initially enabled data packs', type: 'text', help: 'Comma-separated pack IDs for new worlds.' },
  { key: 'log-ips', label: 'Log player IP addresses', type: 'boolean', help: 'Include IP addresses in Minecraft server logs.' },
  { key: 'max-chained-neighbor-updates', label: 'Maximum chained neighbor updates', type: 'number', min: 1, max: 100000000, help: 'Bound chained redstone and block updates.' },
  { key: 'max-tick-time', label: 'Maximum tick time (ms)', type: 'number', min: -1, max: 2147483647, help: 'Use -1 to disable the watchdog limit.' },
  { key: 'network-compression-threshold', label: 'Network compression threshold (bytes)', type: 'number', min: -1, max: 2147483647, help: 'Use -1 to disable packet compression.' },
  { key: 'pause-when-empty-seconds', label: 'Pause when empty (seconds)', type: 'number', min: -1, max: 2147483647, help: 'Use -1 when the server version does not support empty-server pause.' },
  { key: 'rate-limit', label: 'Packet rate limit', type: 'number', min: 0, max: 2147483647, help: 'Set 0 to disable the packet-rate limit.' },
  { key: 'region-file-compression', label: 'Region file compression', type: 'select', options: [['deflate', 'Deflate'], ['lz4', 'LZ4'], ['none', 'None']], help: 'Choose the region file storage compression supported by the selected version.' },
  { key: 'require-resource-pack', label: 'Require resource pack', type: 'boolean', help: 'Disconnect clients that decline the configured resource pack.' },
  { key: 'resource-pack-id', label: 'Resource pack identifier', type: 'text', help: 'Optional UUID for resource-pack updates.' },
  { key: 'resource-pack-sha1', label: 'Resource pack SHA-1', type: 'text', help: 'Optional checksum value provided by the pack publisher.' },
  { key: 'server-ip', label: 'Server bind address', type: 'text', help: 'Leave empty to listen on all local network interfaces.' },
  { key: 'spawn-npcs', label: 'Spawn NPCs', type: 'boolean', help: 'Allow villagers and other NPCs to spawn naturally.' },
  { key: 'text-filtering-config', label: 'Text filtering configuration', type: 'url', help: 'Optional server-side text filtering service URL.' },
  { key: 'use-native-transport', label: 'Use native transport', type: 'boolean', help: 'Use the platform-native network transport when supported.' }
];

const FALLBACK_COMMAND_CATALOG = {
  source: 'Built-in registry seed',
  families: [
    { id: 'lifecycle', label: 'Lifecycle and diagnostics', actions: [
      { id: 'save-all', label: 'Save all worlds', command: 'save-all', fields: [], risk: 'safe', transports: ['protocol', 'local', 'rcon'] },
      { id: 'save-on', label: 'Enable saving', command: 'save-on', fields: [], risk: 'safe', transports: ['local', 'rcon'] },
      { id: 'save-off', label: 'Disable saving', command: 'save-off', fields: [], risk: 'consequential', transports: ['local', 'rcon'], backup: true },
      { id: 'stop', label: 'Stop server', command: 'stop', fields: [], risk: 'consequential', transports: ['protocol', 'local', 'rcon'], backup: true },
      { id: 'reload', label: 'Reload (deprecated warning)', command: 'reload', fields: [], risk: 'consequential', transports: ['local', 'rcon'], deprecated: true },
      { id: 'tick', label: 'Tick diagnostics', command: 'tick query', fields: [], risk: 'safe', transports: ['local', 'rcon'] }
    ] },
    { id: 'moderation', label: 'Moderation and access', actions: [
      { id: 'list', label: 'List online players', command: 'list', fields: [], risk: 'safe', transports: ['protocol', 'local', 'rcon'] },
      { id: 'op', label: 'Grant operator', command: 'op', fields: [{ id: 'player', label: 'Player name or UUID', type: 'text', required: true, maxLength: 64 }], risk: 'consequential', transports: ['protocol', 'local', 'rcon'] },
      { id: 'deop', label: 'Remove operator', command: 'deop', fields: [{ id: 'player', label: 'Player name or UUID', type: 'text', required: true, maxLength: 64 }], risk: 'consequential', transports: ['protocol', 'local', 'rcon'] },
      { id: 'allowlist-add', label: 'Add to allowlist', command: 'whitelist add', fields: [{ id: 'player', label: 'Player name or UUID', type: 'text', required: true, maxLength: 64 }], risk: 'consequential', transports: ['protocol', 'local', 'rcon'] },
      { id: 'kick', label: 'Kick player', command: 'kick', fields: [{ id: 'player', label: 'Player name or UUID', type: 'text', required: true, maxLength: 64 }, { id: 'reason', label: 'Reason', type: 'text', maxLength: 256 }], risk: 'consequential', transports: ['protocol', 'local', 'rcon'] }
    ] },
    { id: 'settings', label: 'Settings and gamerules', actions: [
      { id: 'gamerule', label: 'Set gamerule', command: 'gamerule', fields: [{ id: 'rule', label: 'Rule name', type: 'text', required: true, maxLength: 128 }, { id: 'value', label: 'Value', type: 'text', required: true, maxLength: 256 }], risk: 'consequential', transports: ['protocol', 'local', 'rcon'] },
      { id: 'difficulty', label: 'Set difficulty', command: 'difficulty', fields: [{ id: 'value', label: 'Difficulty', type: 'select', options: ['peaceful', 'easy', 'normal', 'hard'], required: true }], risk: 'consequential', transports: ['protocol', 'local', 'rcon'] },
      { id: 'defaultgamemode', label: 'Set default game mode', command: 'defaultgamemode', fields: [{ id: 'value', label: 'Default mode', type: 'select', options: ['survival', 'creative', 'adventure', 'spectator'], required: true }], risk: 'consequential', transports: ['protocol', 'local', 'rcon'] }
    ] },
    { id: 'world', label: 'World and gameplay', actions: [
      { id: 'time', label: 'Set time', command: 'time set', fields: [{ id: 'value', label: 'Time', type: 'select', options: ['day', 'night', 'noon', 'midnight'], required: true }], risk: 'consequential', transports: ['protocol', 'local', 'rcon'] },
      { id: 'weather', label: 'Set weather', command: 'weather', fields: [{ id: 'value', label: 'Weather', type: 'select', options: ['clear', 'rain', 'thunder'], required: true }], risk: 'consequential', transports: ['protocol', 'local', 'rcon'] },
      { id: 'worldborder', label: 'Set world border', command: 'worldborder set', fields: [{ id: 'distance', label: 'Diameter', type: 'number', min: 1, max: 59999968, required: true }], risk: 'consequential', transports: ['protocol', 'local', 'rcon'] },
      { id: 'setworldspawn', label: 'Set world spawn', command: 'setworldspawn', fields: [{ id: 'position', label: 'Position', type: 'text', maxLength: 128 }], risk: 'consequential', transports: ['protocol', 'local', 'rcon'] }
    ] },
    { id: 'entity', label: 'Entity and player', actions: [
      { id: 'give', label: 'Give item', command: 'give', fields: [{ id: 'target', label: 'Target', type: 'text', required: true, maxLength: 128 }, { id: 'item', label: 'Item ID', type: 'text', required: true, maxLength: 256 }, { id: 'count', label: 'Count', type: 'number', min: 1, max: 2147483647 }], risk: 'consequential', transports: ['protocol', 'local', 'rcon'] },
      { id: 'teleport', label: 'Teleport', command: 'teleport', fields: [{ id: 'target', label: 'Target', type: 'text', required: true, maxLength: 128 }, { id: 'destination', label: 'Destination', type: 'text', required: true, maxLength: 128 }], risk: 'consequential', transports: ['protocol', 'local', 'rcon'] },
      { id: 'effect', label: 'Apply effect', command: 'effect give', fields: [{ id: 'target', label: 'Target', type: 'text', required: true, maxLength: 128 }, { id: 'effect', label: 'Effect ID', type: 'text', required: true, maxLength: 128 }, { id: 'seconds', label: 'Seconds', type: 'number', min: 1, max: 1000000 }], risk: 'consequential', transports: ['protocol', 'local', 'rcon'] },
      { id: 'summon', label: 'Summon entity', command: 'summon', fields: [{ id: 'entity', label: 'Entity ID', type: 'text', required: true, maxLength: 256 }, { id: 'position', label: 'Position', type: 'text', maxLength: 128 }], risk: 'consequential', transports: ['protocol', 'local', 'rcon'] }
    ] },
    { id: 'terrain', label: 'Terrain, data, and automation', actions: [
      { id: 'setblock', label: 'Set block', command: 'setblock', fields: [{ id: 'position', label: 'Position', type: 'text', required: true, maxLength: 128 }, { id: 'block', label: 'Block ID', type: 'text', required: true, maxLength: 256 }], risk: 'consequential', transports: ['protocol', 'local', 'rcon'] },
      { id: 'fill', label: 'Fill region', command: 'fill', fields: [{ id: 'from', label: 'From position', type: 'text', required: true, maxLength: 128 }, { id: 'to', label: 'To position', type: 'text', required: true, maxLength: 128 }, { id: 'block', label: 'Block ID', type: 'text', required: true, maxLength: 256 }], risk: 'destructive', transports: ['protocol', 'local', 'rcon'], backup: true },
      { id: 'function', label: 'Run function', command: 'function', fields: [{ id: 'name', label: 'Function identifier', type: 'text', required: true, maxLength: 256 }], risk: 'consequential', transports: ['protocol', 'local', 'rcon'] },
      { id: 'scoreboard', label: 'Scoreboard command', command: 'scoreboard', fields: [{ id: 'tokens', label: 'Structured scoreboard tokens', type: 'text', required: true, maxLength: 512 }], risk: 'consequential', transports: ['protocol', 'local', 'rcon'] }
    ] },
    { id: 'communication', label: 'Communication and effects', actions: [
      { id: 'say', label: 'Broadcast message', command: 'say', fields: [{ id: 'message', label: 'Message', type: 'text', required: true, maxLength: 512 }], risk: 'safe', transports: ['protocol', 'local', 'rcon'] },
      { id: 'tellraw', label: 'Send rich chat JSON', command: 'tellraw', fields: [{ id: 'target', label: 'Target', type: 'text', required: true, maxLength: 128 }, { id: 'json', label: 'Chat JSON', type: 'text', required: true, maxLength: 2048 }], risk: 'consequential', transports: ['protocol', 'local', 'rcon'] },
      { id: 'title', label: 'Display title', command: 'title', fields: [{ id: 'target', label: 'Target', type: 'text', required: true, maxLength: 128 }, { id: 'tokens', label: 'Title tokens', type: 'text', required: true, maxLength: 512 }], risk: 'safe', transports: ['protocol', 'local', 'rcon'] },
      { id: 'playsound', label: 'Play sound', command: 'playsound', fields: [{ id: 'sound', label: 'Sound ID', type: 'text', required: true, maxLength: 256 }, { id: 'target', label: 'Target', type: 'text', required: true, maxLength: 128 }], risk: 'safe', transports: ['protocol', 'local', 'rcon'] }
    ] },
    { id: 'content', label: 'Data packs and content', actions: [
      { id: 'datapack', label: 'Data pack action', command: 'datapack', fields: [{ id: 'tokens', label: 'Data pack tokens', type: 'text', required: true, maxLength: 512 }], risk: 'consequential', transports: ['protocol', 'local', 'rcon'] },
      { id: 'paper', label: 'Paper command (capability-badged)', command: 'paper', fields: [{ id: 'tokens', label: 'Paper subcommand tokens', type: 'text', maxLength: 1024 }], risk: 'consequential', transports: ['local', 'rcon'], runtimeDiscovery: true },
      { id: 'plugin', label: 'Plugin command', command: '', fields: [{ id: 'tokens', label: 'Plugin command tokens', type: 'text', required: true, maxLength: 1024 }], risk: 'consequential', transports: ['local', 'rcon'], runtimeDiscovery: true }
    ] }
  ]
};

let commandCatalog = FALLBACK_COMMAND_CATALOG;
let selectedCommandAction = null;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const FALLBACK_EXPERIENCE = Object.freeze({
  local: Object.freeze({ language: 'english', funnyLevels: Object.freeze({ english: 2, cantonese: 3 }), dialogEmoji: true, displayName: 'Minecraft Server Studio' }),
  shared: Object.freeze({ state: 'not-loaded', effectiveSchoolMode: true, schoolMode: Object.freeze({ enabled: false, label: 'Mode' }) }),
  credential: Object.freeze({ state: 'unavailable', configured: false })
});

function currentExperience() {
  return state.experience || FALLBACK_EXPERIENCE;
}

function currentExperienceLocal() {
  return currentExperience().local || FALLBACK_EXPERIENCE.local;
}

function currentSchoolMode() {
  return currentExperience().shared || FALLBACK_EXPERIENCE.shared;
}

function effectiveLanguage() {
  const local = currentExperienceLocal();
  if (currentSchoolMode().effectiveSchoolMode) return 'english';
  return ['english', 'cantonese', 'bilingual'].includes(local.language) ? local.language : 'english';
}

function copyText(key, values = {}) {
  const copy = window.StudioExperienceCopy;
  return copy?.format ? copy.format(key, effectiveLanguage(), values) : key;
}

function toneText(language, level) {
  const copy = window.StudioExperienceCopy;
  return copy?.tone ? copy.tone(language, level) : String(level);
}

function toastPrefix(kind) {
  const copy = window.StudioExperienceCopy;
  return copy?.toastPrefix
    ? copy.toastPrefix(effectiveLanguage(), currentExperienceLocal().funnyLevels, kind)
    : kind;
}

function messageText(message) {
  if (message && typeof message === 'object' && typeof message.key === 'string') return copyText(message.key, message.values || {});
  return String(message || '');
}

function selectedServer() {
  return state.servers.find((server) => server.id === state.selectedId) || null;
}

function toast(message, kind = 'info') {
  const item = document.createElement('div');
  item.className = `toast ${kind}`;
  if (currentExperienceLocal().dialogEmoji) {
    const decoration = document.createElement('span');
    decoration.className = 'toast-emoji';
    decoration.setAttribute('aria-hidden', 'true');
    decoration.textContent = kind === 'error' ? '⚠️' : kind === 'success' ? '✓' : 'ℹ️';
    item.append(decoration);
  }
  const copy = document.createElement('span');
  copy.className = 'toast-copy';
  copy.textContent = `${toastPrefix(kind)}: ${messageText(message)}`;
  item.append(copy);
  $('#toast-region').append(item);
  setTimeout(() => item.remove(), kind === 'error' ? 9000 : 5000);
}

async function safely(work, successMessage) {
  try {
    const result = await work();
    if (successMessage) toast(successMessage, 'success');
    return result;
  } catch (error) {
    toast(error?.message || String(error), 'error');
    return null;
  }
}

function applyDialogEmojiSetting() {
  const visible = Boolean(currentExperienceLocal().dialogEmoji);
  $$('.dialog-emoji').forEach((element) => {
    element.hidden = !visible;
  });
}

function applySchoolModePresentation() {
  const school = currentSchoolMode();
  const active = Boolean(school.effectiveSchoolMode);
  document.body.classList.toggle('school-mode-active', active);
  const hiddenSections = $$('[data-school-hidden]');
  const hadHiddenFocus = active && hiddenSections.some((element) => element.contains(document.activeElement));
  hiddenSections.forEach((element) => {
    element.hidden = active;
    element.querySelectorAll('input, select, textarea, button').forEach((control) => {
      control.disabled = active;
    });
  });
  $$('[data-school-suppressed-route]').forEach((element) => {
    element.hidden = active;
    element.querySelectorAll('input, select, textarea, button, a').forEach((control) => {
      control.setAttribute('tabindex', active ? '-1' : '0');
    });
  });
  if (hadHiddenFocus) $('#school-mode-label')?.focus();
}

function applyLocalizedCopy() {
  const language = effectiveLanguage();
  document.documentElement.lang = language === 'cantonese' ? 'zh-Hant' : 'en';
  document.title = currentExperienceLocal().displayName;
  $$('[data-i18n]').forEach((element) => {
    element.textContent = copyText(element.dataset.i18n);
  });
  $$('[data-i18n-placeholder]').forEach((element) => {
    element.placeholder = copyText(element.dataset.i18nPlaceholder);
  });
  $$('[data-i18n-display-name]').forEach((element) => {
    element.textContent = copyText(element.dataset.i18nDisplayName, { appName: currentExperienceLocal().displayName });
  });
  const schoolLabel = currentSchoolMode().schoolMode?.label || FALLBACK_EXPERIENCE.shared.schoolMode.label;
  $$('[data-i18n-school-label]').forEach((element) => {
    element.textContent = copyText(element.dataset.i18nSchoolLabel, { label: schoolLabel });
  });
  const copy = window.StudioExperienceCopy;
  if (copy?.brandingEyebrow) {
    $('#brand-eyebrow').textContent = copy.brandingEyebrow(language, currentExperienceLocal().funnyLevels);
  }
  $('#brand-title').textContent = currentExperienceLocal().displayName;
  $('#close-experience-settings-dialog')?.setAttribute('aria-label', copyText('settings.close'));
  applyDialogEmojiSetting();
  applySchoolModePresentation();
}

function renderFunnyLevelOutputs() {
  const local = currentExperienceLocal();
  const english = $('#funny-english');
  const cantonese = $('#funny-cantonese');
  if (english) {
    english.value = String(local.funnyLevels.english);
    $('#funny-english-output').textContent = `1–5 · ${toneText('english', local.funnyLevels.english)}`;
  }
  if (cantonese) {
    cantonese.value = String(local.funnyLevels.cantonese);
    $('#funny-cantonese-output').textContent = `1–5 · ${toneText('cantonese', local.funnyLevels.cantonese)}`;
  }
}

function previewFunnyLevelOutputs() {
  const english = $('#funny-english');
  const cantonese = $('#funny-cantonese');
  if (english) $('#funny-english-output').textContent = `1–5 · ${toneText('english', Number(english.value))}`;
  if (cantonese) $('#funny-cantonese-output').textContent = `1–5 · ${toneText('cantonese', Number(cantonese.value))}`;
}

function renderSchoolModeControls() {
  const experience = currentExperience();
  const shared = experience.shared || FALLBACK_EXPERIENCE.shared;
  const mode = shared.schoolMode || FALLBACK_EXPERIENCE.shared.schoolMode;
  const credential = experience.credential || FALLBACK_EXPERIENCE.credential;
  const recordReady = shared.state === 'ready';
  const label = mode.label || FALLBACK_EXPERIENCE.shared.schoolMode.label;
  const status = $('#school-mode-status');
  const toggle = $('#school-mode-enabled');
  const createRecord = $('#create-school-mode-record-button');
  const saveLabel = $('#save-school-mode-label-button');
  const saveCredential = $('#save-school-mode-credential-button');
  if (!status || !toggle || !createRecord || !saveLabel || !saveCredential) return;

  $('#school-mode-label').value = label;
  $('#school-mode-title').textContent = copyText('settings.schoolTitle', { label });
  $('#school-mode-toggle-label').textContent = copyText('settings.schoolEnabled', { label });
  $('#school-mode-recovery-path').textContent = shared.location || 'Shared local application-data folder unavailable.';

  toggle.indeterminate = !recordReady;
  toggle.checked = recordReady ? Boolean(mode.enabled) : false;
  toggle.disabled = !recordReady || credential.state !== 'ready' || !credential.configured;
  saveLabel.disabled = !recordReady;
  saveCredential.disabled = !recordReady || credential.state !== 'ready';
  createRecord.hidden = shared.state !== 'missing';
  createRecord.disabled = shared.state !== 'missing';

  if (!recordReady) {
    status.textContent = shared.state === 'missing'
      ? copyText('settings.schoolRecordMissing')
      : copyText('settings.schoolRecordUnavailable');
    status.dataset.state = shared.state || 'unavailable';
    return;
  }
  if (credential.state !== 'ready') {
    status.textContent = copyText('settings.credentialUnavailable');
    status.dataset.state = 'unavailable';
    return;
  }
  if (!credential.configured) {
    status.textContent = copyText('settings.credentialRequired');
    status.dataset.state = 'missing';
    return;
  }
  status.textContent = mode.enabled
    ? copyText('settings.schoolActive', { label })
    : copyText('settings.schoolInactive', { label });
  status.dataset.state = mode.enabled ? 'active' : 'ready';
}

function hydrateExperienceControls() {
  const local = currentExperienceLocal();
  const languageValue = ['english', 'cantonese', 'bilingual'].includes(local.language) ? local.language : 'english';
  const language = document.querySelector(`input[name="language-mode"][value="${languageValue}"]`);
  if (language) language.checked = true;
  $('#dialog-emoji').checked = Boolean(local.dialogEmoji);
  $('#experience-display-name').value = local.displayName;
  renderFunnyLevelOutputs();
  renderSchoolModeControls();
}

function applyExperienceSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return;
  state.experience = snapshot;
  applyLocalizedCopy();
  hydrateExperienceControls();
  renderServers();
  renderEditor();
  renderConsole();
}

function openExperienceSettings() {
  hydrateExperienceControls();
  const dialog = $('#experience-settings-dialog');
  if (dialog && !dialog.open) dialog.showModal();
}

function closeExperienceSettings() {
  const dialog = $('#experience-settings-dialog');
  if (dialog?.open) dialog.close();
}

async function saveExperienceSettings(event) {
  event.preventDefault();
  const local = currentExperienceLocal();
  const activeSchoolMode = Boolean(currentSchoolMode().effectiveSchoolMode);
  const selectedLanguage = document.querySelector('input[name="language-mode"]:checked')?.value || local.language;
  const snapshot = await safely(() => window.studio.updateExperienceSettings({
    language: activeSchoolMode ? local.language : selectedLanguage,
    funnyLevels: activeSchoolMode
      ? local.funnyLevels
      : { english: Number($('#funny-english').value), cantonese: Number($('#funny-cantonese').value) },
    dialogEmoji: $('#dialog-emoji').checked,
    displayName: $('#experience-display-name').value
  }), { key: 'toast.presentationSaved' });
  if (snapshot) applyExperienceSnapshot(snapshot);
}

async function createSchoolModeRecord() {
  const snapshot = await safely(() => window.studio.createSchoolModeRecord(), { key: 'toast.schoolRecordCreated' });
  if (snapshot) applyExperienceSnapshot(snapshot);
}

async function saveSchoolModeLabel() {
  const snapshot = await safely(() => window.studio.updateSchoolModeLabel($('#school-mode-label').value), { key: 'toast.schoolLabelSaved' });
  if (snapshot) applyExperienceSnapshot(snapshot);
}

async function saveSchoolModeCredential() {
  const currentCredential = $('#school-mode-current-credential').value;
  const newCredential = $('#school-mode-new-credential').value;
  const confirmation = $('#school-mode-confirm-credential').value;
  if (newCredential !== confirmation) {
    toast('The new unlock password or PIN and its confirmation do not match.', 'error');
    return;
  }
  const snapshot = await safely(() => window.studio.saveSchoolModeCredential({ currentCredential, newCredential }), { key: 'toast.credentialSaved' });
  if (snapshot) {
    $('#school-mode-current-credential').value = '';
    $('#school-mode-new-credential').value = '';
    $('#school-mode-confirm-credential').value = '';
    applyExperienceSnapshot(snapshot);
  }
}

async function changeSchoolMode() {
  const toggle = $('#school-mode-enabled');
  const desired = toggle.checked;
  const label = currentSchoolMode().schoolMode?.label || 'Mode';
  const snapshot = await safely(() => window.studio.setSchoolMode({
    enabled: desired,
    credential: desired ? '' : $('#school-mode-current-credential').value
  }), desired
    ? { key: 'toast.schoolEnabled', values: { label } }
    : { key: 'toast.schoolDisabled', values: { label } });
  if (snapshot) {
    $('#school-mode-current-credential').value = '';
    applyExperienceSnapshot(snapshot);
  } else {
    hydrateExperienceControls();
  }
}

function propertyInput(id, value) {
  const element = $(`#${id}`);
  if (!element) return;
  if (element.type === 'checkbox') element.checked = String(value) === 'true';
  else element.value = value ?? '';
}

function propertyValue(id) {
  const element = $(`#${id}`);
  return element.type === 'checkbox' ? String(element.checked) : element.value;
}

function settingsFromForm() {
  const settings = {
    'motd': propertyValue('motd'),
    'online-mode': propertyValue('online-mode'),
    'white-list': propertyValue('white-list'),
    'level-name': propertyValue('level-name'),
    'level-seed': propertyValue('level-seed'),
    'level-type': propertyValue('level-type'),
    'spawn-protection': propertyValue('spawn-protection'),
    'max-world-size': propertyValue('max-world-size'),
    'generate-structures': propertyValue('generate-structures'),
    'gamemode': propertyValue('gamemode'),
    'difficulty': propertyValue('difficulty'),
    'max-players': propertyValue('max-players'),
    'player-idle-timeout': propertyValue('player-idle-timeout'),
    'view-distance': propertyValue('view-distance'),
    'simulation-distance': propertyValue('simulation-distance'),
    'hardcore': propertyValue('hardcore'),
    'allow-flight': propertyValue('allow-flight'),
    'spawn-animals': propertyValue('spawn-animals'),
    'force-gamemode': propertyValue('force-gamemode'),
    'server-port': propertyValue('server-port'),
    'query.port': propertyValue('query-port'),
    'rcon.port': propertyValue('rcon-port'),
    'rcon.password': propertyValue('rcon-password'),
    'op-permission-level': propertyValue('op-permission-level'),
    'function-permission-level': propertyValue('function-permission-level'),
    'enable-query': propertyValue('enable-query'),
    'enable-rcon': propertyValue('enable-rcon'),
    'broadcast-rcon-to-ops': propertyValue('broadcast-rcon-to-ops'),
    'enforce-secure-profile': propertyValue('enforce-secure-profile'),
    'prevent-proxy-connections': propertyValue('prevent-proxy-connections'),
    'entity-broadcast-range-percentage': propertyValue('entity-broadcast-range'),
    'resource-pack': propertyValue('resource-pack'),
    'resource-pack-prompt': propertyValue('resource-pack-prompt'),
    'sync-chunk-writes': propertyValue('sync-chunk-writes'),
    'hide-online-players': propertyValue('hide-online-players')
  };
  $$('.advanced-control').forEach((control) => {
    settings[control.dataset.property] = control.type === 'checkbox' ? String(control.checked) : control.value;
  });
  return settings;
}

function gameRulesFromForm() {
  return {
    pvp: $('#gamerule-pvp').checked,
    allowEnteringNetherUsingPortals: $('#gamerule-allowEnteringNetherUsingPortals').checked,
    spawnMonsters: $('#gamerule-spawnMonsters').checked,
    commandBlocksEnabled: $('#gamerule-commandBlocksEnabled').checked
  };
}

function renderAdvancedControls() {
  const container = $('#advanced-controls');
  container.replaceChildren();
  for (const field of ADVANCED_FIELDS) {
    if (field.type === 'boolean') {
      const label = document.createElement('label');
      label.className = 'switch-field';
      const control = document.createElement('input');
      control.type = 'checkbox';
      control.className = 'advanced-control';
      control.dataset.property = field.key;
      const copy = document.createElement('span');
      copy.innerHTML = `<strong>${escapeHtml(field.label)}</strong><small>${escapeHtml(field.help)}</small>`;
      label.append(control, copy);
      container.append(label);
      continue;
    }
    const label = document.createElement('label');
    label.className = 'field';
    const title = document.createElement('span');
    title.textContent = field.label;
    let control;
    if (field.type === 'select') {
      control = document.createElement('select');
      for (const [value, text] of field.options) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = text;
        control.append(option);
      }
    } else {
      control = document.createElement('input');
      control.type = field.type === 'url' ? 'url' : field.type === 'number' ? 'number' : 'text';
      if (field.min !== undefined) control.min = String(field.min);
      if (field.max !== undefined) control.max = String(field.max);
    }
    control.className = 'advanced-control';
    control.dataset.property = field.key;
    const help = document.createElement('small');
    help.textContent = field.help;
    label.append(title, control, help);
    container.append(label);
  }
}

function currentCommandFamily() {
  return commandCatalog.families.find((family) => family.id === $('#command-family')?.value) || commandCatalog.families[0] || null;
}

function currentCommandAction() {
  const family = currentCommandFamily();
  return family?.actions.find((action) => action.id === $('#command-action')?.value) || family?.actions[0] || null;
}

function commandFieldValue(field) {
  const input = document.querySelector(`[data-command-field="${CSS.escape(field.id)}"]`);
  return input ? String(input.value || '').trim() : '';
}

function buildStructuredCommand(action) {
  if (!action) return '';
  const tokens = String(action.command || '').trim().split(/\s+/).filter(Boolean);
  for (const field of action.fields || []) {
    const value = commandFieldValue(field);
    if (field.required && !value) return '';
    if (value) tokens.push(value);
  }
  return tokens.join(' ').trim();
}

function commandValuesFromForm(action) {
  const values = {};
  for (const field of action?.fields || []) values[field.id] = commandFieldValue(field);
  return values;
}

function commandMethodFor(action) {
  const selected = selectedServer();
  const capabilities = selected?.management?.capabilities || [];
  const exact = action?.protocolMethod || action?.protocolOperation || null;
  if (exact && capabilities.includes(exact)) return exact;
  const candidates = [
    `commands.${action?.id}`,
    `command.${action?.id}`,
    `operations.${action?.id}`,
    action?.id
  ].filter(Boolean);
  return candidates.find((candidate) => capabilities.includes(candidate)) || null;
}

function managementProtocolMessage(management) {
  const authentication = management?.authentication || {};
  if (authentication.state === 'provider-adapter-required') {
    return authentication.message || 'A protected credential is stored, but no documented provider-specific authentication adapter is available. The generic WebSocket transport will not send it.';
  }
  const state = management?.state || 'not-configured';
  if (state === 'ready') return 'The current endpoint-bound discovery allowlist is available.';
  if (state === 'discovery-expired') return 'The saved discovery allowlist expired. Run live capability discovery again before invoking a method.';
  if (state === 'discovery-endpoint-changed') return 'The saved discovery allowlist belongs to a different endpoint. Run live capability discovery again.';
  if (state === 'discovery-invalid') return 'The saved discovery metadata is invalid. Run live capability discovery again.';
  if (state === 'configured') return 'Run live capability discovery before selecting a protocol operation.';
  return 'Configure a management endpoint and run live capability discovery before selecting a protocol operation.';
}

function rawCommandTransportState(requested) {
  const server = selectedServer();
  if (requested === 'protocol' || requested === 'lifecycle') {
    return {
      executable: false,
      message: 'The raw token composer does not call an arbitrary management-protocol method or host lifecycle action. Choose a local console or RCON route.',
      source: 'Raw token composer',
      protocolMethod: null,
      route: registryRouteForTransport(requested)
    };
  }
  if (requested === 'local') {
    const available = server?.status === 'running';
    return {
      executable: available,
      message: available
        ? 'Raw tokens are not a command-availability claim; they will be sent only to the running local Minecraft console.'
        : 'Start the selected local server process before sending raw tokenized Minecraft command text.',
      source: 'Raw token composer',
      protocolMethod: null,
      route: 'local-console'
    };
  }
  const available = Boolean(server?.settings?.['enable-rcon'] === 'true' && server?.rconSecretConfigured);
  return {
    executable: available,
    message: available
      ? 'Raw tokens are not a command-availability claim; they will be sent only through the selected protected loopback RCON route.'
      : 'Enable RCON and save its protected local credential before sending raw tokenized command text.',
    source: 'Raw token composer',
    protocolMethod: null,
    route: 'rcon'
  };
}

function actionTransportState(action, rawFallback = false) {
  const select = $('#command-transport');
  const requested = select?.value || 'local';
  if (rawFallback) return rawCommandTransportState(requested);
  const management = selectedServer()?.management || {};
  const execution = action?.execution;
  if (requested === 'protocol' && management.state !== 'ready') {
    return {
      executable: false,
      message: managementProtocolMessage(management),
      source: 'Protocol unavailable',
      protocolMethod: null,
      route: registryRouteForTransport(requested)
    };
  }
  if (execution) {
    const route = requested === 'protocol' ? execution.protocol
      : requested === 'local' ? execution.localConsole
        : requested === 'rcon' ? execution.rcon
          : execution.hostLifecycle;
    const source = requested === 'protocol' ? 'Discovered management protocol'
      : requested === 'local' ? 'Local child-process console'
        : requested === 'rcon' ? 'RCON fallback'
          : 'Local lifecycle manager';
    return {
      executable: Boolean(route?.executable),
      message: route?.executable ? `Available through ${source.toLowerCase()}.` : (execution.fallback || `This action is not currently available through ${source.toLowerCase()}.`),
      source,
      protocolMethod: execution.protocol?.method || null,
      route: route?.route || registryRouteForTransport(requested),
      metadata: execution
    };
  }
  const supported = action?.transports || [];
  const protocolMethod = commandMethodFor(action);
  if (requested === 'protocol') {
    if (!protocolMethod) return { executable: false, message: 'This action is not advertised by the current endpoint-bound management protocol allowlist.', source: 'Protocol unavailable', protocolMethod: null };
    return { executable: true, message: `Advertised as ${protocolMethod}.`, source: 'Management protocol', protocolMethod };
  }
  if (!supported.includes(requested)) return { executable: false, message: `This action is not represented by the ${requested} fallback.`, source: 'Registry constraint', protocolMethod: null };
  if (requested === 'local' && selectedServer()?.status !== 'running') return { executable: false, message: 'Start the local server process before using its console transport.', source: 'Local console', protocolMethod: null };
  if (requested === 'rcon') return { executable: true, message: 'RCON validates its own enabled/password/connection state when sent.', source: 'RCON fallback', protocolMethod: null };
  return { executable: true, message: 'The command will be sent to the local managed process.', source: 'Local console fallback', protocolMethod: null };
}

function registryRouteForTransport(transport) {
  return ({ protocol: 'runtime-protocol', local: 'local-console', rcon: 'rcon', lifecycle: 'host-lifecycle' })[transport] || 'local-console';
}

function updateCommandPreview() {
  const action = currentCommandAction();
  selectedCommandAction = action;
  const structured = buildStructuredCommand(action);
  const raw = $('#command-raw-tokens')?.value.trim();
  const command = raw || structured;
  const stateForAction = actionTransportState(action, Boolean(raw));
  $('#command-preview').textContent = command ? `/${command}` : 'Complete the required rich fields or use the tokenized fallback.';
  $('#command-source-badge').textContent = stateForAction.source;
  $('#command-capability-state').textContent = stateForAction.message;
  const runtime = commandCatalog.runtime || {};
  const discovery = commandCatalog.discovered || {};
  const discoverySummary = `${Array.isArray(discovery.jarProbes) ? discovery.jarProbes.length : 0} selected-JAR probe(s), ${Array.isArray(discovery.liveResponses) ? discovery.liveResponses.length : 0} live response(s)`;
  const origin = action?.origin || {};
  const evidence = (action?.badges || []).map((badge) => `${badge.label || badge.id}: ${badge.state}`).join(' · ');
  const originParts = raw
    ? ['Origin: user-supplied bounded Minecraft tokens', 'Command existence and permission are not asserted by the registry.']
    : [
      `Origin: ${origin.label || origin.source || 'built-in command schema'}`,
      origin.plugin ? `Plugin: ${origin.plugin}` : null,
      origin.permission ? `Permission: ${origin.permission}` : null,
      runtime.flavor && runtime.flavor !== 'unknown' ? `Runtime: ${runtime.flavor}${runtime.minecraftVersion ? ` ${runtime.minecraftVersion}` : ''}` : null,
      evidence ? `Evidence: ${evidence}` : null,
      `Captured sources: ${discoverySummary}`
    ].filter(Boolean);
  $('#command-origin-copy').textContent = originParts.join(' · ') || 'Origin and runtime evidence are not available yet.';
  const risk = action?.risk || 'safe';
  const notices = [];
  if (action?.deprecated) notices.push('Deprecated in some server versions; inspect source/runtime help before use.');
  if (action?.runtimeDiscovery) notices.push('Runtime help or plugin metadata determines availability.');
  if (action?.backup) notices.push('A backup/affected-resource preview is required before this action can run.');
  notices.push(risk === 'destructive' ? 'Destructive action: two-key confirmation and full slider are required.' : risk === 'consequential' ? 'Consequential action: two-key confirmation and full slider are required.' : 'Low-impact action: no destructive confirmation is required.');
  $('#command-risk-copy').textContent = notices.join(' ');
  $('#send-command-button').disabled = !command || !stateForAction.executable;
}

function renderCommandFieldEditor(action) {
  const container = $('#command-field-editor');
  if (!container) return;
  container.replaceChildren();
  for (const field of action?.fields || []) {
    const label = document.createElement('label');
    label.className = 'field';
    const title = document.createElement('span');
    title.textContent = `${field.label}${field.required ? ' *' : ''}`;
    let control;
    if (field.type === 'select' || ['segmented-select', 'enum-select', 'time-preset-or-stepper'].includes(field.control)) {
      control = document.createElement('select');
      for (const choice of field.options || []) {
        const option = document.createElement('option');
        option.value = choice;
        option.textContent = choice;
        control.append(option);
      }
    } else {
      control = document.createElement('input');
      control.type = field.type === 'number' || String(field.control || '').includes('stepper') ? 'number' : 'text';
      if (field.min !== undefined) control.min = String(field.min);
      if (field.max !== undefined) control.max = String(field.max);
      if (field.maxLength !== undefined) control.maxLength = field.maxLength;
    }
    control.dataset.commandField = field.id;
    control.required = Boolean(field.required);
    control.addEventListener('input', updateCommandPreview);
    control.addEventListener('change', updateCommandPreview);
    label.append(title, control);
    container.append(label);
  }
  updateCommandPreview();
}

function renderCommandEvidence() {
  const container = $('#command-evidence-list');
  if (!container) return;
  container.replaceChildren();
  const discovered = commandCatalog.discovered || {};
  const entries = [
    ...(Array.isArray(discovered.jarProbes) ? discovered.jarProbes : []),
    ...(Array.isArray(discovered.liveResponses) ? discovered.liveResponses : [])
  ];
  if (!entries.length) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'No selected-JAR, local-console, or RCON discovery evidence has been recorded for this server.';
    container.append(empty);
    return;
  }
  for (const entry of entries) {
    const item = document.createElement('article');
    item.className = 'command-evidence-entry';
    const title = document.createElement('strong');
    title.textContent = `${entry.request || 'unknown request'} · ${entry.state || 'captured'}`;
    const metadata = document.createElement('small');
    const parts = [
      entry.source || 'local runtime',
      entry.route || 'direct local probe',
      entry.capturedAt ? new Date(entry.capturedAt).toLocaleString() : 'time unavailable',
      entry.exitCode === null || entry.exitCode === undefined ? null : `exit ${entry.exitCode}`,
      entry.timedOut ? 'timed out' : null,
      entry.truncated ? 'truncated at the configured bound' : null
    ].filter(Boolean);
    metadata.textContent = parts.join(' · ');
    const response = document.createElement('pre');
    response.textContent = entry.text || 'No response text was captured.';
    item.append(title, metadata, response);
    container.append(item);
  }
}

function renderCommandCenter() {
  const familySelect = $('#command-family');
  const actionSelect = $('#command-action');
  if (!familySelect || !actionSelect) return;
  renderCommandDiscoveryControls();
  const previousFamily = familySelect.value;
  familySelect.replaceChildren();
  for (const family of commandCatalog.families || []) {
    const option = document.createElement('option');
    option.value = family.id;
    option.textContent = family.label || family.title || family.id;
    familySelect.append(option);
  }
  if ([...familySelect.options].some((option) => option.value === previousFamily)) familySelect.value = previousFamily;
  const family = currentCommandFamily();
  actionSelect.replaceChildren();
  for (const action of family?.actions || []) {
    const option = document.createElement('option');
    option.value = action.id;
    const label = action.label || action.title || action.id;
    option.textContent = action.deprecated ? `${label} — deprecated warning` : label;
    actionSelect.append(option);
  }
  renderCommandEvidence();
  renderCommandFieldEditor(currentCommandAction());
}

function renderManagement() {
  const server = selectedServer();
  if (!server || !$('#management-state')) return;
  const management = server.management || {};
  const discovery = management.discovery || null;
  $('#management-state').textContent = String(management.state || 'not-configured').replace(/-/g, ' ');
  $('#management-endpoint').value = management.endpoint || '';
  $('#management-insecure-loopback').checked = Boolean(management.allowInsecureLoopback);
  const authenticationCopy = $('#management-authentication-copy');
  if (authenticationCopy) authenticationCopy.textContent = management.authentication?.message || 'Endpoints that require authentication remain unavailable until a documented provider adapter exists.';
  if (discovery?.discoveredAt) {
    const count = discovery.methods?.length || 0;
    const expires = discovery.expiresAt ? new Date(discovery.expiresAt).toLocaleString() : 'an unknown time';
    $('#management-capability-copy').textContent = discovery.state === 'ready' && management.state === 'ready'
      ? `Discovered ${count} method(s) at ${new Date(discovery.discoveredAt).toLocaleString()}. This endpoint-bound allowlist expires at ${expires}.`
      : `A previous discovery named ${count} method(s) at ${new Date(discovery.discoveredAt).toLocaleString()}, but it is not callable: ${managementProtocolMessage(management)}`;
  } else {
    $('#management-capability-copy').textContent = managementProtocolMessage(management);
  }
  const list = $('#management-capability-list');
  list.replaceChildren();
  const methods = Array.isArray(discovery?.methods) ? discovery.methods : (management.capabilities || []).map((name) => ({ name }));
  for (const method of methods) {
    const item = document.createElement('span');
    item.textContent = method.description ? `${method.name} — ${method.description}` : method.name;
    list.append(item);
  }
  renderCommandCenter();
}

function buildToolsInput() {
  return {
    revision: $('#buildtools-revision').value,
    target: $('#buildtools-target').value,
    workspace: $('#buildtools-workspace').value.trim(),
    output: $('#buildtools-output').value.trim(),
    compile: $('#buildtools-compile').checked,
    reuse: $('#buildtools-reuse').checked,
    update: $('#buildtools-update').checked,
    pullRequest: undefined,
    rawFallback: $('#buildtools-expert-tokens').value.trim(),
    riskAcknowledgements: {}
  };
}

function renderBuildToolsMetadata(metadata = state.buildToolsMetadata) {
  const select = $('#buildtools-revision');
  if (!select) return;
  const current = select.value;
  const versions = Array.isArray(metadata?.versions) ? metadata.versions : [];
  select.replaceChildren();
  if (!versions.length) {
    const option = document.createElement('option');
    option.value = selectedServer()?.minecraftVersion || '';
    option.textContent = option.value || 'Refresh official versions first';
    select.append(option);
  } else {
    versions.forEach((version) => {
      const option = document.createElement('option');
      option.value = version;
      option.textContent = version;
      select.append(option);
    });
  }
  select.value = [...select.options].some((option) => option.value === current) ? current : (selectedServer()?.minecraftVersion || select.value);
  $('#buildtools-java-state').textContent = metadata?.fetchedAt
    ? `Official metadata refreshed ${new Date(metadata.fetchedAt).toLocaleString()}. BuildTools preflight remains the final compatibility authority.`
    : 'The BuildTools preflight makes the final Java compatibility decision.';
}

function renderBuildToolsPlan(plan = state.buildToolsPlan) {
  const executeButton = $('#execute-buildtools-button');
  if (!plan) {
    if (executeButton) executeButton.disabled = true;
    return;
  }
  if (executeButton) executeButton.disabled = false;
  $('#buildtools-java-state').textContent = `Prepared a non-executing ${plan.revision} plan. Requires Java ${plan.jdk?.feature || plan.jdk?.minimumFeature || 'as reported by BuildTools'} and explicit confirmation before execution.`;
}

function statusRecord(title, detail, state = 'idle') {
  const record = document.createElement('article');
  record.className = 'status-record';
  record.dataset.state = state;
  const heading = document.createElement('strong');
  heading.textContent = title;
  const copy = document.createElement('span');
  copy.textContent = detail || 'No additional local detail is available.';
  record.append(heading, copy);
  return record;
}

function renderLocalStatus() {
  const status = state.localStatus;
  const current = $('#local-status-current');
  if (!current) return;
  if (!status?.snapshot) {
    current.textContent = 'Not loaded';
    $('#local-status-updated').textContent = 'Refresh to inspect local state';
    $('#local-status-completeness').textContent = 'No inventory loaded';
    $('#local-status-boundary').textContent = 'No local status snapshot has been loaded.';
    ['#local-status-operations', '#local-status-evidence', '#local-status-next-steps', '#local-status-inventory'].forEach((selector) => $(selector).replaceChildren());
    return;
  }
  const snapshot = status.snapshot;
  const completeness = status.completeness || {};
  current.textContent = String(snapshot.currentState || 'idle').replace(/-/g, ' ');
  $('#local-status-updated').textContent = snapshot.lastUpdated ? new Date(snapshot.lastUpdated).toLocaleString() : 'No timestamp';
  const summary = completeness.summary || {};
  $('#local-status-completeness').textContent = `${summary.completeRows || 0}/${summary.totalRows || 0} rows fully evidenced`;
  $('#local-status-boundary').textContent = snapshot.bridgeBoundary?.exactBoundary || 'This local status view has no external bridge.';
  const renderList = (selector, records, mapper, empty) => {
    const container = $(selector);
    container.replaceChildren();
    if (!records?.length) {
      container.append(statusRecord('No local records', empty, 'idle'));
      return;
    }
    records.forEach((record) => {
      const view = mapper(record);
      container.append(statusRecord(view.title, view.detail, view.state));
    });
  };
  renderList('#local-status-operations', snapshot.activeOperations, (record) => ({
    title: `${record.title} — ${record.state}`,
    detail: record.detail || `Started ${new Date(record.startedAt).toLocaleString()}.`,
    state: record.state
  }), 'No installer, setup, or server lifecycle operation is currently active.');
  renderList('#local-status-evidence', snapshot.localEvidence, (record) => ({
    title: `${record.title} — ${record.state}`,
    detail: [record.detail, record.localPath].filter(Boolean).join(' · '),
    state: record.state
  }), 'No local evidence records have been collected yet.');
  renderList('#local-status-next-steps', snapshot.nextSteps, (record) => ({
    title: `${record.label} — ${record.state}`,
    detail: record.detail || 'No additional details were recorded.',
    state: record.state
  }), 'No next local step is currently recorded.');
  renderList('#local-status-inventory', completeness.rows, (record) => {
    const missing = (completeness.incompleteRows || []).find((item) => item.id === record.id)?.missing || [];
    return {
      title: `${record.title} — ${missing.length ? 'incomplete' : 'complete'}`,
      detail: missing.length ? `Pending evidence: ${missing.join(', ')}.` : 'All declared evidence is present.',
      state: missing.length ? 'waiting' : 'complete'
    };
  }, 'No completeness inventory rows are available.');
}

function renderServers() {
  const query = $('#server-search').value.trim().toLowerCase();
  const container = $('#server-list');
  container.replaceChildren();
  const visible = state.servers.filter((server) => `${server.name} ${server.software} ${server.minecraftVersion}`.toLowerCase().includes(query));
  if (!visible.length) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = query ? 'No matching servers.' : 'No local servers yet.';
    container.append(empty);
    return;
  }
  for (const server of visible) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = `server-card ${server.id === state.selectedId ? 'selected' : ''}`;
    item.innerHTML = `<strong>${escapeHtml(server.name)}</strong><span class="server-meta"><span>${escapeHtml(server.software)} · ${escapeHtml(server.minecraftVersion)}</span><span><i class="dot ${server.status}"></i>${escapeHtml(server.status)}</span></span>`;
    item.addEventListener('click', () => { state.selectedId = server.id; renderAll(); refreshCommandCatalog(); });
    container.append(item);
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

function renderDependencies() {
  const container = $('#dependency-list');
  container.replaceChildren();
  if (!state.dependencies) {
    container.textContent = 'Detecting Java and Git…';
    return;
  }
  for (const dependency of Object.values(state.dependencies.dependencies)) {
    const pill = document.createElement('span');
    const error = state.dependencyErrors[dependency.id];
    pill.className = `dependency-pill ${dependency.available ? 'available' : ''}`;
    pill.textContent = `${dependency.available ? '✓' : error ? '!' : '○'} ${dependency.label}${dependency.version ? ` — ${dependency.version}` : error ? ' — install failed; retry available' : ' — not found'}`;
    container.append(pill);
  }
  const missing = Object.values(state.dependencies.dependencies).some((item) => !item.available);
  $('#install-dependencies-button').disabled = !missing;
  $('#install-dependencies-button').textContent = Object.keys(state.dependencyErrors).length ? 'Retry missing tools' : 'Install missing tools';
  $('#install-dependencies-button').title = missing ? 'Uses Windows package managers first, then an app-private portable fallback.' : 'All required tools are installed.';
}

function renderEditor() {
  const server = selectedServer();
  const editor = $('#server-editor');
  const empty = $('#empty-state');
  if (!server) {
    editor.classList.add('hidden');
    empty.classList.remove('hidden');
    $('#server-title').textContent = copyText('heading.firstServer');
    $('#server-software').textContent = copyText('heading.noServer');
    $('#server-status').textContent = 'Stopped';
    $('#server-status').className = 'status-chip status-stopped';
    ['open-folder-button', 'setup-button', 'start-button', 'stop-button'].forEach((id) => { $(`#${id}`).disabled = true; });
    return;
  }
  empty.classList.add('hidden');
  editor.classList.remove('hidden');
  $('#server-title').textContent = server.name;
  $('#server-software').textContent = copyText('heading.serverType', { software: `${server.software.toUpperCase()} · MINECRAFT ${server.minecraftVersion}` });
  $('#server-status').textContent = server.status[0].toUpperCase() + server.status.slice(1);
  $('#server-status').className = `status-chip status-${server.status}`;
  $('#open-folder-button').disabled = false;
  $('#setup-button').disabled = false;
  $('#start-button').disabled = server.status === 'running';
  $('#stop-button').disabled = server.status !== 'running';
  $('#edit-name').value = server.name;
  $('#edit-software').value = server.software[0].toUpperCase() + server.software.slice(1);
  $('#edit-version').value = server.minecraftVersion;
  $('#edit-path').value = server.serverPath;
  $('#java-path').value = server.javaPath || '';
  $('#jvm-gc').value = server.launchProfile?.gc || 'g1';
  $('#jvm-diagnostics').value = server.launchProfile?.diagnostics || 'off';
  $('#jvm-expert-tokens').value = Array.isArray(server.launchProfile?.expertTokens) ? server.launchProfile.expertTokens.join(' ') : '';
  $('#memory-gb').value = server.memoryGb;
  $('#memory-output').value = server.memoryGb;
  $('#eula-accepted').checked = server.eulaAccepted;
  for (const [key, value] of Object.entries(server.settings)) {
    const inputId = key === 'entity-broadcast-range-percentage' ? 'entity-broadcast-range' : key.replace('.', '-');
    propertyInput(inputId, value);
  }
  $$('.advanced-control').forEach((control) => {
    const value = server.settings[control.dataset.property] ?? '';
    if (control.type === 'checkbox') control.checked = String(value) === 'true';
    else control.value = value;
  });
  const gameRules = server.gameRules || {};
  $('#gamerule-pvp').checked = Boolean(gameRules.pvp);
  $('#gamerule-allowEnteringNetherUsingPortals').checked = Boolean(gameRules.allowEnteringNetherUsingPortals);
  $('#gamerule-spawnMonsters').checked = Boolean(gameRules.spawnMonsters);
  $('#gamerule-commandBlocksEnabled').checked = Boolean(gameRules.commandBlocksEnabled);
  $('#view-distance-output').value = $('#view-distance').value;
  $('#simulation-distance-output').value = $('#simulation-distance').value;
  renderManagement();
  refreshPlugins();
}

function renderConsole() {
  const output = $('#console-output');
  output.textContent = state.logs.length ? state.logs.join('\n') : 'Waiting for a server event…';
  output.scrollTop = output.scrollHeight;
}

function safeRconResponseForConsole(value) {
  const safety = window.StudioRconResponseSafety;
  if (!safety || typeof safety.normalizeRconIpcResponse !== 'function') {
    return { text: '', redacted: true, truncated: false, sanitized: true };
  }
  return safety.normalizeRconIpcResponse(value);
}

function rconConsoleLine(value) {
  const response = safeRconResponseForConsole(value);
  const markers = [];
  if (response.redacted) markers.push('[redacted]');
  if (response.sanitized) markers.push('[sanitized]');
  if (response.truncated) markers.push('[truncated]');
  const prefix = markers.length ? `RCON ${markers.join(' ')}` : 'RCON';
  return `${prefix}: ${response.text || '(no response)'}`;
}

function renderAll() {
  renderServers();
  renderDependencies();
  renderEditor();
  renderConsole();
  renderLocalStatus();
  setActiveTab(state.activeTab);
}

function setActiveTab(tab) {
  state.activeTab = tab;
  $$('.tab').forEach((button) => {
    const active = button.dataset.tab === tab;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  $$('.settings-panel').forEach((panel) => {
    const active = panel.dataset.panel === tab;
    panel.classList.toggle('active', active);
    panel.hidden = !active;
  });
}

async function refreshServers() {
  const servers = await safely(() => window.studio.listServers());
  if (!servers) return;
  state.servers = servers;
  if (!selectedServer() && servers.length) state.selectedId = servers[0].id;
  renderAll();
  await refreshCommandCatalog();
}

async function refreshDependencies() {
  const inspection = await safely(() => window.studio.inspectDependencies());
  if (inspection) {
    state.dependencies = inspection;
    for (const dependency of Object.values(inspection.dependencies)) {
      if (dependency.available) delete state.dependencyErrors[dependency.id];
    }
    renderDependencies();
  }
}

async function refreshLocalStatus() {
  const status = await safely(() => window.studio.localStatus());
  if (status) {
    state.localStatus = status;
    renderLocalStatus();
  }
}

async function refreshVersions() {
  const versions = await safely(() => window.studio.paperVersions());
  if (!versions) return;
  const list = $('#paper-versions');
  list.replaceChildren(...versions.map((version) => {
    const option = document.createElement('option');
    option.value = version;
    return option;
  }));
}

async function refreshCommandCatalog() {
  const server = selectedServer();
  if (!server) {
    commandCatalog = FALLBACK_COMMAND_CATALOG;
    renderCommandCenter();
    return;
  }
  const catalog = await safely(() => window.studio.commandCatalog(server.id));
  if (catalog) {
    commandCatalog = catalog;
    renderCommandCenter();
  }
}

function selectedCommandDiscoverySources() {
  const sources = [];
  if ($('#command-discovery-jar')?.checked) sources.push('selected-jar');
  if ($('#command-discovery-local')?.checked) sources.push('local-console');
  if ($('#command-discovery-rcon')?.checked) sources.push('rcon');
  return sources;
}

function selectedCommandDiscoveryQueries() {
  const queries = [];
  if ($('#command-discovery-help')?.checked) queries.push('help');
  if ($('#command-discovery-plugins')?.checked) queries.push('plugins');
  if ($('#command-discovery-paper')?.checked) queries.push('paper');
  return queries;
}

function renderCommandDiscoveryControls() {
  const server = selectedServer();
  const paper = $('#command-discovery-paper');
  if (paper) {
    paper.disabled = server?.software !== 'paper';
    if (paper.disabled) paper.checked = false;
    paper.title = paper.disabled ? 'The Paper runtime query is available only for a selected Paper server.' : 'Request current Paper runtime usage evidence.';
  }
}

async function collectCommandDiscovery() {
  const server = selectedServer();
  if (!server) return toast('Choose a local server before collecting command evidence.', 'error');
  const sources = selectedCommandDiscoverySources();
  if (!sources.length) return toast('Select at least one explicit command discovery source first.', 'error');
  const queries = selectedCommandDiscoveryQueries();
  if ((sources.includes('local-console') || sources.includes('rcon')) && !queries.length) {
    return toast('Select at least one fixed runtime query before collecting local-console or RCON evidence.', 'error');
  }
  const result = await safely(() => window.studio.refreshCommandDiscovery(server.id, { sources, queries }));
  if (!result) return;
  commandCatalog = result.catalog || commandCatalog;
  renderCommandCenter();
  await refreshServers();
  const summary = result.discovery || {};
  toast(`Recorded ${summary.jarProbeCount || 0} selected-JAR probe(s) and ${summary.liveResponseCount || 0} live runtime response(s).`, 'success');
}

async function refreshSpigotVersions() {
  const metadata = await safely(() => window.studio.refreshSpigotVersions());
  if (metadata) {
    state.buildToolsMetadata = metadata;
    renderBuildToolsMetadata(metadata);
    toast('Official Spigot version metadata refreshed from the selected in-app action.', 'success');
  }
}

async function prepareBuildToolsPlan() {
  const server = selectedServer();
  if (!server) return;
  if (server.software !== 'spigot') return toast('BuildTools plans apply only to the selected Spigot server.', 'error');
  const plan = await safely(() => window.studio.buildToolsPreflight(server.id, buildToolsInput()));
  if (plan) {
    state.buildToolsPlan = plan;
    $('#buildtools-output').value = plan.workspace?.outputDirectory || '';
    renderBuildToolsPlan(plan);
    toast('Non-executing BuildTools preflight prepared. It still requires explicit confirmation before a build can start.', 'success');
  }
}

async function executeBuildToolsPlan() {
  const server = selectedServer();
  const plan = state.buildToolsPlan;
  if (!server || !plan) return toast('Prepare a BuildTools plan before starting a build.', 'error');
  const approved = window.confirm(`Build Spigot ${plan.revision} in the isolated workspace and then promote only the staged JAR? The plan retains the prior server JAR as a rollback record when one exists.`);
  if (!approved) return;
  const result = await safely(() => window.studio.executeBuildToolsPlan(server.id, {
    confirmed: true,
    digest: plan.authority?.digest,
    confirmedAt: new Date().toISOString()
  }), 'BuildTools completed and the staged JAR was promoted with a rollback record.');
  if (result) await refreshServers();
}

function updateRuntimeRequirement() {
  const server = selectedServer();
  if (!server || !$('#runtime-requirement-title')) return;
  const requirement = state.runtimeRequirement;
  if (!requirement || requirement.minecraftVersion !== server.minecraftVersion || requirement.platform?.toLowerCase() !== server.software) {
    $('#runtime-requirement-title').textContent = 'Refresh runtime inventory to verify the Java requirement';
    $('#runtime-requirement-copy').textContent = 'The app does not guess Java compatibility. Refresh the inventory to read the bundled Paper or Spigot compatibility policy for this exact version.';
    return;
  }
  if (requirement.status !== 'known') {
    $('#runtime-requirement-title').textContent = 'Java requirement is not documented for this version';
    $('#runtime-requirement-copy').textContent = requirement.message;
    return;
  }
  $('#runtime-requirement-title').textContent = requirement.platform + ' ' + requirement.minecraftVersion + ' requires Java ' + requirement.feature;
  $('#runtime-requirement-copy').textContent = requirement.source + '. The app will only launch after a direct runtime probe confirms this feature.';
}

function renderRuntimeInventory(payload = []) {
  const response = Array.isArray(payload) ? { runtimes: payload } : (payload || {});
  const inventory = Array.isArray(response.runtimes) ? response.runtimes : [];
  if (response.requirement) {
    state.runtimeRequirement = response.requirement;
    updateRuntimeRequirement();
  }
  const select = $('#java-runtime');
  if (!select) return;
  const current = select.value;
  select.replaceChildren();
  const automatic = document.createElement('option');
  automatic.value = '';
  automatic.textContent = 'Use the best compatible discovered runtime';
  select.append(automatic);
  for (const runtime of inventory) {
    const option = document.createElement('option');
    option.value = runtime.path;
    option.textContent = `Java ${runtime.feature || '?'} — ${runtime.path}${runtime.compatible === false ? ' (not compatible)' : ''}`;
    option.disabled = runtime.compatible === false;
    select.append(option);
  }
  if ([...select.options].some((option) => option.value === current)) select.value = current;
  $('#java-runtime-state').textContent = inventory.length
    ? `${inventory.length} runtime candidate(s) discovered. Compatibility is checked again when launch is requested.`
    : 'No Java runtime inventory is available yet. Use Detect tools or Browse Java.';
  if (response.installPlan?.portable?.state === 'missing-source') {
    $('#java-runtime-state').textContent += ' ' + response.installPlan.portable.reason;
  }
}

async function refreshPlugins() {
  const server = selectedServer();
  const container = $('#plugin-list');
  if (!server) return;
  const plugins = await safely(() => window.studio.listPlugins(server.id));
  if (!plugins) return;
  container.replaceChildren();
  if (!plugins.length) {
    const text = document.createElement('p');
    text.className = 'muted';
    text.textContent = 'No plugin JARs are installed for this server.';
    container.append(text);
  } else {
    plugins.forEach((plugin) => {
      const pill = document.createElement('span');
      pill.className = 'plugin-pill';
      pill.textContent = plugin;
      container.append(pill);
    });
  }
}

function openCreateDialog() {
  $('#create-dialog').showModal();
  $('#create-name').focus();
}

async function createServer(event) {
  event.preventDefault();
  const software = document.querySelector('input[name="create-software"]:checked').value;
  const draft = {
    name: $('#create-name').value,
    directoryName: $('#create-directory').value,
    software,
    minecraftVersion: $('#create-version').value,
    rootPath: $('#create-root').value,
    memoryGb: $('#create-memory').value,
    eulaAccepted: $('#create-eula').checked,
    port: $('#create-port').value,
    settings: {
      'server-port': $('#create-port').value,
      'query.port': $('#create-port').value
    }
  };
  const created = await safely(() => window.studio.createServer(draft), 'Server created. Choose Set up server to fetch its official software.');
  if (created) {
    state.selectedId = created.id;
    $('#create-dialog').close();
    await refreshServers();
  }
}

async function saveSettings(event) {
  event.preventDefault();
  const server = selectedServer();
  if (!server) return;
  const saved = await safely(() => window.studio.updateServer(server.id, {
    name: $('#edit-name').value,
    memoryGb: $('#memory-gb').value,
    javaPath: $('#java-runtime').value || $('#java-path').value,
    launchProfile: {
      gc: $('#jvm-gc').value,
      diagnostics: $('#jvm-diagnostics').value,
      expertTokens: $('#jvm-expert-tokens').value
    },
    eulaAccepted: $('#eula-accepted').checked,
    settings: settingsFromForm(),
    gameRules: gameRulesFromForm()
  }), 'Server settings saved.');
  if (saved) await refreshServers();
}

async function saveManagementConnection() {
  const server = selectedServer();
  if (!server) return null;
  const endpoint = $('#management-endpoint').value.trim();
  const allowInsecureLoopback = $('#management-insecure-loopback').checked;
  const token = $('#management-token').value;
  const result = await safely(
    () => window.studio.configureManagement(server.id, { endpoint, allowInsecureLoopback, token }),
    token
      ? 'Protected credential saved locally. It is not sent until a documented provider-specific authentication adapter exists.'
      : 'Management connection details saved.'
  );
  if (result) {
    $('#management-token').value = '';
    await refreshServers();
  }
  return result;
}

async function clearManagementCredential() {
  const server = selectedServer();
  if (!server) return null;
  const endpoint = $('#management-endpoint').value.trim();
  const allowInsecureLoopback = $('#management-insecure-loopback').checked;
  const result = await safely(
    () => window.studio.configureManagement(server.id, { endpoint, allowInsecureLoopback, clearCredential: true }),
    'Protected management credential cleared.'
  );
  if (result) {
    $('#management-token').value = '';
    await refreshServers();
  }
  return result;
}

async function discoverManagement() {
  const server = selectedServer();
  if (!server) return;
  const saved = await saveManagementConnection();
  if (!saved) return;
  const discovered = await safely(() => window.studio.discoverManagement(server.id), 'Live management capabilities discovered.');
  if (discovered) await refreshServers();
}

function requiresSuperConfirmation(action) {
  return action?.confirmationRequirement === 'super-confirmation' || ['consequential', 'destructive', 'world-mutation', 'content-mutation'].includes(action?.risk);
}

async function runCommandAction() {
  const action = selectedCommandAction;
  const rawCommand = $('#command-raw-tokens').value.trim();
  const transport = $('#command-transport').value;
  const transportState = actionTransportState(action, Boolean(rawCommand));
  const server = selectedServer();
  if (!server || !action) return;
  if (!transportState.executable) return toast(transportState.message || 'Complete the command fields first.', 'error');
  const plan = await safely(() => window.studio.commandPlan(server.id, {
    actionId: action.id,
    values: commandValuesFromForm(action),
    rawCommand,
    route: registryRouteForTransport(transport)
  }));
  if (!plan) return;
  const command = plan.command;
  if (!command) return toast('Complete the required rich controls or use the bounded token composer.', 'error');
  const plannedAction = { ...action, ...plan };
  const plannedTransportState = {
    ...transportState,
    protocolMethod: plan.execution?.protocol?.method || transportState.protocolMethod,
    route: plan.execution?.selected?.route || transportState.route
  };
  if (requiresSuperConfirmation(plannedAction)) {
    openCommandConfirmation({ action: plannedAction, command, transport, transportState: plannedTransportState });
  } else {
    executeCommandAction({ action: plannedAction, command, transport, transportState: plannedTransportState });
  }
}

async function executeCommandAction({ action, command, transport, transportState }) {
  const server = selectedServer();
  if (!server) return;
  let result;
  if (transport === 'protocol') result = await safely(() => window.studio.invokeManagement(server.id, transportState.protocolMethod, { command, action: action.id, tokens: action.tokens || [] }), 'Live operation requested.');
  else if (transport === 'rcon') result = await safely(() => window.studio.rcon(server.id, command));
  else result = await safely(() => window.studio.console(server.id, command));
  if (result !== null) {
    state.logs.push(`${transport.toUpperCase()} command: /${command}`);
    renderConsole();
  }
}

function openCommandConfirmation(payload) {
  const dialog = $('#command-confirmation-dialog');
  if (!dialog) return;
  const label = payload.action.label || payload.action.title || payload.action.id;
  $('#command-confirmation-title').textContent = copyText('dialog.confirmTitle', { action: label });
  $('#command-confirmation-copy').textContent = payload.action.backupRequirement === 'required' || payload.action.backup
    ? copyText('dialog.confirmBackup')
    : copyText('dialog.confirmImpact');
  $('#command-confirmation-target').textContent = copyText('dialog.affectedResource', { server: selectedServer()?.name || 'selected local server', command: payload.command });
  const first = $('#command-confirmation-first');
  const second = $('#command-confirmation-second');
  const slider = $('#command-confirmation-slider');
  const confirm = $('#command-confirmation-accept');
  first.checked = false;
  second.checked = false;
  slider.value = '0';
  const update = () => { slider.disabled = !(first.checked && second.checked); confirm.disabled = !(first.checked && second.checked && Number(slider.value) >= 100); };
  first.onchange = update;
  second.onchange = update;
  slider.oninput = update;
  confirm.onclick = () => { dialog.close('confirmed'); executeCommandAction(payload); };
  $('#command-confirmation-cancel').onclick = () => dialog.close('cancelled');
  update();
  dialog.showModal();
}

function logEvent(event) {
  const prefix = new Date(event.at || Date.now()).toLocaleTimeString();
  const label = event.serverId ? `[${event.serverId.slice(0, 8)}] ` : '';
  if (event.message) state.logs.push(`${prefix} ${label}${event.message}`);
  else if (event.type === 'server-state') state.logs.push(`${prefix} ${label}Server state: ${event.status}`);
  if (state.logs.length > 800) state.logs.splice(0, state.logs.length - 800);
  renderConsole();
  if (event.type === 'server-state') refreshServers();
}

function handleStudioEvent(event) {
  if (event?.type === 'experience-settings') {
    applyExperienceSnapshot(event.payload);
    return;
  }
  logEvent(event || {});
}

function bindEvents() {
  $('#experience-settings-button').addEventListener('click', openExperienceSettings);
  $('#close-experience-settings-dialog').addEventListener('click', closeExperienceSettings);
  $('#close-experience-settings-button').addEventListener('click', closeExperienceSettings);
  $('#experience-settings-form').addEventListener('submit', saveExperienceSettings);
  $('#funny-english').addEventListener('input', previewFunnyLevelOutputs);
  $('#funny-cantonese').addEventListener('input', previewFunnyLevelOutputs);
  $('#create-school-mode-record-button').addEventListener('click', createSchoolModeRecord);
  $('#save-school-mode-label-button').addEventListener('click', saveSchoolModeLabel);
  $('#save-school-mode-credential-button').addEventListener('click', saveSchoolModeCredential);
  $('#school-mode-enabled').addEventListener('change', changeSchoolMode);
  $('#new-server-button').addEventListener('click', openCreateDialog);
  $('#empty-create-button').addEventListener('click', openCreateDialog);
  $('#close-create-dialog').addEventListener('click', () => $('#create-dialog').close());
  $('#cancel-create-button').addEventListener('click', () => $('#create-dialog').close());
  $('#create-form').addEventListener('submit', createServer);
  $('#browse-root-button').addEventListener('click', async () => {
    const folder = await safely(() => window.studio.pickFolder());
    if (folder) $('#create-root').value = folder;
  });
  $('#create-memory').addEventListener('input', () => { $('#create-memory-output').value = $('#create-memory').value; });
  $('#server-search').addEventListener('input', renderServers);
  $('#refresh-button').addEventListener('click', () => { refreshServers(); refreshDependencies(); });
  $('#refresh-dependencies-button').addEventListener('click', refreshDependencies);
  $('#refresh-status-button').addEventListener('click', refreshLocalStatus);
  $('#install-dependencies-button').addEventListener('click', async () => {
    const missing = Object.values(state.dependencies?.dependencies || {}).filter((item) => !item.available).map((item) => item.id);
    if (!missing.length) return toast('All required tools are already available.', 'success');
    $('#install-dependencies-button').disabled = true;
    const result = await safely(() => window.studio.installDependencies(missing, selectedServer()?.id));
    if (result) {
      const failed = result.results.filter((item) => item.status === 'failed');
      toast(failed.length ? `Some tool installations need attention: ${failed.map((item) => item.id).join(', ')}.` : 'Requested tools installed or already present.', failed.length ? 'error' : 'success');
      state.dependencyErrors = Object.fromEntries(failed.map((item) => [item.id, item.error || 'Installation failed.']));
      state.dependencies = result.inspection;
      renderDependencies();
    }
  });
  $$('.tab').forEach((button) => button.addEventListener('click', () => setActiveTab(button.dataset.tab)));
  $('#settings-form').addEventListener('submit', saveSettings);
  $('#memory-gb').addEventListener('input', () => { $('#memory-output').value = $('#memory-gb').value; });
  $('#view-distance').addEventListener('input', () => { $('#view-distance-output').value = $('#view-distance').value; });
  $('#simulation-distance').addEventListener('input', () => { $('#simulation-distance-output').value = $('#simulation-distance').value; });
  $('#clear-java-button').addEventListener('click', () => { $('#java-path').value = ''; });
  $('#browse-java-button').addEventListener('click', async () => { const selected = await safely(() => window.studio.pickJava()); if (selected) { $('#java-path').value = selected; $('#java-runtime').value = ''; } });
  $('#refresh-runtimes-button').addEventListener('click', async () => { const server = selectedServer(); if (!server) return; const inventory = await safely(() => window.studio.runtimeInventory(server.id)); if (inventory) renderRuntimeInventory(inventory); });
  $('#refresh-spigot-versions-button').addEventListener('click', refreshSpigotVersions);
  $('#browse-buildtools-workspace').addEventListener('click', async () => { const folder = await safely(() => window.studio.pickFolder()); if (folder) $('#buildtools-workspace').value = folder; });
  $('#plan-buildtools-button').addEventListener('click', prepareBuildToolsPlan);
  $('#execute-buildtools-button').addEventListener('click', executeBuildToolsPlan);
  $('#save-management-token-button').addEventListener('click', saveManagementConnection);
  $('#clear-management-token-button').addEventListener('click', clearManagementCredential);
  $('#discover-management-button').addEventListener('click', discoverManagement);
  $$('.live-operation').forEach((button) => button.addEventListener('click', () => {
    const server = selectedServer();
    if (!server) return;
    if (server.management?.state !== 'ready') return toast(managementProtocolMessage(server.management), 'error');
    const method = button.dataset.liveOperation;
    const available = server.management?.capabilities?.includes(method);
    if (!available) return toast(`'${method}' is not advertised by this server's current endpoint-bound management protocol allowlist.`, 'error');
    safely(() => window.studio.invokeManagement(server.id, method, {}), 'Live management operation requested.');
  }));
  $('#command-family').addEventListener('change', renderCommandCenter);
  $('#command-action').addEventListener('change', () => renderCommandFieldEditor(currentCommandAction()));
  $('#command-transport').addEventListener('change', updateCommandPreview);
  $('#command-raw-tokens').addEventListener('input', updateCommandPreview);
  $('#send-command-button').addEventListener('click', runCommandAction);
  $('#copy-command-button').addEventListener('click', async () => { const command = $('#command-raw-tokens').value.trim() || buildStructuredCommand(currentCommandAction()); if (!command) return; try { await navigator.clipboard.writeText(`/${command}`); toast('Composed Minecraft command copied.', 'success'); } catch { toast('Clipboard access was unavailable. Select the preview text instead.', 'error'); } });
  $('#refresh-command-center-button').addEventListener('click', collectCommandDiscovery);
  $('#open-folder-button').addEventListener('click', () => { const server = selectedServer(); if (server) safely(() => window.studio.openFolder(server.serverPath)); });
  $('#edit-open-folder').addEventListener('click', () => { const server = selectedServer(); if (server) safely(() => window.studio.openFolder(server.serverPath)); });
  $('#setup-button').addEventListener('click', async () => { const server = selectedServer(); if (!server) return; if (server.software === 'spigot') { setActiveTab('buildtools'); return toast('Spigot setup requires the isolated BuildTools plan and its explicit execution action.', 'error'); } await safely(() => window.studio.provision(server.id), 'Official server software is ready.'); });
  $('#start-button').addEventListener('click', async () => { const server = selectedServer(); if (server) await safely(() => window.studio.start(server.id), 'Server start requested.'); });
  $('#stop-button').addEventListener('click', async () => { const server = selectedServer(); if (server) await safely(() => window.studio.stop(server.id), 'Graceful server stop requested.'); });
  $('#browse-plugin-button').addEventListener('click', async () => { const selected = await safely(() => window.studio.pickPlugin()); if (selected) { state.pluginPath = selected; $('#plugin-path').value = selected; } });
  $('#install-plugin-button').addEventListener('click', async () => { const server = selectedServer(); if (!server) return; if (!state.pluginPath) return toast('Choose a plugin JAR first.', 'error'); const result = await safely(() => window.studio.installPlugin(server.id, state.pluginPath), 'Plugin installed. Restart the server to load it.'); if (result) { state.pluginPath = ''; $('#plugin-path').value = ''; refreshPlugins(); } });
  $('#send-console-button').addEventListener('click', async () => { const server = selectedServer(); if (!server) return; const command = $('#console-command').value; const result = await safely(() => window.studio.console(server.id, command)); if (result) $('#console-command').value = ''; });
  $('#send-rcon-button').addEventListener('click', async () => { const server = selectedServer(); if (!server) return; const command = $('#console-command').value; const response = await safely(() => window.studio.rcon(server.id, command)); if (response !== null) { state.logs.push(rconConsoleLine(response)); renderConsole(); } });
  $('#clear-console-button').addEventListener('click', () => { state.logs = []; renderConsole(); });
  $$('.command-presets button').forEach((button) => button.addEventListener('click', () => { $('#console-command').value = button.dataset.command; $('#console-command').focus(); }));
}

async function initialize() {
  renderAdvancedControls();
  bindEvents();
  window.studio.onEvent(handleStudioEvent);
  const experience = await safely(() => window.studio.experienceSettings());
  if (experience) applyExperienceSnapshot(experience);
  const directory = await safely(() => window.studio.dataDirectory());
  if (directory) $('#data-directory').textContent = `Data: ${directory}`;
  await Promise.all([refreshServers(), refreshDependencies(), refreshVersions(), refreshLocalStatus()]);
  renderCommandCenter();
}

initialize();
