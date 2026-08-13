const state = {
  servers: [],
  selectedId: null,
  dependencies: null,
  dependencyErrors: {},
  logs: [],
  localStatus: null,
  statusHubBridge: null,
  localHistory: null,
  localHistoryResult: null,
  localHistoryFilterError: '',
  buildToolsMetadata: null,
  buildToolsPlan: null,
  paperCliPlan: null,
  backupOverview: null,
  backupPlan: null,
  restorePlan: null,
  paperUpdatePlan: null,
  paperRollbackPlan: null,
  offlineDocumentation: null,
  offlineDocument: null,
  documentationOpen: false,
  documentationQuery: '',
  documentationRegex: { enabled: false, pattern: '', flags: '' },
  documentationPendingAnchor: '',
  activeTab: 'general',
  pluginPath: '',
  experience: null,
  pluginPlan: null,
  pluginPlanServerId: null,
  applicationUpdate: null,
  ollama: null,
  ollamaTab: 'runtime',
  ollamaSearch: {
    mode: 'plain',
    query: '',
    pattern: '',
    flags: 'i'
  },
  converterSnapshot: null,
  converterSource: null,
  converterRegexBuilderOpen: false,
  narrationSchedule: null,
  narratorRuntime: null,
  workspaceDestination: 'servers',
  authenticator: null,
  authenticatorStatus: null,
  toyLocks: null,
  toyLockStatus: null,
  activeAuthenticatorTab: 'codes',
  activeToyLockId: null,
  pendingAuthenticatorDestination: false,
  unsaved: {
    settings: false,
    createDraft: false,
    pluginSelection: false,
    consoleDraft: false,
    statusHubBridge: false,
    authenticatorEntry: false,
    toyLockDraft: false,
    toyLockUnlock: false,
    appearance: false
  }
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
const narrator = window.StudioNarrator?.createNarrator ? window.StudioNarrator.createNarrator() : null;

const REGEX_SNIPPETS = Object.freeze({
  literal: 'text',
  anchor: '^$',
  class: '[A-Za-z]',
  group: '(text)',
  alternation: 'first|second',
  quantifier: 'x{1,3}'
});

const regexSearches = {
  preferences: { mode: 'plain', query: '', pattern: '', flags: 'i' },
  schedules: { mode: 'plain', query: '', pattern: '', flags: 'i' }
};

const SERVER_TAB_IDS = Object.freeze([
  'general', 'world', 'gameplay', 'network', 'runtime', 'paper-cli', 'buildtools', 'backups',
  'live', 'commands', 'status', 'history', 'advanced', 'plugins', 'console'
]);
const DEFAULT_APPEARANCE_NAVIGATION = Object.freeze({
  state: 'unavailable',
  detail: 'Appearance and tab-navigation settings have not loaded.',
  settings: Object.freeze({
    theme: 'system',
    density: 'comfortable',
    seedColor: '#6750A4',
    typography: Object.freeze({ family: 'system-ui', scale: 1, weight: 400 }),
    tabs: Object.freeze({ dock: 'left', activeTab: 'general' }),
    elementOverrides: Object.freeze({
      shell: Object.freeze({ surface: null, onSurface: null, radius: null }),
      tabStrip: Object.freeze({ surface: null, onSurface: null, radius: null }),
      primaryAction: Object.freeze({ surface: null, onSurface: null, radius: null })
    })
  })
});
const APPEARANCE_TARGET_DEFAULTS = Object.freeze({
  dark: Object.freeze({
    shell: Object.freeze({ surface: '#10131A', onSurface: '#E0E5F0', radius: 0 }),
    tabStrip: Object.freeze({ surface: '#181C25', onSurface: '#C1C7D7', radius: 18 }),
    primaryAction: Object.freeze({ surface: '#9CCAFF', onSurface: '#003258', radius: 999 })
  }),
  light: Object.freeze({
    shell: Object.freeze({ surface: '#FFFBFE', onSurface: '#1C1B1F', radius: 0 }),
    tabStrip: Object.freeze({ surface: '#F4EFF4', onSurface: '#49454F', radius: 18 }),
    primaryAction: Object.freeze({ surface: '#6750A4', onSurface: '#FFFFFF', radius: 999 })
  })
});
const FONT_FAMILY_CSS = Object.freeze({
  'system-ui': 'system-ui, "Segoe UI", Roboto, Arial, sans-serif',
  'Segoe UI': '"Segoe UI", system-ui, Arial, sans-serif',
  Arial: 'Arial, Helvetica, sans-serif',
  Georgia: 'Georgia, "Times New Roman", serif',
  Consolas: 'Consolas, "Cascadia Mono", monospace'
});
const appearanceContextSearches = {
  tab: { mode: 'plain', query: '', pattern: '', flags: { i: true, m: false, u: true } },
  appearance: { mode: 'plain', query: '', pattern: '', flags: { i: true, m: false, u: true } }
};
let tabPersistenceTimer = null;

const FALLBACK_EXPERIENCE = Object.freeze({
  local: Object.freeze({ language: 'english', funnyLevels: Object.freeze({ english: 2, cantonese: 3 }), dialogEmoji: true, displayName: 'Minecraft Server Studio' }),
  appearanceNavigation: DEFAULT_APPEARANCE_NAVIGATION,
  shared: Object.freeze({ state: 'not-loaded', effectiveSchoolMode: true, schoolMode: Object.freeze({ enabled: false, label: 'Mode' }) }),
  credential: Object.freeze({ state: 'unavailable', configured: false })
});

function currentExperience() {
  return state.experience || FALLBACK_EXPERIENCE;
}

function storedExperienceLocal() {
  return currentExperience().local || FALLBACK_EXPERIENCE.local;
}

function currentExperienceLocal() {
  return currentExperience().effectiveLocal || storedExperienceLocal();
}

function currentSchoolMode() {
  return currentExperience().shared || FALLBACK_EXPERIENCE.shared;
}

function currentAppearanceNavigation() {
  const appearance = currentExperience().appearanceNavigation;
  if (!appearance || typeof appearance !== 'object' || !appearance.settings || typeof appearance.settings !== 'object') {
    return DEFAULT_APPEARANCE_NAVIGATION;
  }
  return appearance;
}

function currentAppearanceSettings() {
  return currentAppearanceNavigation().settings || DEFAULT_APPEARANCE_NAVIGATION.settings;
}

function effectiveAppearanceTheme(settings = currentAppearanceSettings()) {
  if (settings.theme === 'light' || settings.theme === 'dark') return settings.theme;
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function appearanceTargetDefaults(target, settings = currentAppearanceSettings()) {
  return APPEARANCE_TARGET_DEFAULTS[effectiveAppearanceTheme(settings)][target] || APPEARANCE_TARGET_DEFAULTS.dark.shell;
}

function appearanceTargetValue(target, settings = currentAppearanceSettings()) {
  const fallback = appearanceTargetDefaults(target, settings);
  const override = settings.elementOverrides?.[target] || {};
  return {
    surface: override.surface || fallback.surface,
    onSurface: override.onSurface || fallback.onSurface,
    radius: override.radius ?? fallback.radius,
    inherited: override.surface === null && override.onSurface === null && override.radius === null
  };
}

function setAppearanceCssValue(name, value) {
  const root = document.documentElement;
  if (value === null || value === undefined || value === '') root.style.removeProperty(name);
  else root.style.setProperty(name, String(value));
}

function applyAppearanceNavigation() {
  const record = currentAppearanceNavigation();
  const settings = currentAppearanceSettings();
  const root = document.documentElement;
  const editor = $('#server-editor');
  const navigation = $('#server-tab-navigation');
  const strip = $('#server-tab-strip');
  const shell = appearanceTargetValue('shell', settings);
  const tabStrip = appearanceTargetValue('tabStrip', settings);
  const primaryAction = appearanceTargetValue('primaryAction', settings);
  const typography = settings.typography || DEFAULT_APPEARANCE_NAVIGATION.settings.typography;
  const tabs = settings.tabs || DEFAULT_APPEARANCE_NAVIGATION.settings.tabs;

  root.dataset.theme = ['system', 'light', 'dark'].includes(settings.theme) ? settings.theme : 'system';
  document.body.dataset.density = ['comfortable', 'compact', 'spacious'].includes(settings.density) ? settings.density : 'comfortable';
  setAppearanceCssValue('--appearance-seed-color', settings.seedColor || DEFAULT_APPEARANCE_NAVIGATION.settings.seedColor);
  setAppearanceCssValue('--appearance-font-family', FONT_FAMILY_CSS[typography.family] || FONT_FAMILY_CSS['system-ui']);
  setAppearanceCssValue('--appearance-type-scale', Number.isFinite(Number(typography.scale)) ? Number(typography.scale) : 1);
  setAppearanceCssValue('--appearance-font-weight', [400, 500, 600, 700].includes(Number(typography.weight)) ? Number(typography.weight) : 400);
  setAppearanceCssValue('--appearance-shell-surface', shell.surface);
  setAppearanceCssValue('--appearance-shell-on-surface', shell.onSurface);
  setAppearanceCssValue('--appearance-shell-radius', `${shell.radius}px`);
  setAppearanceCssValue('--appearance-tab-strip-surface', tabStrip.surface);
  setAppearanceCssValue('--appearance-tab-strip-on-surface', tabStrip.onSurface);
  setAppearanceCssValue('--appearance-tab-strip-radius', `${tabStrip.radius}px`);
  setAppearanceCssValue('--appearance-primary-action-surface', primaryAction.surface);
  setAppearanceCssValue('--appearance-primary-action-on-surface', primaryAction.onSurface);
  setAppearanceCssValue('--appearance-primary-action-radius', `${primaryAction.radius}px`);

  const dock = ['left', 'right', 'top', 'bottom'].includes(tabs.dock) ? tabs.dock : 'left';
  if (editor) editor.dataset.tabDock = dock;
  if (navigation) navigation.dataset.dock = dock;
  if (strip) strip.setAttribute('aria-orientation', ['left', 'right'].includes(dock) ? 'vertical' : 'horizontal');
  if (SERVER_TAB_IDS.includes(tabs.activeTab) && tabs.activeTab !== state.activeTab) setActiveTab(tabs.activeTab, { persist: false });
  hydrateAppearanceNavigationControls();
  applyAppearanceContextSearch('tab');
  applyAppearanceContextSearch('appearance');
  const status = $('#appearance-target-status');
  if (status && record.state !== 'ready') {
    status.dataset.state = record.state || 'unavailable';
    status.textContent = record.detail || 'Appearance and tab-navigation settings are unavailable.';
  }
}

function currentNarrationSchedule() {
  return state.narrationSchedule || currentExperience().narrationSchedule || {
    state: 'not-loaded',
    detail: 'Narrator and scheduled settings have not loaded.',
    narrator: { enabled: false, language: 'english', voices: { english: 'automatic', cantonese: 'automatic' }, rates: { english: 1, cantonese: 1 }, pitches: { english: 1, cantonese: 1 } },
    schedules: [],
    scheduleSources: [],
    effective: { language: storedExperienceLocal().language || 'english', source: 'local-base', scheduleId: null, timezone: 'local' }
  };
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
  const messageValue = messageText(message);
  copy.textContent = `${toastPrefix(kind)}: ${messageValue}`;
  item.append(copy);
  $('#toast-region').append(item);
  const experienceCopy = window.StudioExperienceCopy;
  const levels = storedExperienceLocal().funnyLevels;
  const englishPrefix = experienceCopy?.toastPrefix ? experienceCopy.toastPrefix('english', levels, kind) : kind;
  const cantonesePrefix = experienceCopy?.toastPrefix ? experienceCopy.toastPrefix('cantonese', levels, kind) : kind;
  const englishMessage = message && typeof message === 'object' && typeof message.key === 'string' && experienceCopy?.format
    ? experienceCopy.format(message.key, 'english', message.values || {})
    : messageValue;
  const cantoneseMessage = message && typeof message === 'object' && typeof message.key === 'string' && experienceCopy?.format
    ? experienceCopy.format(message.key, 'cantonese', message.values || {})
    : messageValue;
  narrator?.narrate({
    category: `toast-${kind}`,
    english: `${englishPrefix}: ${englishMessage}`,
    cantonese: `${cantonesePrefix}: ${cantoneseMessage}`
  });
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

function narratorSettingsFromControls() {
  return {
    enabled: $('#narrator-enabled').checked,
    language: $('#narrator-language').value,
    voices: {
      english: $('#narrator-english-voice').value || 'automatic',
      cantonese: $('#narrator-cantonese-voice').value || 'automatic'
    },
    rates: {
      english: Number($('#narrator-english-rate').value),
      cantonese: Number($('#narrator-cantonese-rate').value)
    },
    pitches: {
      english: Number($('#narrator-english-pitch').value),
      cantonese: Number($('#narrator-cantonese-pitch').value)
    }
  };
}

function renderNarratorRangeOutputs() {
  for (const language of ['english', 'cantonese']) {
    const rate = $(`#narrator-${language}-rate`);
    const pitch = $(`#narrator-${language}-pitch`);
    if (rate) $(`#narrator-${language}-rate-output`).textContent = Number(rate.value).toFixed(1);
    if (pitch) $(`#narrator-${language}-pitch-output`).textContent = Number(pitch.value).toFixed(1);
  }
}

function populateNarratorVoicePicker(language, narratorSnapshot, writable) {
  const picker = $(`#narrator-${language}-voice`);
  const status = $(`#narrator-${language}-status`);
  if (!picker || !status) return;
  const saved = currentNarrationSchedule().narrator?.voices?.[language] || 'automatic';
  const details = narratorSnapshot?.[language] || { choices: [], state: 'unavailable', detail: 'Narrator availability is not loaded.' };
  const choices = Array.isArray(details.choices) ? details.choices : [];
  picker.replaceChildren();
  const automatic = document.createElement('option');
  automatic.value = 'automatic';
  automatic.textContent = 'Choose automatically';
  picker.append(automatic);
  for (const voice of choices) {
    const option = document.createElement('option');
    option.value = voice.id;
    option.textContent = `${voice.name} · ${voice.lang}${voice.localService === false ? ' · network-backed' : ''}`;
    picker.append(option);
  }
  if (saved !== 'automatic' && !choices.some((voice) => voice.id === saved)) {
    const missing = document.createElement('option');
    missing.value = saved;
    missing.textContent = 'Saved selection — not installed on this computer';
    picker.append(missing);
  }
  picker.value = [...picker.options].some((option) => option.value === saved) ? saved : 'automatic';
  picker.disabled = !writable;
  status.textContent = details.detail || 'No narrator voice state is available.';
  status.dataset.state = details.state || 'unavailable';
}

function renderNarratorControls(narratorSnapshot = narrator?.getSnapshot()) {
  const settings = currentNarrationSchedule();
  const configuration = settings.narrator || {};
  const writable = settings.state === 'ready';
  const runtime = state.narratorRuntime || {};
  const enabled = $('#narrator-enabled');
  const language = $('#narrator-language');
  const status = $('#narrator-status');
  if (!enabled || !language || !status) return;
  enabled.checked = configuration.enabled === true;
  enabled.disabled = !writable;
  language.value = ['english', 'cantonese', 'both'].includes(configuration.language) ? configuration.language : 'english';
  language.disabled = !writable;
  for (const track of ['english', 'cantonese']) {
    const rate = $(`#narrator-${track}-rate`);
    const pitch = $(`#narrator-${track}-pitch`);
    if (rate) {
      rate.value = String(configuration.rates?.[track] ?? 1);
      rate.disabled = !writable;
    }
    if (pitch) {
      pitch.value = String(configuration.pitches?.[track] ?? 1);
      pitch.disabled = !writable;
    }
  }
  renderNarratorRangeOutputs();
  populateNarratorVoicePicker('english', narratorSnapshot, writable);
  populateNarratorVoicePicker('cantonese', narratorSnapshot, writable);
  const availability = narratorSnapshot?.availability || { state: 'unavailable', detail: 'Narrator availability is not loaded.' };
  const runtimeDetail = runtime.screenReaderActive === true
    ? (runtime.detail || 'A platform accessibility client is active. Narrator speech yields and no utterance will start until that state clears.')
    : availability.detail;
  status.textContent = `${settings.detail || 'Narrator settings are unavailable.'} ${runtimeDetail}`;
  status.dataset.state = runtime.state === 'unavailable' ? 'unavailable' : runtime.screenReaderActive === true ? 'active' : availability.state || settings.state;
  $('#save-narrator-settings-button').disabled = !writable;
  $('#narrator-preview').disabled = !writable || configuration.enabled !== true || runtime.screenReaderActive === true || availability.state !== 'available';
}

async function saveNarratorSettings() {
  const snapshot = await safely(() => window.studio.updateNarratorSettings(narratorSettingsFromControls()), 'Narrator settings saved.');
  if (snapshot) applyExperienceSnapshot(snapshot);
}

function speakNarratorPreview() {
  const runtime = state.narratorRuntime || {};
  if (!narrator || runtime.screenReaderActive === true) return toast('Narrator preview yields while a platform accessibility client is active.', 'info');
  narrator.configure(narratorSettingsFromControls(), runtime);
  const started = narrator.narrate({
    category: 'narrator-preview',
    english: 'Narrator preview. This is a serialized local spoken event.',
    cantonese: '旁白預覽。呢個係逐句排隊嘅本機語音事件。'
  });
  if (!started) toast('Narrator preview could not start. Save an enabled narrator setting and choose an available platform voice.', 'error');
}

function selectedScheduleWeekdays() {
  if ($('#schedule-every-day').checked) return [0, 1, 2, 3, 4, 5, 6];
  return $$('#schedule-weekday-options input[type="checkbox"]').filter((control) => control.checked).map((control) => Number(control.value));
}

function updateScheduleWeekdayControls() {
  const everyDay = $('#schedule-every-day').checked;
  $$('#schedule-weekday-options input[type="checkbox"]').forEach((control) => {
    if (everyDay) control.checked = true;
    control.disabled = everyDay;
  });
}

function scheduleSearchText(schedule) {
  const window = schedule.window || {};
  return [schedule.label, schedule.value?.language, schedule.priority, window.dateStart, window.dateEnd, window.startTime, window.endTime, ...(window.weekdays || [])].filter((value) => value !== null && value !== undefined).join(' ');
}

function regexForSearch(search) {
  const flags = String(search.flags || '').trim();
  if (!/^[imu]*$/.test(flags) || new Set(flags).size !== flags.length) return { error: 'Use each supported JavaScript search flag at most once: i, m, or u.' };
  if (!search.pattern) return { error: 'Enter a regex pattern before enabling regex search.' };
  try {
    return { regex: new RegExp(search.pattern, flags) };
  } catch (error) {
    return { error: error?.message || 'The regex pattern is invalid.' };
  }
}

function searchMatches(key, text) {
  const search = regexSearches[key];
  const source = String(text || '').slice(0, 2_048);
  if (search.mode !== 'regex') return source.toLocaleLowerCase().includes(String(search.query || '').toLocaleLowerCase());
  const parsed = regexForSearch(search);
  return parsed.regex ? parsed.regex.test(source) : false;
}

function setRegexStatus(key) {
  const search = regexSearches[key];
  const prefix = key === 'preferences' ? 'experience-settings' : 'schedule';
  const status = $(`#${prefix}-regex-status`);
  if (!status) return;
  if (search.mode !== 'regex') {
    status.textContent = 'Plain-text search is active.';
    status.dataset.state = 'ready';
    return;
  }
  const parsed = regexForSearch(search);
  if (parsed.error) {
    status.textContent = parsed.error;
    status.dataset.state = 'invalid';
    return;
  }
  const sample = $(`#${prefix}-regex-sample`)?.value || '';
  status.textContent = sample ? `Regex is valid. Sample ${parsed.regex.test(sample) ? 'matches' : 'does not match'}.` : 'Regex is valid. Enter sample text to inspect a local match.';
  status.dataset.state = 'ready';
}

function renderPreferenceSearch() {
  const search = regexSearches.preferences;
  const cards = $$('[data-settings-card]');
  let matches = 0;
  for (const card of cards) {
    const match = searchMatches('preferences', card.dataset.settingsSearch || card.textContent || '');
    card.classList.toggle('search-filtered', !match);
    if (match) matches += 1;
  }
  const status = $('#experience-settings-search-status');
  if (status) status.textContent = `${matches} preference section${matches === 1 ? '' : 's'} ${search.mode === 'regex' ? 'match the active regex.' : 'match the plain-text search.'}`;
  setRegexStatus('preferences');
}

function formatScheduleWindow(schedule) {
  const window = schedule.window || {};
  const weekdays = Array.isArray(window.weekdays) && window.weekdays.length === 7 ? 'every day' : `weekdays ${(window.weekdays || []).join(', ') || 'none'}`;
  const dates = [window.dateStart || 'no start date', window.dateEnd || 'no end date'].join(' to ');
  return `${weekdays} · ${window.startTime || '?'}–${window.endTime || '?'} · ${dates}`;
}

function renderScheduleSourceOptions() {
  const select = $('#schedule-source');
  const detail = $('#schedule-source-detail');
  const sources = currentNarrationSchedule().scheduleSources || [];
  if (!select || !detail || !sources.length) return;
  select.replaceChildren();
  for (const source of sources) {
    const option = document.createElement('option');
    option.value = source.id;
    option.textContent = source.enabled ? source.label : `${source.label} — unavailable in this build`;
    option.disabled = source.enabled !== true;
    select.append(option);
  }
  select.value = 'local';
  const current = sources.find((source) => source.id === select.value) || sources[0];
  detail.textContent = current?.detail || 'No schedule source is available.';
}

function renderScheduledSettings() {
  const settings = currentNarrationSchedule();
  const effective = settings.effective || {};
  const status = $('#schedule-effective-status');
  if (!status) return;
  const active = effective.source === 'local-schedule';
  status.textContent = active
    ? `${effective.scheduleLabel || 'A local language rule'} is active in ${effective.timezone || 'the local timezone'} and applies ${effective.language || 'English'} now.`
    : `No local schedule currently matches. The saved base language (${effective.language || 'English'}) remains active in ${effective.timezone || 'the local timezone'}.`;
  status.dataset.state = settings.state === 'ready' ? (active ? 'active' : 'ready') : settings.state || 'unavailable';
  $('#add-scheduled-setting-button').disabled = settings.state !== 'ready';
  const list = $('#scheduled-settings-list');
  if (!list) return;
  list.replaceChildren();
  const schedules = Array.isArray(settings.schedules) ? settings.schedules : [];
  const visible = schedules.filter((schedule) => searchMatches('schedules', scheduleSearchText(schedule)));
  if (!visible.length) {
    const empty = document.createElement('p');
    empty.className = 'scheduled-setting-empty';
    empty.textContent = schedules.length ? 'No saved local language rules match the active search.' : 'No local language schedule is saved yet. Add one above to create a bounded rule.';
    list.append(empty);
  }
  for (const schedule of visible) {
    const item = document.createElement('article');
    item.className = 'scheduled-setting';
    item.dataset.active = String(schedule.id === effective.scheduleId);
    item.setAttribute('role', 'listitem');
    const copy = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = `${schedule.label} · ${schedule.value?.language || 'english'} · priority ${schedule.priority}`;
    const detail = document.createElement('small');
    detail.textContent = formatScheduleWindow(schedule);
    copy.append(title, detail);
    const toggle = document.createElement('label');
    toggle.className = 'switch-field';
    const control = document.createElement('input');
    control.type = 'checkbox';
    control.checked = schedule.enabled === true;
    control.disabled = settings.state !== 'ready';
    control.dataset.scheduleId = schedule.id;
    const label = document.createElement('span');
    const labelTitle = document.createElement('strong');
    labelTitle.textContent = 'Enable rule';
    const labelDetail = document.createElement('small');
    labelDetail.textContent = schedule.enabled ? 'This rule can apply when its local window matches.' : 'This rule is retained but inactive.';
    label.append(labelTitle, labelDetail);
    toggle.append(control, label);
    item.append(copy, toggle);
    list.append(item);
  }
  const search = regexSearches.schedules;
  const searchStatus = $('#schedule-search-status');
  if (searchStatus) searchStatus.textContent = `${visible.length} of ${schedules.length} saved local rule${schedules.length === 1 ? '' : 's'} ${search.mode === 'regex' ? 'match the active regex.' : 'match the plain-text search.'}`;
  setRegexStatus('schedules');
}

function renderNarrationScheduleControls(narratorSnapshot) {
  renderScheduleSourceOptions();
  renderNarratorControls(narratorSnapshot);
  renderScheduledSettings();
}

async function addScheduledSetting() {
  const result = await safely(() => window.studio.addScheduledSetting({
    label: $('#schedule-label').value,
    enabled: true,
    priority: Number($('#schedule-priority').value),
    value: { language: $('#schedule-language').value },
    window: {
      dateStart: $('#schedule-date-start').value || null,
      dateEnd: $('#schedule-date-end').value || null,
      startTime: $('#schedule-time-start').value,
      endTime: $('#schedule-time-end').value,
      weekdays: selectedScheduleWeekdays()
    }
  }), 'Local language schedule saved.');
  if (result) applyExperienceSnapshot(result);
}

function updateScheduleSourceDetail() {
  const source = (currentNarrationSchedule().scheduleSources || []).find((item) => item.id === $('#schedule-source').value);
  $('#schedule-source-detail').textContent = source?.detail || 'This schedule source is unavailable.';
}

function attachRegexSearch(key) {
  const prefix = key === 'preferences' ? 'experience-settings' : 'schedule';
  const search = regexSearches[key];
  const field = $(`#${prefix}-search`);
  const toggle = $(`#${prefix}-regex-toggle`);
  const builder = $(`#${prefix}-regex-builder`);
  const pattern = $(`#${prefix}-regex-pattern`);
  const flags = $(`#${prefix}-regex-flags`);
  const sample = $(`#${prefix}-regex-sample`);
  const use = $(`#${prefix}-regex-use`);
  const clear = $(`#${prefix}-regex-clear`);
  if (!field || !toggle || !builder || !pattern || !flags || !sample || !use || !clear) return;
  const render = () => key === 'preferences' ? renderPreferenceSearch() : renderScheduledSettings();
  field.addEventListener('input', () => {
    search.mode = 'plain';
    search.query = field.value.slice(0, 256);
    render();
  });
  toggle.addEventListener('click', () => {
    builder.hidden = !builder.hidden;
    toggle.setAttribute('aria-expanded', String(!builder.hidden));
    if (!builder.hidden) pattern.focus();
  });
  for (const input of [pattern, flags, sample]) {
    input.addEventListener('input', () => {
      search.pattern = pattern.value.slice(0, 256);
      search.flags = flags.value.slice(0, 8);
      setRegexStatus(key);
      if (search.mode === 'regex') render();
    });
  }
  use.addEventListener('click', () => {
    search.pattern = pattern.value.slice(0, 256);
    search.flags = flags.value.slice(0, 8);
    if (regexForSearch(search).error) {
      search.mode = 'regex';
      render();
      return;
    }
    search.mode = 'regex';
    render();
  });
  clear.addEventListener('click', () => {
    search.mode = 'plain';
    search.pattern = '';
    pattern.value = '';
    flags.value = 'i';
    search.flags = 'i';
    field.focus();
    render();
  });
  const selector = key === 'preferences' ? '[data-regex-insert]' : '[data-schedule-regex-insert]';
  $$(selector).forEach((button) => button.addEventListener('click', () => {
    const name = key === 'preferences' ? button.dataset.regexInsert : button.dataset.scheduleRegexInsert;
    const insert = REGEX_SNIPPETS[name] || '';
    pattern.setRangeText(insert, pattern.selectionStart || 0, pattern.selectionEnd || 0, 'end');
    pattern.dispatchEvent(new Event('input', { bubbles: true }));
    pattern.focus();
  }));
  render();
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
  const local = storedExperienceLocal();
  const languageValue = ['english', 'cantonese', 'bilingual'].includes(local.language) ? local.language : 'english';
  const language = document.querySelector(`input[name="language-mode"][value="${languageValue}"]`);
  if (language) language.checked = true;
  $('#dialog-emoji').checked = Boolean(local.dialogEmoji);
  $('#experience-display-name').value = local.displayName;
  renderFunnyLevelOutputs();
  renderSchoolModeControls();
  hydrateAppearanceNavigationControls();
}

function appearanceNavigationIsReady() {
  return currentAppearanceNavigation().state === 'ready';
}

function setAppearanceNavigationControlsDisabled(disabled) {
  [
    '#appearance-theme', '#appearance-density', '#appearance-seed-color', '#appearance-font-family',
    '#appearance-font-scale', '#appearance-font-weight', '#tab-dock', '#save-appearance-navigation-button',
    '#appearance-target', '#appearance-target-surface', '#appearance-target-on-surface',
    '#appearance-target-radius', '#reset-appearance-target-button'
  ].forEach((selector) => {
    const control = $(selector);
    if (control) control.disabled = disabled;
  });
}

function renderAppearanceTargetEditor() {
  const target = $('#appearance-target')?.value || 'shell';
  const settings = currentAppearanceSettings();
  const override = settings.elementOverrides?.[target] || { surface: null, onSurface: null, radius: null };
  const effective = appearanceTargetValue(target, settings);
  const status = $('#appearance-target-status');
  const surface = $('#appearance-target-surface');
  const onSurface = $('#appearance-target-on-surface');
  const radius = $('#appearance-target-radius');
  if (surface) surface.value = effective.surface;
  if (onSurface) onSurface.value = effective.onSurface;
  if (radius) radius.value = String(effective.radius);
  if (status) {
    const inherited = override.surface === null && override.onSurface === null && override.radius === null;
    status.dataset.state = appearanceNavigationIsReady() ? 'ready' : currentAppearanceNavigation().state || 'unavailable';
    status.textContent = appearanceNavigationIsReady()
      ? (inherited ? 'This target currently inherits the active theme values.' : 'This target has a local appearance override. Reset it to inherit the active theme again.')
      : (currentAppearanceNavigation().detail || 'Appearance and tab-navigation settings are unavailable.');
  }
}

function previewSelectedAppearanceTarget() {
  const target = $('#appearance-target')?.value;
  const surface = $('#appearance-target-surface')?.value;
  const onSurface = $('#appearance-target-on-surface')?.value;
  const radius = Number($('#appearance-target-radius')?.value);
  const status = $('#appearance-target-status');
  if (!appearanceNavigationIsReady() || !target || !surface || !onSurface || !Number.isInteger(radius) || radius < 0 || radius > 999) return;
  const prefix = target === 'shell' ? 'shell' : target === 'tabStrip' ? 'tab-strip' : 'primary-action';
  setAppearanceCssValue(`--appearance-${prefix}-surface`, surface);
  setAppearanceCssValue(`--appearance-${prefix}-on-surface`, onSurface);
  setAppearanceCssValue(`--appearance-${prefix}-radius`, `${radius}px`);
  state.unsaved.appearance = true;
  if (status) {
    status.dataset.state = 'ready';
    status.textContent = 'Preview applied to the selected target. Apply appearance and tabs to persist it.';
  }
}

function hydrateAppearanceNavigationControls() {
  const record = currentAppearanceNavigation();
  const settings = currentAppearanceSettings();
  const typography = settings.typography || DEFAULT_APPEARANCE_NAVIGATION.settings.typography;
  const tabs = settings.tabs || DEFAULT_APPEARANCE_NAVIGATION.settings.tabs;
  if ($('#appearance-theme')) $('#appearance-theme').value = settings.theme || 'system';
  if ($('#appearance-density')) $('#appearance-density').value = settings.density || 'comfortable';
  if ($('#appearance-seed-color')) $('#appearance-seed-color').value = settings.seedColor || '#6750A4';
  if ($('#appearance-font-family')) $('#appearance-font-family').value = typography.family || 'system-ui';
  if ($('#appearance-font-scale')) $('#appearance-font-scale').value = String(typography.scale || 1);
  if ($('#appearance-font-scale-output')) $('#appearance-font-scale-output').textContent = `${Math.round(Number(typography.scale || 1) * 100)}%`;
  if ($('#appearance-font-weight')) $('#appearance-font-weight').value = String(typography.weight || 400);
  if ($('#tab-dock')) $('#tab-dock').value = tabs.dock || 'left';
  setAppearanceNavigationControlsDisabled(record.state !== 'ready');
  renderAppearanceTargetEditor();
}

async function persistAppearanceNavigation(patch, successMessage) {
  const snapshot = await safely(() => window.studio.updateAppearanceNavigation(patch), successMessage);
  if (snapshot) applyExperienceSnapshot(snapshot);
  return snapshot;
}

async function saveAppearanceNavigation() {
  const target = $('#appearance-target')?.value;
  if (!target) return;
  const settings = currentAppearanceSettings();
  const snapshot = await persistAppearanceNavigation({
    theme: $('#appearance-theme').value,
    density: $('#appearance-density').value,
    seedColor: $('#appearance-seed-color').value,
    typography: {
      family: $('#appearance-font-family').value,
      scale: Number($('#appearance-font-scale').value),
      weight: Number($('#appearance-font-weight').value)
    },
    tabs: { ...settings.tabs, dock: $('#tab-dock').value, activeTab: state.activeTab },
    elementOverrides: {
      [target]: {
        surface: $('#appearance-target-surface').value,
        onSurface: $('#appearance-target-on-surface').value,
        radius: Number($('#appearance-target-radius').value)
      }
    }
  }, 'Appearance and tab-navigation settings applied.');
  if (snapshot) state.unsaved.appearance = false;
  else renderAppearanceTargetEditor();
}

async function resetAppearanceTarget() {
  const target = $('#appearance-target')?.value;
  if (!target) return;
  const snapshot = await persistAppearanceNavigation({
    elementOverrides: { [target]: { surface: null, onSurface: null, radius: null } }
  }, 'Selected appearance target now inherits the active theme.');
  if (snapshot) state.unsaved.appearance = false;
}

function persistActiveTab(tab) {
  if (!appearanceNavigationIsReady()) return;
  if (tabPersistenceTimer) clearTimeout(tabPersistenceTimer);
  tabPersistenceTimer = setTimeout(() => {
    tabPersistenceTimer = null;
    const settings = currentAppearanceSettings();
    void persistAppearanceNavigation({ tabs: { ...settings.tabs, activeTab: tab } });
  }, 180);
}

function changeTabDock() {
  if (!appearanceNavigationIsReady()) return;
  const settings = currentAppearanceSettings();
  void persistAppearanceNavigation({ tabs: { ...settings.tabs, dock: $('#tab-dock').value, activeTab: state.activeTab } });
}

function applyExperienceSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return;
  state.experience = snapshot;
  state.narrationSchedule = snapshot.narrationSchedule || state.narrationSchedule;
  state.narratorRuntime = snapshot.narratorRuntime || state.narratorRuntime;
  const narratorSnapshot = narrator?.configure(
    state.narrationSchedule?.narrator,
    state.narratorRuntime || {}
  );
  applyLocalizedCopy();
  applyAppearanceNavigation();
  hydrateExperienceControls();
  renderNarrationScheduleControls(narratorSnapshot);
  renderPreferenceSearch();
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
  if (state.unsaved.appearance) {
    state.unsaved.appearance = false;
    applyAppearanceNavigation();
  }
  if (dialog?.open) dialog.close();
}

async function saveExperienceSettings(event) {
  event.preventDefault();
  const local = storedExperienceLocal();
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
    commandBlocksEnabled: $('#gamerule-commandBlocksEnabled').checked,
    spawnerBlocksEnabled: $('#gamerule-spawnerBlocksEnabled').checked
  };
}

function paperCliProfileFromForm() {
  return {
    disableConsole: $('#paper-cli-disable-console').checked,
    emulateVanillaConsole: $('#paper-cli-vanilla-console').checked,
    initializeSettingsOnly: $('#paper-cli-init-settings').checked,
    demo: $('#paper-cli-demo').checked,
    bonusChest: $('#paper-cli-bonus-chest').checked,
    safeMode: $('#paper-cli-safe-mode').checked,
    jfrProfile: $('#paper-cli-jfr').checked,
    commandSettingsPath: $('#paper-cli-commands-settings').value.trim(),
    bukkitSettingsPath: $('#paper-cli-bukkit-settings').value.trim(),
    serverPropertiesPath: $('#paper-cli-server-properties').value.trim(),
    paperSettingsDirectory: $('#paper-cli-paper-directory').value.trim(),
    pluginsDirectory: $('#paper-cli-plugins-directory').value.trim(),
    pidFilePath: $('#paper-cli-pid-file').value.trim(),
    host: $('#paper-cli-host').value.trim(),
    port: $('#paper-cli-port').value.trim(),
    maxPlayers: $('#paper-cli-max-players').value.trim(),
    onlineMode: $('#paper-cli-online-mode').value,
    worldName: $('#paper-cli-world-name').value.trim(),
    serverName: $('#paper-cli-server-name').value.trim(),
    serverId: $('#paper-cli-server-id').value.trim(),
    forceUpgrade: false,
    eraseCache: false,
    recreateRegionFiles: false
  };
}

function setPaperCliValue(id, value) {
  const control = $(`#${id}`);
  if (!control) return;
  if (control.type === 'checkbox') control.checked = Boolean(value);
  else control.value = value ?? '';
}

function quoteArgvToken(value) {
  return JSON.stringify(String(value));
}

function renderPaperCliPlan(server) {
  const plan = state.paperCliPlan?.serverId === server?.id ? state.paperCliPlan : null;
  const stateCopy = $('#paper-cli-preview-state');
  const preview = $('#paper-cli-argv-preview');
  if (!server) {
    stateCopy.textContent = 'Choose a local server to prepare a Paper CLI profile.';
    preview.textContent = 'No server is selected.';
    return;
  }
  if (!plan) {
    stateCopy.textContent = server.software === 'paper'
      ? 'Prepare the profile to validate its typed direct argument vector. Java/JVM tokens appear before -jar; Paper tokens appear after the JAR.'
      : 'Paper JAR CLI controls are unavailable for this server flavor. Use the separate BuildTools controls for Spigot.';
    preview.textContent = 'No Paper CLI preflight has been prepared.';
    return;
  }
  stateCopy.textContent = plan.message || 'Paper CLI preflight has no explanatory state.';
  if (plan.state !== 'ready' || !plan.preview) {
    preview.textContent = 'No executable Paper argv preview is available: ' + (plan.message || 'preflight blocked.');
    return;
  }
  const tokens = [
    plan.preview.executable,
    plan.preview.jvmBoundary,
    plan.preview.jarFlag,
    plan.preview.jarPath,
    ...(plan.preview.serverArgs || [])
  ];
  preview.textContent = 'Direct argv tokens (not a shell command):\n' + tokens.map((token, index) => `${String(index).padStart(2, '0')}: ${quoteArgvToken(token)}`).join('\n');
}

function renderPaperCli(server) {
  const isPaper = server?.software === 'paper';
  const profile = server?.paperCliProfile || {};
  const controls = $$('[data-paper-cli-control]');
  for (const control of controls) {
    if (control.id === 'paper-cli-no-gui') continue;
    control.disabled = !isPaper;
    control.title = isPaper ? '' : 'Paper JAR CLI controls are available only for a selected Paper server.';
  }
  $('#paper-cli-boundary').textContent = isPaper
    ? 'Typed Paper options appear after -jar server.jar. JVM controls stay in Runtime; this surface never accepts a shell command, raw argument file, Java agent, native agent, or plugin command.'
    : 'Paper JAR CLI controls are disabled for this server flavor. Spigot launch and BuildTools options stay in the separately documented BuildTools flow.';
  $('#paper-cli-probe-copy').textContent = isPaper
    ? `Choose this explicitly to run only java -jar server.jar --help and java -jar server.jar --version with the existing bounded direct-probe adapter. ${server.commandDiscovery?.jarProbeCount || 0} prior JAR probe record(s) are stored as local evidence.`
    : 'Selected-JAR help and version evidence is shown only for Paper in this panel. Spigot keeps its BuildTools and command-discovery boundaries separate.';
  $('#paper-cli-no-gui').checked = true;
  setPaperCliValue('paper-cli-disable-console', profile.disableConsole);
  setPaperCliValue('paper-cli-vanilla-console', profile.emulateVanillaConsole);
  setPaperCliValue('paper-cli-init-settings', profile.initializeSettingsOnly);
  setPaperCliValue('paper-cli-demo', profile.demo);
  setPaperCliValue('paper-cli-bonus-chest', profile.bonusChest);
  setPaperCliValue('paper-cli-safe-mode', profile.safeMode);
  setPaperCliValue('paper-cli-jfr', profile.jfrProfile);
  setPaperCliValue('paper-cli-commands-settings', profile.commandSettingsPath);
  setPaperCliValue('paper-cli-bukkit-settings', profile.bukkitSettingsPath);
  setPaperCliValue('paper-cli-server-properties', profile.serverPropertiesPath);
  setPaperCliValue('paper-cli-paper-directory', profile.paperSettingsDirectory);
  setPaperCliValue('paper-cli-plugins-directory', profile.pluginsDirectory);
  setPaperCliValue('paper-cli-pid-file', profile.pidFilePath);
  setPaperCliValue('paper-cli-world-name', profile.worldName);
  setPaperCliValue('paper-cli-world-path', profile.worldPath);
  setPaperCliValue('paper-cli-server-name', profile.serverName);
  setPaperCliValue('paper-cli-server-id', profile.serverId);
  setPaperCliValue('paper-cli-host', profile.host);
  setPaperCliValue('paper-cli-port', profile.port);
  setPaperCliValue('paper-cli-max-players', profile.maxPlayers);
  setPaperCliValue('paper-cli-online-mode', profile.onlineMode === null || profile.onlineMode === undefined ? '' : String(profile.onlineMode));
  renderPaperCliPlan(server);
}

async function preparePaperCliPreflight() {
  const server = selectedServer();
  if (!server) return;
  const plan = await safely(() => window.studio.paperCliPreflight(server.id, paperCliProfileFromForm()));
  if (!plan) return;
  state.paperCliPlan = { ...plan, serverId: server.id };
  renderPaperCliPlan(server);
  toast(plan.state === 'ready' ? 'Read-only Paper direct argv preview prepared. Server startup still performs runtime and lifecycle preflight.' : plan.message || 'Paper CLI preflight is blocked.', plan.state === 'ready' ? 'success' : 'error');
}

async function collectPaperCliJarEvidence() {
  const server = selectedServer();
  if (!server) return;
  const result = await safely(() => window.studio.collectPaperCliJarEvidence(server.id));
  if (!result) return;
  toast('Bounded Paper JAR --help and --version evidence collection was requested. Read the stored source state; this does not claim command availability.', 'success');
  await refreshServers();
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
  const pullRequest = $('#buildtools-pull-request').value.trim();
  const revision = $('#buildtools-revision').value;
  return {
    revision,
    workspace: $('#buildtools-workspace').value.trim(),
    outputDirectoryName: $('#buildtools-output-name').value.trim(),
    finalName: $('#buildtools-final-name').value.trim() || `spigot-${revision}`,
    compileSelection: $('#buildtools-target').value,
    compileIfChanged: $('#buildtools-compile-if-changed').checked,
    dontUpdate: $('#buildtools-dont-update').checked,
    remapped: $('#buildtools-remapped').checked,
    generateSource: $('#buildtools-source').checked,
    generateDocs: $('#buildtools-docs').checked,
    experimental: $('#buildtools-experimental').checked,
    developmentBuild: $('#buildtools-dev').checked,
    pullRequest: pullRequest || null
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
    ? `Official metadata refreshed ${new Date(metadata.fetchedAt).toLocaleString()}. The plan-only controller uses its documented Java matrix and existing Java/Git inspection before showing a direct-argument preview.`
    : 'Prepare a plan to read the documented Java matrix and current Java/Git readiness.';
}

function renderBuildToolsRequirementMatrix(matrix = []) {
  const container = $('#buildtools-requirement-matrix');
  if (!container) return;
  const rows = matrix.length ? matrix : [
    { range: 'Before 1.17', feature: 8, state: 'supported' },
    { range: '1.17 and 1.17.1', feature: 16, state: 'supported' },
    { range: '1.17.2 through 1.20.5', feature: 17, state: 'supported' },
    { range: '1.20.6 through 1.21.11', feature: 21, state: 'supported' },
    { range: 'Newer or non-1.x revisions', feature: null, state: 'unknown' }
  ];
  container.replaceChildren();
  rows.forEach((row) => {
    const stateLabel = row.state === 'supported' ? `Java ${row.feature}` : 'No bundled Java decision';
    const detail = row.state === 'supported'
      ? 'Git is also required for every future BuildTools run. Existing dependency controls expose detection and installation.'
      : 'The plan intentionally does not guess a Java feature or enable automatic execution for this range.';
    container.append(statusRecord(`${row.range} — ${stateLabel}`, detail, row.state === 'supported' ? 'idle' : 'blocked'));
  });
}

function renderBuildToolsPlan(plan = state.buildToolsPlan) {
  const executeButton = $('#execute-buildtools-button');
  if (executeButton) executeButton.disabled = true;
  const activePlan = plan?.server?.id === selectedServer()?.id ? plan : null;
  const stateRecord = $('#buildtools-plan-state')?.closest('.status-record');
  const stateTitle = $('#buildtools-plan-state');
  const stateDetail = $('#buildtools-plan-detail');
  const preview = $('#buildtools-argv-preview');
  if (!activePlan) {
    if (stateRecord) stateRecord.dataset.state = 'idle';
    if (stateTitle) stateTitle.textContent = 'No BuildTools plan has been prepared for the selected server.';
    if (stateDetail) stateDetail.textContent = 'Use typed controls to preview a separate workspace, output directory, Java/Git readiness, and direct arguments. No process will start.';
    if (preview) preview.textContent = 'Prepare a typed plan to preview executable, working directory, and one direct argument per line. Shell text is never accepted.';
    renderBuildToolsRequirementMatrix();
    return;
  }
  $('#buildtools-output').value = activePlan.workspace?.outputDirectory || '';
  if ($('#buildtools-final-name') && document.activeElement !== $('#buildtools-final-name')) {
    $('#buildtools-final-name').value = activePlan.flags?.finalName || '';
  }
  const blockers = activePlan.readiness?.blockers || [];
  if (stateRecord) stateRecord.dataset.state = activePlan.readiness?.state === 'blocked' ? 'blocked' : 'complete';
  if (stateTitle) stateTitle.textContent = activePlan.readiness?.state === 'blocked' ? 'Plan preview has dependency blockers.' : 'Plan-only BuildTools preview is ready.';
  if (stateDetail) stateDetail.textContent = blockers.length
    ? blockers.join(' ')
    : `${activePlan.execution?.reason || 'No BuildTools process is registered.'} Java and Git are currently detected, but no execution route is enabled.`;
  $('#buildtools-java-state').textContent = activePlan.javaRequirement?.status === 'known'
    ? `BuildTools ${activePlan.revision} requires Java ${activePlan.javaRequirement.feature}. The direct-argument preview is plan-only; no process was started.`
    : (activePlan.javaRequirement?.message || 'The Java requirement is not documented for this revision.');
  if (preview) {
    const direct = activePlan.directArgv || {};
    const lines = [
      'execution: unavailable (plan-only)',
      `executable: ${direct.executable || '<compatible Java runtime unavailable>'}`,
      `working directory: ${direct.cwd || '<unavailable>'}`,
      `shell: ${direct.shell === false ? 'false' : 'unavailable'}`,
      `BuildTools source: ${activePlan.boundaries?.buildToolsSource || 'not selected'}`,
      'arguments:'
    ];
    (direct.args || []).forEach((argument, index) => lines.push(`argv[${index}]: ${argument}`));
    preview.textContent = lines.join('\n');
  }
  renderBuildToolsRequirementMatrix(activePlan.javaRequirementMatrix || []);
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

function bridgeStateLabel(value) {
  return ({
    'unconfigured': 'Unconfigured',
    'credential-unavailable': 'Credential unavailable',
    'connecting': 'Connecting',
    'connected': 'Connected',
    'failed': 'Failed'
  })[value] || 'Unconfigured';
}

function bridgeActivity(bridge) {
  if (!bridge) return 'No accepted external registration, update, inbox poll, or reply delivery has been observed.';
  const details = [];
  if (bridge.lastAcceptedRegistrationAt) details.push(`Registration accepted ${new Date(bridge.lastAcceptedRegistrationAt).toLocaleString()}.`);
  if (bridge.lastAcceptedUpdateAt) details.push(`Status update accepted ${new Date(bridge.lastAcceptedUpdateAt).toLocaleString()}.`);
  if (bridge.lastAcceptedPollAt) {
    const replySummary = bridge.inboxState === 'replies-observed'
      ? `${bridge.observedReplyCount || 0} reply metadata item(s) observed; no chat delivery route exists.`
      : 'No reply metadata was observed.';
    details.push(`Inbox poll accepted ${new Date(bridge.lastAcceptedPollAt).toLocaleString()}. ${replySummary}`);
  }
  return details.length ? details.join(' ') : 'No accepted external registration, update, inbox poll, or reply delivery has been observed.';
}

function renderStatusHubBridge(bridge = state.statusHubBridge) {
  const source = bridge || { state: 'unconfigured', endpoint: '', allowInsecureLoopback: false, detail: 'Local status remains available.', inboxState: 'not-polled' };
  const endpoint = $('#status-hub-endpoint');
  const loopback = $('#status-hub-allow-loopback');
  if (endpoint && document.activeElement !== endpoint) endpoint.value = source.endpoint || '';
  if (loopback && document.activeElement !== loopback) loopback.checked = source.allowInsecureLoopback === true;
  const record = $('#status-hub-bridge-state')?.closest('.status-record');
  if (record) record.dataset.state = source.state === 'connected' ? 'complete' : source.state === 'credential-unavailable' ? 'blocked' : source.state || 'idle';
  $('#status-hub-bridge-state').textContent = `Bridge state: ${bridgeStateLabel(source.state)}`;
  $('#status-hub-bridge-detail').textContent = source.detail || 'Local status remains available.';
  $('#status-hub-bridge-activity').textContent = bridgeActivity(source);
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
    renderStatusHubBridge();
    ['#local-status-operations', '#local-status-evidence', '#local-status-next-steps', '#local-status-inventory'].forEach((selector) => $(selector).replaceChildren());
    return;
  }
  const snapshot = status.snapshot;
  state.statusHubBridge = snapshot.statusHubBridge || state.statusHubBridge;
  const completeness = status.completeness || {};
  current.textContent = String(snapshot.currentState || 'idle').replace(/-/g, ' ');
  $('#local-status-updated').textContent = snapshot.lastUpdated ? new Date(snapshot.lastUpdated).toLocaleString() : 'No timestamp';
  const summary = completeness.summary || {};
  $('#local-status-completeness').textContent = `${summary.completeRows || 0}/${summary.totalRows || 0} rows fully evidenced`;
  $('#local-status-boundary').textContent = snapshot.bridgeBoundary?.exactBoundary || 'This local status view has no external bridge.';
  renderStatusHubBridge();
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

function historyFiltersFromForm() {
  return {
    fromDate: $('#history-from-date')?.value || '',
    toDate: $('#history-to-date')?.value || '',
    action: $('#history-action-filter')?.value || '',
    query: $('#history-search')?.value || '',
    regex: $('#history-regex-enabled')?.checked === true,
    flags: $('#history-regex-flags')?.value ?? 'i',
    limit: 250
  };
}

function historyFilterProblem(filters = historyFiltersFromForm()) {
  const fromControl = $('#history-from-date');
  const toControl = $('#history-to-date');
  if (fromControl && !fromControl.validity.valid) return 'Start date is invalid. Keep the value visible and use a complete YYYY-MM-DD date.';
  if (toControl && !toControl.validity.valid) return 'End date is invalid. Keep the value visible and use a complete YYYY-MM-DD date.';
  if (filters.fromDate && filters.toDate && filters.fromDate > filters.toDate) return 'Start date must not be after end date.';
  if (!filters.regex) return '';
  const query = String(filters.query || '');
  const flags = String(filters.flags ?? 'i');
  if (!query) return 'Enter a regular expression before enabling regex search.';
  if (query.length > 128) return 'Regular expressions must be 128 characters or fewer.';
  if (!/^[im]{0,2}$/.test(flags) || new Set(flags).size !== flags.length) return 'Use unique i and m flags only.';
  if (/\((?:[^()\\]|\\.)*[+*](?:[^()\\]|\\.)*\)[+*{]/.test(query) || /(?:\.\*|\.\+){2,}/.test(query) || /\{\d{4,}(?:,\d*)?\}/.test(query)) {
    return 'This pattern contains a nested or oversized quantifier shape that the bounded local search rejects.';
  }
  try {
    new RegExp(query, flags);
  } catch {
    return 'The pattern is invalid. Correct it before applying regex search.';
  }
  return '';
}

function setHistoryFilterError(message = '') {
  state.localHistoryFilterError = message;
  const target = $('#local-history-filter-error');
  if (!target) return;
  target.textContent = message;
  target.hidden = !message;
}

function historyActionLabel(action) {
  return ({
    'record-created': 'Record created',
    'record-updated': 'Record updated',
    'settings-changed': 'Settings changed',
    'record-deleted': 'Record deleted',
    'configuration-changed': 'Configuration changed',
    'export-created': 'Export created'
  })[action] || 'Recorded event';
}

function historyStateLabel(value) {
  return ({
    ready: 'Ready',
    'not-loaded': 'Not loaded',
    unavailable: 'Unavailable',
    invalid: 'Invalid',
    'limit-reached': 'Limit reached'
  })[value] || 'Unavailable';
}

function historyRegexPreview() {
  const preview = $('#history-regex-preview');
  if (!preview) return;
  const enabled = $('#history-regex-enabled')?.checked === true;
  const query = $('#history-search')?.value || '';
  const flags = $('#history-regex-flags')?.value ?? 'i';
  const sample = $('#history-regex-sample')?.value || '';
  if (!enabled) {
    preview.textContent = 'Regex mode is off. Search history uses plain text until you enable this builder.';
    return;
  }
  if (!query) {
    preview.textContent = 'Enter a raw pattern in Search history to preview the expression.';
    return;
  }
  const problem = historyFilterProblem({ ...historyFiltersFromForm(), regex: true, query, flags });
  if (problem) {
    preview.textContent = problem;
    return;
  }
  try {
    const expression = new RegExp(query, flags);
    if (!sample) {
      preview.textContent = 'Pattern is valid. Enter optional local sample text to see a preview; the sample is not saved or exported.';
      return;
    }
    preview.textContent = expression.test(sample)
      ? 'Pattern is valid and matches the current local sample text.'
      : 'Pattern is valid but does not match the current local sample text.';
  } catch {
    preview.textContent = 'The pattern is invalid. Correct it before applying regex search.';
  }
}

function insertHistoryRegexToken(token) {
  const input = $('#history-search');
  if (!input) return;
  const start = Number.isInteger(input.selectionStart) ? input.selectionStart : input.value.length;
  const end = Number.isInteger(input.selectionEnd) ? input.selectionEnd : start;
  const value = input.value;
  const before = value.slice(0, start);
  const after = value.slice(end);
  input.value = before + token + after;
  const cursor = start + (token === '()' ? 1 : token.length);
  input.focus();
  input.setSelectionRange(cursor, cursor);
  historyRegexPreview();
}

function renderLocalHistory() {
  const status = state.localHistory;
  const journal = status?.journal || {};
  const exports = status?.exports || {};
  const latest = exports.lastExport || null;
  const vscode = exports.vscode || { state: 'unavailable', detail: 'VS Code status is unavailable.' };
  $('#local-history-state').textContent = historyStateLabel(journal.state);
  $('#local-history-count').textContent = Number.isFinite(journal.recordCount)
    ? `${journal.recordCount}/${journal.maximumRecords || '?'} records`
    : 'Not loaded';
  $('#local-history-export-state').textContent = latest
    ? `${String(latest.format || '').toUpperCase()} · ${latest.fileName || 'latest export'}`
    : 'No export yet';
  $('#local-history-boundary').textContent = status?.boundary || 'History boundary state is unavailable.';
  $('#local-history-restore').textContent = status?.restoration?.detail || 'Restore state is unavailable.';
  const exportDetail = $('#local-history-export-detail');
  if (latest) {
    exportDetail.textContent = `${latest.fileName} · ${formatBytes(latest.bytes)} · created ${new Date(latest.createdAt).toLocaleString()}. ${vscode.detail || ''}`;
  } else {
    exportDetail.textContent = `No local history export has been created in this app-private export area. ${vscode.detail || ''}`;
  }
  const openButton = $('#open-history-export-vscode-button');
  openButton.disabled = !latest || vscode.state !== 'available';
  openButton.title = openButton.disabled
    ? (!latest ? 'Create a local history export before opening it in VS Code.' : (vscode.detail || 'VS Code is unavailable.'))
    : 'Open the latest app-private export in VS Code.';
  const result = state.localHistoryResult || { records: [], matchedRecords: 0, totalRecords: 0 };
  $('#local-history-match-count').textContent = `${result.matchedRecords || 0} of ${result.totalRecords || 0} records`;
  const container = $('#local-history-records');
  if (!container) return;
  container.replaceChildren();
  const records = Array.isArray(result.records) ? result.records : [];
  if (!records.length) {
    container.append(statusRecord('No matching history records', 'Change the date, action, or search filter. This view shows only redacted local metadata.', 'idle'));
    return;
  }
  records.forEach((record) => {
    const detail = [
      record.at ? new Date(record.at).toLocaleString() : 'No timestamp',
      historyActionLabel(record.action),
      record.detail || 'No detail recorded.'
    ].join(' · ');
    container.append(statusRecord(record.label || 'Recorded local event', detail, 'idle'));
  });
}

async function refreshLocalHistory() {
  const filters = historyFiltersFromForm();
  const status = await safely(() => window.studio.localHistoryStatus());
  if (status) state.localHistory = status;
  const problem = historyFilterProblem(filters);
  if (problem) {
    setHistoryFilterError(problem);
    state.localHistoryResult = {
      records: [],
      matchedRecords: 0,
      totalRecords: state.localHistory?.journal?.recordCount || 0
    };
    renderLocalHistory();
    return;
  }
  try {
    const result = await window.studio.listLocalHistory(filters);
    state.localHistoryResult = result;
    setHistoryFilterError('');
  } catch (error) {
    const message = error?.message || String(error);
    setHistoryFilterError(message);
    state.localHistoryResult = {
      records: [],
      matchedRecords: 0,
      totalRecords: state.localHistory?.journal?.recordCount || 0
    };
    toast(message, 'error');
  }
  renderLocalHistory();
}

async function exportLocalHistory() {
  const filters = historyFiltersFromForm();
  const problem = historyFilterProblem(filters);
  if (problem) {
    setHistoryFilterError(problem);
    renderLocalHistory();
    toast(problem, 'error');
    return;
  }
  const format = $('#history-export-format')?.value || 'json';
  const exported = await safely(
    () => window.studio.exportLocalHistory({ format, filters }),
    'Redacted local history export created.'
  );
  if (!exported) return;
  await refreshLocalHistory();
}

async function openLatestHistoryExportInVsCode() {
  const latest = state.localHistory?.exports?.lastExport;
  if (!latest?.id) return;
  const opened = await safely(
    () => window.studio.openLocalHistoryExportInVsCode(latest.id),
    'The selected app-private history export was handed to VS Code.'
  );
  if (opened) await refreshLocalHistory();
}

function clearHistoryFilters() {
  $('#history-from-date').value = '';
  $('#history-to-date').value = '';
  $('#history-action-filter').value = '';
  $('#history-search').value = '';
  $('#history-regex-enabled').checked = false;
  $('#history-regex-flags').value = 'i';
  $('#history-regex-sample').value = '';
  setHistoryFilterError('');
  historyRegexPreview();
  refreshLocalHistory();
}

function formatBytes(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return 'Unknown size';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let amount = bytes / 1024;
  let index = 0;
  while (amount >= 1024 && index < units.length - 1) {
    amount /= 1024;
    index += 1;
  }
  return `${amount >= 10 ? amount.toFixed(0) : amount.toFixed(1)} ${units[index]}`;
}

function converterRegexEvaluation() {
  const mode = $('#converter-regex-mode')?.checked === true;
  const search = $('#converter-adapter-search');
  const patternInput = $('#converter-regex-pattern');
  const sampleInput = $('#converter-regex-sample');
  const query = String(search?.value || '').slice(0, 128);
  const pattern = String(patternInput?.value || query).slice(0, 128);
  if (!mode) {
    const normalized = query.trim().toLowerCase();
    return {
      valid: true,
      mode: 'plain',
      matches: (adapter) => !normalized || converterAdapterSearchText(adapter).toLowerCase().includes(normalized),
      feedback: normalized ? `Plain-text filtering is active for “${query}”.` : 'Plain-text search is active. Enter text to filter the visible adapter catalog.'
    };
  }
  if (!pattern) {
    return {
      valid: true,
      mode: 'regex',
      matches: () => true,
      feedback: 'Regular-expression mode is active with an empty pattern, so every adapter remains visible.'
    };
  }
  // Catalog strings and optional sample input are bounded; this additionally
  // rejects the common nested-quantifier shape before evaluation.
  if (/\((?:[^()\\]|\\.)*[+*][^)]*\)[+*{]/.test(pattern)) {
    return {
      valid: false,
      mode: 'regex',
      matches: () => false,
      feedback: 'This bounded helper refuses nested quantified groups. Simplify the pattern before filtering.'
    };
  }
  const flags = `${$('#converter-regex-flag-ignore-case')?.checked ? 'i' : ''}${$('#converter-regex-flag-multiline')?.checked ? 'm' : ''}`;
  try {
    const expression = new RegExp(pattern, flags);
    const sample = String(sampleInput?.value || '').slice(0, 512);
    const sampleResult = sample ? ` Sample: ${expression.test(sample) ? 'matches' : 'does not match'}.` : '';
    return {
      valid: true,
      mode: 'regex',
      matches: (adapter) => expression.test(converterAdapterSearchText(adapter)),
      feedback: `Regular-expression filtering is active with ECMAScript flags “${flags || 'none'}”.${sampleResult}`
    };
  } catch (error) {
    return {
      valid: false,
      mode: 'regex',
      matches: () => false,
      feedback: `The regular expression is invalid: ${String(error?.message || 'unknown pattern error').slice(0, 220)}`
    };
  }
}

function converterAdapterSearchText(adapter) {
  return [adapter.title, ...(adapter.sourceKinds || []), ...(adapter.targets || []), adapter.reason].filter(Boolean).join(' ');
}

function converterStatusState(value) {
  if (value === 'ready') return 'idle';
  if (value === 'unavailable') return 'failed';
  return value || 'idle';
}

function renderConverterRegexBuilder(evaluation) {
  const builder = $('#converter-regex-builder');
  const toggle = $('#converter-regex-builder-button');
  if (!builder || !toggle) return;
  builder.hidden = !state.converterRegexBuilderOpen;
  toggle.setAttribute('aria-expanded', String(state.converterRegexBuilderOpen));
  const feedback = $('#converter-regex-feedback');
  if (feedback) feedback.textContent = evaluation.feedback;
}

function renderConverter() {
  const snapshot = state.converterSnapshot;
  const sourceSummary = $('#converter-source-summary');
  const sourcePath = $('#converter-source-path');
  const catalog = $('#converter-adapter-catalog');
  const catalogSummary = $('#converter-catalog-summary');
  const queue = $('#converter-queue');
  if (!sourceSummary || !sourcePath || !catalog || !catalogSummary || !queue) return;

  const source = state.converterSource;
  if (source) {
    sourcePath.value = source.sourcePath || '';
    sourceSummary.dataset.state = 'waiting';
    sourceSummary.replaceChildren(
      Object.assign(document.createElement('strong'), { textContent: `${source.fileName} — inspection recorded` }),
      Object.assign(document.createElement('span'), { textContent: `${source.descriptor?.title || 'Unclassified source'} · ${formatBytes(source.bytes)}. ${source.descriptor?.detail || 'A bounded local byte inspection completed.'} ${source.detail || ''}` })
    );
  } else {
    sourcePath.value = '';
    sourceSummary.dataset.state = converterStatusState(snapshot?.state || 'idle');
    sourceSummary.replaceChildren(
      Object.assign(document.createElement('strong'), { textContent: snapshot?.state === 'unavailable' ? 'Local converter storage is unavailable' : 'No local source file selected' }),
      Object.assign(document.createElement('span'), { textContent: snapshot?.detail || 'Choose a file to record an inspection-only queue item. No conversion can start until a future verified bundled adapter is available.' })
    );
  }

  const evaluation = converterRegexEvaluation();
  renderConverterRegexBuilder(evaluation);
  const categories = Array.isArray(snapshot?.categories) ? snapshot.categories : [];
  const totalAdapters = categories.reduce((count, category) => count + (Array.isArray(category.adapters) ? category.adapters.length : 0), 0);
  let visibleAdapters = 0;
  catalog.replaceChildren();
  for (const category of categories) {
    const group = document.createElement('section');
    group.className = 'converter-category';
    const heading = document.createElement('h5');
    heading.textContent = category.title || 'Uncategorized adapters';
    const list = document.createElement('div');
    list.className = 'converter-adapter-list';
    const adapters = (Array.isArray(category.adapters) ? category.adapters : []).filter((adapter) => evaluation.matches(adapter));
    visibleAdapters += adapters.length;
    if (!adapters.length) {
      const empty = document.createElement('p');
      empty.className = 'muted';
      empty.textContent = evaluation.valid ? 'No adapters in this category match the current filter.' : 'The invalid pattern prevents adapter results.';
      list.append(empty);
    }
    for (const adapter of adapters) {
      const card = document.createElement('article');
      card.className = 'converter-adapter-card';
      card.dataset.state = adapter.enabled ? 'complete' : 'blocked';
      const title = document.createElement('strong');
      title.textContent = adapter.title;
      const stateLabel = document.createElement('span');
      stateLabel.className = 'converter-adapter-state';
      stateLabel.textContent = adapter.enabled ? 'Bundled and available' : 'Unavailable';
      const formats = document.createElement('span');
      formats.textContent = `Source: ${(adapter.sourceKinds || []).join(', ') || 'none'} · Targets: ${(adapter.targets || []).join(', ') || 'none'}`;
      const reason = document.createElement('small');
      reason.textContent = adapter.reason || 'No adapter status was supplied.';
      card.append(title, stateLabel, formats, reason);
      list.append(card);
    }
    group.append(heading, list);
    catalog.append(group);
  }
  catalogSummary.textContent = snapshot
    ? `${visibleAdapters}/${totalAdapters} adapter record(s) shown. ${snapshot.detail || 'No converter state detail is available.'}`
    : 'Loading the local adapter registry…';
  if (!categories.length && snapshot) catalog.append(statusRecord('No adapter catalog is available', snapshot.detail || 'The converter did not return a catalog.', converterStatusState(snapshot.state)));

  queue.replaceChildren();
  const items = Array.isArray(snapshot?.queue) ? snapshot.queue : [];
  if (!items.length) {
    queue.append(statusRecord('Inspection queue is empty', 'Choose a local file to record its bounded byte inspection. The app will not begin a conversion without a future verified bundled adapter.', 'idle'));
  } else {
    for (const item of items) {
      queue.append(statusRecord(
        `${item.fileName || 'Selected file'} — awaiting adapter`,
        `${item.descriptor?.title || 'Unclassified source'} · ${formatBytes(item.bytes)} · ${item.detail || 'No conversion was started.'}`,
        'waiting'
      ));
    }
  }
}

function resetBackupLifecycleState() {
  state.backupOverview = null;
  state.backupPlan = null;
  state.restorePlan = null;
  state.paperUpdatePlan = null;
  state.paperRollbackPlan = null;
}

function planCopy(plan, fallback) {
  if (!plan) return fallback;
  if (plan.state === 'ready') return 'Preview ready. Review the details before starting the action.';
  if (plan.state === 'up-to-date') return 'The selected server JAR already matches the reviewed latest stable Paper build.';
  return (plan.blockers || []).join(' ') || `This preview is ${plan.state}.`;
}

function setText(selector, value) {
  const element = $(selector);
  if (element) element.textContent = value;
}

function renderBackupLifecycle() {
  const server = selectedServer();
  const overview = state.backupOverview;
  const disabled = !server;
  const backups = Array.isArray(overview?.backups) ? overview.backups : [];
  setText('#backup-server-state', server ? (overview?.serverStatus || server.status || 'Loading') : 'No server selected');
  setText('#backup-consistency-copy', server
    ? (overview?.consistency?.message || 'Refresh the local backup state to inspect consistency requirements.')
    : 'Choose a local server to inspect its backup and update lifecycle.');
  setText('#backup-storage-copy', server
    ? (overview?.backupStoragePath ? `App backup storage: ${overview.backupStoragePath}` : 'Refresh the local backup state to inspect app backup storage.')
    : 'No local backup storage is selected.');
  setText('#backup-latest-copy', backups.length
    ? `Latest local backup: ${backups[0].backupId} · ${new Date(backups[0].createdAt).toLocaleString()} · ${backups[0].fileCount.toLocaleString()} files · ${formatBytes(backups[0].totalBytes)}.`
    : 'No complete local backup is available yet.');

  const backupPlan = state.backupPlan;
  setText('#backup-plan-copy', planCopy(backupPlan, 'Prepare a bounded backup preview to inventory world, configuration, plugin, log, and server JAR state before copying.'));
  setText('#backup-plan-detail', backupPlan
    ? `${backupPlan.inventory?.fileCount?.toLocaleString?.() || 0} files · ${formatBytes(backupPlan.inventory?.totalBytes)} · free space ${backupPlan.storage?.bytes === null || backupPlan.storage?.bytes === undefined ? 'not verified' : formatBytes(backupPlan.storage.bytes)} · required ${formatBytes(backupPlan.storage?.requiredBytes)}.`
    : 'The app never reads or serializes the credential vault into a backup snapshot.');

  const select = $('#restore-backup-select');
  if (select) {
    const selected = select.value;
    select.replaceChildren();
    const initial = document.createElement('option');
    initial.value = '';
    initial.textContent = backups.length ? 'Choose a complete local backup' : 'No complete local backups available';
    select.append(initial);
    for (const backup of backups) {
      const option = document.createElement('option');
      option.value = backup.backupId;
      option.textContent = `${new Date(backup.createdAt).toLocaleString()} — ${backup.fileCount.toLocaleString()} files — ${formatBytes(backup.totalBytes)}`;
      select.append(option);
    }
    const preferred = state.restorePlan?.backup?.backupId || selected;
    if ([...select.options].some((option) => option.value === preferred)) select.value = preferred;
  }

  const restorePlan = state.restorePlan;
  setText('#restore-plan-copy', planCopy(restorePlan, 'Choose a complete local snapshot, then prepare a restore preview. Restore is stopped-server-only and creates a new pre-restore safety backup first.'));
  setText('#restore-plan-detail', restorePlan
    ? `Affected roots: ${(restorePlan.targets || []).join(', ') || 'none'}. Source backup: ${restorePlan.backup?.backupId || 'not available'}.`
    : 'No restore preview has been prepared.');

  const updatePlan = state.paperUpdatePlan;
  setText('#paper-update-plan-copy', planCopy(updatePlan, 'Check the official Paper Downloads Service for a stable JAR and a SHA-256-verified replacement preview.'));
  setText('#paper-update-plan-detail', updatePlan?.release
    ? `Reviewed stable build ${updatePlan.release.build} for Minecraft ${updatePlan.release.minecraftVersion}: ${updatePlan.release.name} · ${formatBytes(updatePlan.release.bytes)} · SHA-256 ${updatePlan.release.sha256}.`
    : 'Only a stopped Paper server can receive a reviewed server.jar replacement. Plugins are never auto-updated.');

  const rollbackPlan = state.paperRollbackPlan;
  setText('#paper-rollback-copy', overview?.rollback?.available
    ? 'A retained app-controlled prior server JAR is available. Prepare a rollback preview before replacing the current JAR.'
    : (overview?.rollback?.reason || 'No Paper JAR rollback record is available.'));
  setText('#paper-rollback-plan-copy', planCopy(rollbackPlan, 'A Paper rollback also requires a fresh pre-replacement backup and destructive confirmation.'));

  const controlStates = [
    ['#backup-refresh-button', disabled, 'Choose a local server before refreshing its backup state.'],
    ['#backup-preflight-button', disabled, 'Choose a local server before preparing a backup preview.'],
    ['#backup-create-button', disabled || backupPlan?.state !== 'ready', planCopy(backupPlan, 'Prepare a ready backup preview before creating a snapshot.')],
    ['#restore-preflight-button', disabled || !$('#restore-backup-select')?.value, backups.length ? 'Choose a complete local backup before preparing a restore preview.' : 'Create a complete local backup before preparing a restore preview.'],
    ['#restore-backup-button', disabled || restorePlan?.state !== 'ready', planCopy(restorePlan, 'Prepare a ready restore preview before replacing managed server state.')],
    ['#paper-update-preflight-button', disabled, 'Choose a local server before checking the official Paper update metadata.'],
    ['#paper-update-apply-button', disabled || updatePlan?.state !== 'ready', planCopy(updatePlan, 'Prepare a ready official Paper update preview before replacing server.jar.')],
    ['#paper-rollback-preflight-button', disabled || !overview?.rollback?.available, overview?.rollback?.reason || 'A retained app-controlled Paper rollback JAR is required before preparing rollback.'],
    ['#paper-rollback-apply-button', disabled || rollbackPlan?.state !== 'ready', planCopy(rollbackPlan, 'Prepare a ready Paper rollback preview before replacing server.jar.')]
  ];
  for (const [selector, isDisabled, reason] of controlStates) {
    const control = $(selector);
    if (control) {
      control.disabled = Boolean(isDisabled);
      control.title = isDisabled ? reason : '';
    }
  }
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
    item.addEventListener('click', () => {
      if (state.selectedId !== server.id) resetBackupLifecycleState();
      state.workspaceDestination = 'servers';
      state.selectedId = server.id;
      state.pluginPath = '';
      state.pluginPlan = null;
      state.pluginPlanServerId = null;
      renderAll();
      refreshCommandCatalog();
      refreshDependencies();
      refreshBackupOverview();
    });
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
    const javaRequirementUnknown = dependency.id === 'java' && dependency.requirementState === 'unknown';
    const incompatibleJava = dependency.id === 'java' && !dependency.available && dependency.requiredFeature && Array.isArray(dependency.detectedFeatures) && dependency.detectedFeatures.length;
    const detail = javaRequirementUnknown
      ? ' — selected server Java requirement is unknown; automatic Java install is unavailable'
      : incompatibleJava
        ? ` — Java ${dependency.detectedFeatures.join(', ')} found; Java ${dependency.requiredFeature} is required`
        : dependency.version
          ? ` — ${dependency.version}`
          : error
            ? ' — install failed; retry available'
            : ' — not found';
    pill.textContent = `${dependency.available ? '✓' : error ? '!' : '○'} ${dependency.label}${detail}`;
    container.append(pill);
  }
  const missing = Object.values(state.dependencies.dependencies).some((item) => !item.available && item.installable !== false);
  const javaUnknown = state.dependencies.dependencies.java?.requirementState === 'unknown';
  $('#install-dependencies-button').disabled = !missing;
  $('#install-dependencies-button').textContent = Object.keys(state.dependencyErrors).length ? 'Retry missing tools' : 'Install missing tools';
  $('#install-dependencies-button').title = missing
    ? 'Uses Windows package managers first, then a verified app-private portable Java fallback when the official provider metadata is available.'
    : javaUnknown
      ? 'Automatic Java installation stays unavailable because the selected server version has no documented Java requirement.'
      : 'All tools required by the selected server are available.';
}

function renderGameRuleStatus(server) {
  const target = $('#gamerule-application-state');
  if (!target) return;
  const statuses = server?.gameRuleStatus || {};
  const labels = {
    'sent-local-console': 'sent to the local console',
    'sent-rcon': 'sent through RCON',
    'saved-pending-server-start': 'saved for the next managed start',
    'saved-no-live-transport': 'saved locally only',
    'saved-version-incompatible': 'not sent: target version is too old',
    failed: 'not confirmed by the selected live route'
  };
  const entries = Object.entries(statuses)
    .map(([name, status]) => `${name}: ${labels[status.state] || 'saved'}${status.minimumVersion ? ` (requires ${status.minimumVersion}+)` : ''}`);
  target.textContent = entries.length
    ? entries.join(' · ')
    : `These controls are Minecraft 1.21.9+ game rules. They are never written as obsolete server.properties keys. The generic management protocol remains unavailable here until discovery provides its exact parameter schema.`;
}

function renderEditor() {
  const server = selectedServer();
  const editor = $('#server-editor');
  const empty = $('#empty-state');
  if (state.documentationOpen) {
    editor.classList.add('hidden');
    empty.classList.add('hidden');
    $('#authenticator-destination')?.classList.add('hidden');
    return;
  }
  const authenticatorDestination = $('#authenticator-destination');
  if (state.workspaceDestination === 'authenticator') {
    editor.classList.add('hidden');
    empty.classList.add('hidden');
    authenticatorDestination.classList.remove('hidden');
    $('#server-title').textContent = 'Local authenticator';
    $('#server-software').textContent = 'PRIVATE LOCAL CODES AND TOY LOCKS';
    $('#server-status').textContent = 'Local only';
    $('#server-status').className = 'status-chip';
    ['open-folder-button', 'setup-button', 'start-button', 'stop-button'].forEach((id) => { $(`#${id}`).disabled = true; });
    return;
  }
  authenticatorDestination.classList.add('hidden');
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
  $('#gamerule-spawnerBlocksEnabled').checked = Boolean(gameRules.spawnerBlocksEnabled);
  renderGameRuleStatus(server);
  renderPaperCli(server);
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

const DOCUMENTATION_REGEX_TOKENS = Object.freeze({
  literal: 'text',
  class: '[A-Za-z]',
  anchor: '^$',
  group: '(pattern)',
  alternation: 'left|right',
  quantifier: '+'
});

function documentationDocuments() {
  return Array.isArray(state.offlineDocumentation?.documents) ? state.offlineDocumentation.documents : [];
}

function documentationSearchText(record) {
  return [record?.title, record?.summary, record?.searchText]
    .filter((value) => typeof value === 'string')
    .join('\n')
    .slice(0, 20 * 1024);
}

function normalizedDocumentationFlags(value) {
  const flags = String(value || '').split('').filter((flag, index, source) => source.indexOf(flag) === index).join('');
  return /^[ims]*$/.test(flags) ? flags.split('').sort().join('') : '';
}

function documentationRegexInput() {
  const pattern = String($('#documentation-regex-pattern')?.value || state.documentationRegex.pattern || '').trim();
  const flags = normalizedDocumentationFlags([
    $('#documentation-regex-flag-i')?.checked ? 'i' : '',
    $('#documentation-regex-flag-m')?.checked ? 'm' : '',
    $('#documentation-regex-flag-s')?.checked ? 's' : ''
  ].join(''));
  return { pattern, flags };
}

function documentationRegexSafetyIssue(pattern) {
  if (!pattern) return 'Enter a pattern before enabling regex search.';
  if (pattern.length > 256) return 'Regex patterns are limited to 256 characters.';
  if (/[\u0000-\u001f\u007f]/.test(pattern)) return 'Regex patterns cannot contain control characters.';
  if (/(?:\((?:[^()\\]|\\.){0,160}(?:[+*]|\{\d+(?:,\d*)?\})[^)]*\))(?:[+*]|\{\d+(?:,\d*)?\})/.test(pattern)) {
    return 'Nested repeating groups are rejected to keep local search responsive.';
  }
  return '';
}

function createDocumentationRegex(pattern, flags) {
  const safetyIssue = documentationRegexSafetyIssue(pattern);
  if (safetyIssue) return { regex: null, error: safetyIssue };
  try {
    return { regex: new RegExp(pattern, normalizedDocumentationFlags(flags)), error: '' };
  } catch (error) {
    return { regex: null, error: `Regex syntax is invalid: ${String(error?.message || 'unknown error').slice(0, 180)}` };
  }
}

function currentDocumentationRegex() {
  if (!state.documentationRegex.enabled) return { regex: null, error: '', enabled: false };
  const result = createDocumentationRegex(state.documentationRegex.pattern, state.documentationRegex.flags);
  return { ...result, enabled: true };
}

function filteredDocumentationDocuments() {
  const documents = documentationDocuments();
  const regex = currentDocumentationRegex();
  if (regex.enabled) {
    if (regex.error) return { documents, regex };
    return { documents: documents.filter((record) => regex.regex.test(documentationSearchText(record))), regex };
  }
  const query = String(state.documentationQuery || '').trim().toLocaleLowerCase();
  return {
    documents: query
      ? documents.filter((record) => documentationSearchText(record).toLocaleLowerCase().includes(query))
      : documents,
    regex
  };
}

function slugifyDocumentationHeading(value) {
  return String(value || '')
    .toLocaleLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 128);
}

function normalizeDocumentationAnchor(value) {
  if (typeof value !== 'string' || value.length > 256) return '';
  try {
    return slugifyDocumentationHeading(decodeURIComponent(value.replace(/^#/, '')));
  } catch {
    return '';
  }
}

function resolveOfflineDocumentationLink(href) {
  if (typeof href !== 'string' || href.length > 256 || /[\\\u0000-\u001f\u007f]/.test(href)) return null;
  const value = href.trim();
  if (!value || /^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(value)) return null;
  const [rawFileName, rawAnchor = ''] = value.split('#', 2);
  const fileName = rawFileName || state.offlineDocument?.fileName || '';
  if (!/^(?:README|[a-z0-9][a-z0-9-]*)\.md$/i.test(fileName)) return null;
  const document = documentationDocuments().find((record) => record.fileName.toLocaleLowerCase() === fileName.toLocaleLowerCase());
  if (!document) return null;
  return { id: document.id, anchor: normalizeDocumentationAnchor(rawAnchor) };
}

function focusDocumentationAnchor(anchor) {
  const normalized = normalizeDocumentationAnchor(anchor);
  if (!normalized) return;
  requestAnimationFrame(() => {
    const container = $('#documentation-markdown');
    const headings = container ? [...container.querySelectorAll('h1, h2, h3, h4, h5, h6')] : [];
    const heading = headings
      .find((element) => element.id === `documentation-heading-${normalized}`);
    if (!heading) return;
    heading.setAttribute('tabindex', '-1');
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
    heading.scrollIntoView({ block: 'start', behavior: reducedMotion ? 'auto' : 'smooth' });
    heading.focus({ preventScroll: true });
  });
}

function renderDocumentationArticle() {
  const title = $('#documentation-article-title');
  const summary = $('#documentation-article-summary');
  const source = $('#documentation-article-source');
  const container = $('#documentation-markdown');
  if (!title || !summary || !source || !container) return;
  const article = state.offlineDocument;
  if (!article?.markdown) {
    source.textContent = 'BUNDLED ARTICLE';
    title.textContent = 'Choose an article';
    summary.textContent = 'Select a listed article to read its local documentation.';
    container.replaceChildren(Object.assign(document.createElement('p'), { className: 'muted', textContent: 'No article is selected.' }));
    return;
  }
  source.textContent = `BUNDLED ARTICLE · ${article.fileName}`;
  title.textContent = article.title || 'Untitled documentation article';
  summary.textContent = article.summary || 'This bundled article has no summary.';
  const markdownRenderer = window.StudioMarkdownRenderer;
  if (!markdownRenderer || typeof markdownRenderer.render !== 'function') {
    container.replaceChildren(Object.assign(document.createElement('p'), {
      className: 'muted',
      textContent: 'The local Markdown renderer is unavailable. This app will not fall back to raw Markdown or a remote documentation page.'
    }));
    return;
  }
  markdownRenderer.render(container, article.markdown, {
    resolveInternalLink: resolveOfflineDocumentationLink,
    onInternalLink: (target) => {
      state.documentationPendingAnchor = target?.anchor || '';
      readOfflineDocument(target?.id);
    }
  });
  const usedAnchors = new Set();
  container.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((heading) => {
    const base = slugifyDocumentationHeading(heading.textContent) || 'section';
    let slug = base;
    let count = 2;
    while (usedAnchors.has(slug)) {
      slug = `${base}-${count}`;
      count += 1;
    }
    usedAnchors.add(slug);
    heading.id = `documentation-heading-${slug}`;
  });
  if (state.documentationPendingAnchor) {
    const anchor = state.documentationPendingAnchor;
    state.documentationPendingAnchor = '';
    focusDocumentationAnchor(anchor);
  }
}

function renderDocumentationRegexStatus() {
  const status = $('#documentation-regex-status');
  if (!status) return;
  const input = documentationRegexInput();
  const result = createDocumentationRegex(input.pattern, input.flags);
  const sample = String($('#documentation-regex-sample')?.value || '').slice(0, 4096);
  if (!state.documentationRegex.enabled) {
    status.textContent = result.error && input.pattern
      ? result.error
      : 'Regex mode is off. Plain-text search is active.';
    status.dataset.state = result.error && input.pattern ? 'invalid' : 'idle';
    return;
  }
  if (result.error) {
    status.textContent = result.error;
    status.dataset.state = 'invalid';
    return;
  }
  status.textContent = sample
    ? (result.regex.test(sample) ? 'Regex mode is active. The local sample contains a match.' : 'Regex mode is active. The local sample has no match.')
    : 'Regex mode is active. Add local sample text to preview matches.';
  status.dataset.state = 'active';
}

function renderDocumentationArticleList() {
  const list = $('#documentation-article-list');
  const boundary = $('#documentation-bundle-boundary');
  if (!list || !boundary) return;
  list.replaceChildren();
  const bundle = state.offlineDocumentation;
  if (!bundle) {
    boundary.textContent = 'Loading bundled documentation inventory…';
    return;
  }
  boundary.textContent = bundle.boundary || 'This app reads only its bundled documentation directory.';
  const { documents, regex } = filteredDocumentationDocuments();
  renderDocumentationRegexStatus();
  if (regex.enabled && regex.error) {
    const notice = document.createElement('p');
    notice.className = 'muted';
    notice.textContent = 'The invalid regex did not replace the current documentation list. Fix it or return to plain-text search.';
    list.append(notice);
  }
  if (!documents.length) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = regex.enabled ? 'No bundled articles match the current regex.' : 'No bundled articles match the current plain-text search.';
    list.append(empty);
    return;
  }
  documents.forEach((record) => {
    const item = document.createElement('article');
    item.className = 'documentation-article-item';
    item.setAttribute('role', 'listitem');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `documentation-article-button${state.offlineDocument?.id === record.id ? ' selected' : ''}`;
    const heading = document.createElement('strong');
    heading.textContent = record.title;
    const detail = document.createElement('span');
    detail.textContent = record.summary;
    button.append(heading, detail);
    button.addEventListener('click', () => readOfflineDocument(record.id));
    item.append(button);
    list.append(item);
  });
}

function renderDocumentationDestination() {
  const destination = $('#documentation-destination');
  if (!destination) return;
  destination.hidden = !state.documentationOpen;
  document.body.classList.toggle('documentation-open', state.documentationOpen);
  if (!state.documentationOpen) return;
  renderDocumentationArticleList();
  renderDocumentationArticle();
}

async function refreshOfflineDocumentation() {
  const bundle = await safely(() => window.studio.offlineDocs());
  if (!bundle) return;
  state.offlineDocumentation = bundle;
  const documents = documentationDocuments();
  if (!documents.some((record) => record.id === state.offlineDocument?.id)) state.offlineDocument = null;
  renderDocumentationDestination();
  if (!state.offlineDocument && documents.length) await readOfflineDocument(documents[0].id);
}

async function readOfflineDocument(id) {
  if (typeof id !== 'string' || !id) return;
  const article = await safely(() => window.studio.offlineDoc(id));
  if (!article?.document) return;
  state.offlineDocument = article.document;
  renderDocumentationDestination();
}

async function openOfflineDocumentation() {
  state.workspaceDestination = 'servers';
  state.documentationOpen = true;
  renderAll();
  if (!state.offlineDocumentation) await refreshOfflineDocumentation();
  $('#documentation-search')?.focus();
}

function closeOfflineDocumentation() {
  state.documentationOpen = false;
  renderAll();
  $('#server-search')?.focus();
}

function openDocumentationRegexBuilder() {
  const builder = $('#documentation-regex-builder');
  if (!builder) return;
  builder.hidden = false;
  $('#open-documentation-regex-button').setAttribute('aria-expanded', 'true');
  $('#documentation-regex-pattern').value = state.documentationRegex.pattern;
  $('#documentation-regex-flag-i').checked = state.documentationRegex.flags.includes('i');
  $('#documentation-regex-flag-m').checked = state.documentationRegex.flags.includes('m');
  $('#documentation-regex-flag-s').checked = state.documentationRegex.flags.includes('s');
  renderDocumentationRegexStatus();
  $('#documentation-regex-pattern').focus();
}

function closeDocumentationRegexBuilder() {
  const builder = $('#documentation-regex-builder');
  if (!builder) return;
  builder.hidden = true;
  $('#open-documentation-regex-button').setAttribute('aria-expanded', 'false');
  $('#documentation-search').focus();
}

function insertDocumentationRegexToken(token) {
  const input = $('#documentation-regex-pattern');
  const value = DOCUMENTATION_REGEX_TOKENS[token];
  if (!input || !value) return;
  const start = Number.isInteger(input.selectionStart) ? input.selectionStart : input.value.length;
  const end = Number.isInteger(input.selectionEnd) ? input.selectionEnd : start;
  input.value = `${input.value.slice(0, start)}${value}${input.value.slice(end)}`.slice(0, 256);
  const cursor = Math.min(start + value.length, input.value.length);
  input.setSelectionRange(cursor, cursor);
  input.focus();
  renderDocumentationRegexStatus();
}

function applyDocumentationRegex() {
  const input = documentationRegexInput();
  const result = createDocumentationRegex(input.pattern, input.flags);
  if (result.error) {
    renderDocumentationRegexStatus();
    return toast(result.error, 'error');
  }
  state.documentationRegex = { enabled: true, pattern: input.pattern, flags: input.flags };
  renderDocumentationArticleList();
}

function resetDocumentationRegex() {
  state.documentationRegex = { enabled: false, pattern: '', flags: '' };
  $('#documentation-regex-pattern').value = '';
  $('#documentation-regex-flag-i').checked = false;
  $('#documentation-regex-flag-m').checked = false;
  $('#documentation-regex-flag-s').checked = false;
  renderDocumentationArticleList();
}

function authenticatorRegexConfig() {
  const enabled = $('#authenticator-regex-enabled')?.checked === true;
  const pattern = $('#authenticator-regex-pattern')?.value || '';
  const flags = $('#authenticator-regex-flags')?.value || '';
  if (!enabled) return { enabled: false, error: '', matcher: null };
  if (pattern.length === 0) return { enabled: true, error: 'Enter a regex pattern before enabling regex search.', matcher: null };
  if (pattern.length > 128 || flags.length > 3 || !/^[imu]*$/.test(flags) || new Set(flags).size !== flags.length) {
    return { enabled: true, error: 'Use a bounded pattern and unique i, m, or u flags only.', matcher: null };
  }
  try {
    return { enabled: true, error: '', matcher: new RegExp(pattern, flags) };
  } catch {
    return { enabled: true, error: 'This regex pattern is invalid. No entries match until it is corrected.', matcher: null };
  }
}

function updateAuthenticatorRegexStatus() {
  const config = authenticatorRegexConfig();
  const status = $('#authenticator-regex-status');
  if (status) {
    status.textContent = config.enabled
      ? (config.error || 'Regex search is active for bounded local labels.')
      : 'Plain-text search is active.';
    status.dataset.state = config.error ? 'invalid' : (config.enabled ? 'active' : 'plain');
  }
  return config;
}

function authenticatorEntryMatches(entry, config) {
  const haystack = [entry.issuer, entry.account, entry.label, entry.group].join(' · ').slice(0, 512);
  const query = ($('#authenticator-search')?.value || '').trim();
  if (config.enabled) return Boolean(config.matcher && config.matcher.test(haystack));
  return !query || haystack.toLocaleLowerCase('en-US').includes(query.toLocaleLowerCase('en-US'));
}

function formatAuthenticatorCode(code) {
  const value = String(code || '');
  if (!/^\d{6,8}$/.test(value)) return 'Unavailable';
  const split = Math.ceil(value.length / 2);
  return `${value.slice(0, split)} ${value.slice(split)}`;
}

function renderAuthenticator() {
  const status = state.authenticatorStatus || state.authenticator?.status;
  const statusTarget = $('#authenticator-status');
  if (statusTarget) {
    if (!status) {
      statusTarget.textContent = 'Loading local authenticator status…';
      statusTarget.dataset.state = 'loading';
    } else {
      statusTarget.textContent = `${status.detail} ${status.clock?.detail || ''}`.trim();
      statusTarget.dataset.state = status.state || 'unavailable';
      $('#authenticator-qr-unavailable').disabled = status.registration?.qr?.available !== true;
      $('#authenticator-qr-boundary').textContent = status.registration?.qr?.reason || 'QR pairing is unavailable.';
    }
  }

  const list = $('#authenticator-entry-list');
  if (!list) return;
  list.replaceChildren();
  const config = updateAuthenticatorRegexStatus();
  const entries = Array.isArray(state.authenticator?.entries) ? state.authenticator.entries : [];
  const visible = config.enabled && config.error ? [] : entries.filter((entry) => authenticatorEntryMatches(entry, config));
  if (!visible.length) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = entries.length
      ? (config.enabled && config.error ? 'Fix the regex pattern to show matching entries.' : 'No local authenticator entries match this search.')
      : 'No local authenticator entries have been saved yet.';
    list.append(empty);
    return;
  }
  for (const entry of visible) {
    const card = document.createElement('article');
    card.className = 'authenticator-entry-card';
    card.dataset.state = entry.codeState || 'unavailable';
    const heading = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = entry.label;
    const detail = document.createElement('span');
    detail.textContent = `${entry.issuer} · ${entry.account} · ${entry.group}`;
    heading.append(title, detail);

    const codeBox = document.createElement('div');
    codeBox.className = 'authenticator-code-box';
    const code = document.createElement('output');
    code.textContent = entry.codeState === 'ready' ? formatAuthenticatorCode(entry.code) : 'Unavailable';
    code.setAttribute('aria-label', entry.codeState === 'ready' ? `Current code for ${entry.label}` : `Code unavailable for ${entry.label}`);
    const countdown = document.createElement('span');
    countdown.textContent = entry.codeState === 'ready'
      ? `${entry.secondsRemaining} seconds remaining · next ${formatAuthenticatorCode(entry.nextCode)}`
      : (entry.detail || 'Protected credential unavailable.');
    codeBox.append(code, countdown);

    const actions = document.createElement('div');
    actions.className = 'authenticator-entry-actions';
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'outlined-action';
    copy.textContent = 'Copy current code';
    copy.disabled = entry.codeState !== 'ready';
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(entry.code);
        toast(`Current code copied for ${entry.label}.`, 'success');
      } catch {
        toast('Clipboard access was unavailable. The code remains visible for manual entry.', 'error');
      }
    });
    actions.append(copy);
    card.append(heading, codeBox, actions);
    list.append(card);
  }
}

function renderToyLocks() {
  const status = state.toyLockStatus || state.toyLocks?.status;
  const statusTarget = $('#toy-lock-status');
  if (statusTarget) {
    statusTarget.textContent = status?.detail || 'Loading toy-lock status…';
    statusTarget.dataset.state = status?.state || 'loading';
  }
  const recoveryDirectory = $('#toy-lock-recovery-directory');
  if (recoveryDirectory && status?.recoveryDirectory) recoveryDirectory.textContent = status.recoveryDirectory;
  const list = $('#toy-lock-list');
  if (!list) return;
  list.replaceChildren();
  const locks = Array.isArray(state.toyLocks?.locks) ? state.toyLocks.locks : [];
  if (!locks.length) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'No toy locks are configured. The authenticator tab is the only actively guarded target in this foundation.';
    list.append(empty);
    return;
  }
  for (const lock of locks) {
    const card = document.createElement('article');
    card.className = 'toy-lock-card';
    card.dataset.state = lock.state;
    const title = document.createElement('strong');
    title.textContent = lock.targetLabel;
    const detail = document.createElement('span');
    const duration = lock.unlockMinutes === 0 ? 'until the app closes' : `for ${lock.unlockMinutes} minutes`;
    detail.textContent = `${lock.targetType} · ${lock.targetId} · ${lock.method.toUpperCase()} · ${lock.state} ${duration}`;
    const stateDetail = document.createElement('small');
    stateDetail.textContent = lock.state === 'unlocked'
      ? (lock.unlockedUntil ? `Unlocked until ${new Date(lock.unlockedUntil).toLocaleTimeString()}.` : 'Unlocked until the app closes.')
      : 'Locked. Use this lock\'s own credential to unlock it.';
    const actions = document.createElement('div');
    actions.className = 'authenticator-entry-actions';
    const control = document.createElement('button');
    control.type = 'button';
    control.className = 'outlined-action';
    control.textContent = lock.state === 'unlocked' ? 'Lock again' : 'Unlock';
    control.addEventListener('click', () => {
      if (lock.state === 'unlocked') relockToyLock(lock.id);
      else openToyLockUnlockDialog(lock);
    });
    actions.append(control);
    card.append(title, detail, stateDetail, actions);
    list.append(card);
  }
}

function setAuthenticatorTab(tab) {
  state.activeAuthenticatorTab = tab;
  $$('.authenticator-tab-strip .tab').forEach((button) => {
    const active = button.dataset.authenticatorTab === tab;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  $$('.authenticator-panel').forEach((panel) => {
    const active = panel.dataset.authenticatorPanel === tab;
    panel.hidden = !active;
  });
}

function activeToyLockForAuthenticatorTab() {
  return (state.toyLocks?.locks || []).find((lock) => lock.targetType === 'tab' && lock.targetId === 'authenticator' && lock.state === 'locked') || null;
}

async function openAuthenticatorDestination() {
  state.documentationOpen = false;
  await refreshToyLocks();
  const lock = activeToyLockForAuthenticatorTab();
  if (lock) {
    state.pendingAuthenticatorDestination = true;
    openToyLockUnlockDialog(lock);
    toast('The authenticator tab is locked by its configured toy lock.', 'info');
    return;
  }
  state.pendingAuthenticatorDestination = false;
  state.workspaceDestination = 'authenticator';
  renderAll();
  await Promise.all([refreshAuthenticator(), refreshToyLocks()]);
}

function returnToServers() {
  state.pendingAuthenticatorDestination = false;
  state.workspaceDestination = 'servers';
  renderAll();
}

async function authenticatorCall(work, quiet) {
  if (!quiet) return safely(work);
  try {
    return await work();
  } catch {
    return null;
  }
}

async function refreshAuthenticator(options = {}) {
  const quiet = options?.quiet === true;
  const status = await authenticatorCall(() => window.studio.authenticatorStatus(), quiet);
  if (status) state.authenticatorStatus = status;
  if (status?.state === 'metadata-unavailable') {
    state.authenticator = { status, entries: [] };
    renderAuthenticator();
    return;
  }
  const snapshot = await authenticatorCall(() => window.studio.authenticatorSnapshot(), quiet);
  if (snapshot) {
    state.authenticator = snapshot;
    state.authenticatorStatus = snapshot.status || state.authenticatorStatus;
  }
  renderAuthenticator();
}

async function refreshToyLocks() {
  const status = await safely(() => window.studio.toyLockStatus());
  if (status) state.toyLockStatus = status;
  if (status?.state === 'metadata-unavailable') {
    state.toyLocks = { status, locks: [] };
    renderToyLocks();
    return;
  }
  const snapshot = await safely(() => window.studio.listToyLocks());
  if (snapshot) {
    state.toyLocks = snapshot;
    state.toyLockStatus = snapshot.status || state.toyLockStatus;
  }
  renderToyLocks();
}

async function createAuthenticatorEntry(event) {
  event.preventDefault();
  const result = await safely(() => window.studio.createAuthenticatorEntry({
    issuer: $('#authenticator-issuer').value,
    account: $('#authenticator-account').value,
    label: $('#authenticator-label').value,
    group: $('#authenticator-group').value,
    manualSecret: $('#authenticator-manual-secret').value,
    otpauthUri: $('#authenticator-uri').value,
    algorithm: $('#authenticator-algorithm').value,
    digits: Number($('#authenticator-digits').value),
    period: Number($('#authenticator-period').value)
  }));
  if (!result) return;
  ['authenticator-issuer', 'authenticator-account', 'authenticator-label', 'authenticator-manual-secret', 'authenticator-uri'].forEach((id) => { $(`#${id}`).value = ''; });
  $('#authenticator-group').value = 'Ungrouped';
  state.unsaved.authenticatorEntry = false;
  toast(`Local authenticator entry saved: ${result.label}.`, 'success');
  await refreshAuthenticator();
}

function toggleToyLockMethod() {
  const totp = $('#toy-lock-method').value === 'totp';
  $('#toy-lock-password-fields').hidden = totp;
  $('#toy-lock-totp-fields').hidden = !totp;
}

async function createToyLock(event) {
  event.preventDefault();
  const result = await safely(() => window.studio.createToyLock({
    targetType: $('#toy-lock-target-type').value,
    targetId: $('#toy-lock-target-id').value.trim(),
    targetLabel: $('#toy-lock-target-label').value,
    method: $('#toy-lock-method').value,
    password: $('#toy-lock-password').value,
    passwordConfirmation: $('#toy-lock-password-confirmation').value,
    totpSecret: $('#toy-lock-totp-secret').value,
    unlockMinutes: $('#toy-lock-duration').value
  }));
  if (!result) return;
  ['toy-lock-password', 'toy-lock-password-confirmation', 'toy-lock-totp-secret'].forEach((id) => { $(`#${id}`).value = ''; });
  state.unsaved.toyLockDraft = false;
  toast(`Toy lock created for ${result.targetLabel}.`, 'success');
  await refreshToyLocks();
}

function openToyLockUnlockDialog(lock) {
  state.activeToyLockId = lock.id;
  const dialog = $('#toy-lock-unlock-dialog');
  $('#toy-lock-unlock-title').textContent = `Unlock ${lock.targetLabel}`;
  $('#toy-lock-unlock-copy').textContent = `Enter the independent ${lock.method.toUpperCase()} credential for ${lock.targetLabel}. This is a toy lock, not a security boundary.`;
  $('#toy-lock-unlock-credential-label').textContent = lock.method === 'totp' ? 'Current TOTP code' : 'Password';
  const credential = $('#toy-lock-unlock-credential');
  credential.value = '';
  credential.autocomplete = lock.method === 'totp' ? 'one-time-code' : 'current-password';
  credential.inputMode = lock.method === 'totp' ? 'numeric' : 'text';
  const recovery = state.toyLockStatus?.recoveryDirectory || state.toyLocks?.status?.recoveryDirectory || '';
  $('#toy-lock-unlock-recovery').textContent = recovery
    ? `Recovery: delete ${recovery} yourself to reset every toy lock. No ticket is sent anywhere.`
    : 'Recovery: delete the application data folder yourself to reset every toy lock. No ticket is sent anywhere.';
  dialog.showModal();
  credential.focus();
}

function closeToyLockUnlockDialog() {
  state.activeToyLockId = null;
  state.pendingAuthenticatorDestination = false;
  state.unsaved.toyLockUnlock = false;
  $('#toy-lock-unlock-dialog').close();
}

async function submitToyLockUnlock(event) {
  event.preventDefault();
  const lockId = state.activeToyLockId;
  if (!lockId) return;
  const unlocked = await safely(() => window.studio.unlockToyLock(lockId, $('#toy-lock-unlock-credential').value));
  if (!unlocked) return;
  $('#toy-lock-unlock-credential').value = '';
  const shouldOpenAuthenticator = state.pendingAuthenticatorDestination && unlocked.targetType === 'tab' && unlocked.targetId === 'authenticator';
  state.activeToyLockId = null;
  state.pendingAuthenticatorDestination = false;
  state.unsaved.toyLockUnlock = false;
  $('#toy-lock-unlock-dialog').close();
  await refreshToyLocks();
  if (shouldOpenAuthenticator) {
    state.workspaceDestination = 'authenticator';
    renderAll();
    await refreshAuthenticator();
  }
}

async function relockToyLock(lockId) {
  const result = await safely(() => window.studio.relockToyLock(lockId));
  if (!result) return;
  toast(`Toy lock restored for ${result.targetLabel}.`, 'success');
  await refreshToyLocks();
}

function renderAll() {
  renderServers();
  renderDependencies();
  renderEditor();
  renderBuildToolsPlan();
  renderAuthenticator();
  renderToyLocks();
  renderConsole();
  renderLocalStatus();
  renderLocalHistory();
  renderBackupLifecycle();
  renderApplicationUpdate();
  renderOllama();
  renderConverter();
  renderDocumentationDestination();
  setActiveTab(state.activeTab);
}

function appearanceContextSearchElements(id) {
  if (id === 'tab') return $$('#server-editor .tab');
  if (id === 'appearance') return $$('.appearance-searchable');
  return [];
}

function appearanceContextSearchLabel(id, element) {
  if (id === 'tab') return String(element.textContent || '').replace(/\s+/g, ' ').trim();
  return String(element.dataset.appearanceSearch || element.textContent || '').replace(/\s+/g, ' ').trim();
}

function appearanceContextSearchControls(id) {
  return {
    input: $(`#${id}-search`),
    toggle: $(`#${id}-search-regex-toggle`),
    builder: $(`#${id}-search-regex-builder`),
    pattern: $(`#${id}-search-pattern`),
    sample: $(`#${id}-search-sample`),
    feedback: $(`#${id}-search-regex-feedback`),
    captures: $(`#${id}-search-regex-captures`),
    status: $(`#${id}-search-status`),
    flags: ['i', 'm', 'u'].reduce((result, flag) => ({ ...result, [flag]: $(`#${id}-search-flag-${flag}`) }), {})
  };
}

function appearanceContextSearchFlags(id) {
  const controls = appearanceContextSearchControls(id);
  return ['i', 'm', 'u'].filter((flag) => controls.flags[flag]?.checked).join('');
}

function buildAppearanceContextSearchMatcher(id) {
  const search = appearanceContextSearches[id];
  const controls = appearanceContextSearchControls(id);
  const query = String(controls.input?.value || '').slice(0, 256);
  search.query = query;
  if (search.mode !== 'regex') {
    const normalized = query.trim().toLocaleLowerCase();
    return {
      kind: 'plain',
      query,
      detail: normalized ? `Plain-text matching for “${query.trim()}”.` : 'Plain-text matching with no query shows every item.',
      test: (label) => ({ matches: !normalized || label.toLocaleLowerCase().includes(normalized), captures: [] })
    };
  }
  const pattern = String(controls.pattern?.value ?? search.pattern ?? '').slice(0, 256);
  search.pattern = pattern;
  search.query = pattern;
  const flags = appearanceContextSearchFlags(id);
  try {
    const expression = new RegExp(pattern, flags);
    return {
      kind: 'regex',
      query: pattern,
      detail: pattern ? `Regex /${pattern}/${flags} is active.` : `Regex /(?:)/${flags} is active and matches every item.`,
      test: (label) => {
        const match = label.match(expression);
        return { matches: Boolean(match), captures: match ? match.slice(1) : [] };
      }
    };
  } catch (error) {
    return {
      kind: 'invalid',
      query: pattern,
      detail: `Regex is invalid: ${error?.message || 'pattern could not be compiled.'}`,
      test: () => ({ matches: true, captures: [] })
    };
  }
}

function renderAppearanceContextSearchFeedback(id, matcher, matches, firstCapture) {
  const controls = appearanceContextSearchControls(id);
  if (controls.feedback) {
    controls.feedback.dataset.state = matcher.kind;
    controls.feedback.textContent = matcher.detail;
  }
  if (controls.captures) {
    const sample = String(controls.sample?.value || '').slice(0, 512);
    const sampleResult = matcher.kind === 'regex' && sample ? matcher.test(sample) : null;
    const captures = sampleResult?.captures?.length ? sampleResult.captures : firstCapture;
    controls.captures.textContent = matcher.kind === 'regex'
      ? (sample
        ? (sampleResult?.matches ? `Sample matches. Capture groups: ${captures?.map((value, index) => `$${index + 1}=${value || '∅'}`).join(' · ') || 'none'}` : 'Sample does not match the current pattern.')
        : (captures?.length ? `First matching capture groups: ${captures.map((value, index) => `$${index + 1}=${value || '∅'}`).join(' · ')}` : 'Add sample text to inspect captures.'))
      : 'Regex is off. Plain-text search is active.';
  }
  if (controls.status) {
    const noun = id === 'tab' ? 'tab' : 'control group';
    controls.status.dataset.state = matcher.kind === 'invalid' ? 'invalid' : matches.length ? 'ready' : 'empty';
    controls.status.textContent = matcher.kind === 'invalid'
      ? 'The regex is invalid, so no items were hidden.'
      : matches.length
        ? `${matches.length} ${noun}${matches.length === 1 ? '' : 's'} match${matches.length === 1 ? 'es' : ''} the current ${matcher.kind === 'regex' ? 'regex' : 'plain-text'} filter.`
        : `No ${noun}s match the current filter.`;
  }
}

function renderTabOverflow() {
  const list = $('#tab-overflow-list');
  if (!list) return;
  list.replaceChildren();
  const visibleTabs = $$('#server-editor .tab').filter((tab) => !tab.hidden);
  if (!visibleTabs.length) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'No settings tabs match the current filter.';
    list.append(empty);
    return;
  }
  visibleTabs.forEach((tab) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tab-overflow-item';
    button.setAttribute('role', 'listitem');
    button.dataset.tab = tab.dataset.tab;
    button.setAttribute('aria-current', String(tab.dataset.tab === state.activeTab));
    button.textContent = tab.textContent;
    button.addEventListener('click', () => {
      setActiveTab(tab.dataset.tab, { persist: true, focus: true });
      closeTabOverflow(false);
    });
    list.append(button);
  });
}

function applyAppearanceContextSearch(id) {
  const matcher = buildAppearanceContextSearchMatcher(id);
  const matches = [];
  let firstCapture = null;
  appearanceContextSearchElements(id).forEach((element) => {
    const result = matcher.test(appearanceContextSearchLabel(id, element));
    element.hidden = matcher.kind === 'invalid' ? false : !result.matches;
    if (result.matches) {
      matches.push(element);
      if (!firstCapture && result.captures?.length) firstCapture = result.captures;
    }
  });
  if (id === 'tab') {
    const activeVisible = matches.some((tab) => tab.dataset.tab === state.activeTab);
    if (matches.length && !activeVisible) setActiveTab(matches[0].dataset.tab, { persist: false });
    renderTabOverflow();
  }
  renderAppearanceContextSearchFeedback(id, matcher, matches, firstCapture);
}

function toggleAppearanceRegexBuilder(id) {
  const controls = appearanceContextSearchControls(id);
  if (!controls.builder || !controls.toggle) return;
  const nextOpen = controls.builder.hidden;
  controls.builder.hidden = !nextOpen;
  controls.toggle.setAttribute('aria-expanded', String(nextOpen));
  if (nextOpen) {
    if (controls.pattern && !controls.pattern.value) controls.pattern.value = controls.input?.value || '';
    controls.pattern?.focus();
  }
}

function insertAppearanceRegexToken(id, token) {
  const controls = appearanceContextSearchControls(id);
  const pattern = controls.pattern;
  if (!pattern) return;
  const start = pattern.selectionStart ?? pattern.value.length;
  const end = pattern.selectionEnd ?? start;
  pattern.value = `${pattern.value.slice(0, start)}${token}${pattern.value.slice(end)}`.slice(0, 256);
  pattern.selectionStart = pattern.selectionEnd = Math.min(start + token.length, pattern.value.length);
  appearanceContextSearches[id].mode = 'regex';
  if (controls.input) controls.input.value = pattern.value;
  applyAppearanceContextSearch(id);
  pattern.focus();
}

function usePlainAppearanceContextSearch(id) {
  const controls = appearanceContextSearchControls(id);
  appearanceContextSearches[id].mode = 'plain';
  if (controls.input && controls.pattern) controls.input.value = controls.pattern.value;
  applyAppearanceContextSearch(id);
}

function bindAppearanceContextSearch(id) {
  const controls = appearanceContextSearchControls(id);
  controls.input?.addEventListener('input', () => {
    if (appearanceContextSearches[id].mode === 'regex' && controls.pattern) controls.pattern.value = controls.input.value;
    applyAppearanceContextSearch(id);
  });
  controls.toggle?.addEventListener('click', () => toggleAppearanceRegexBuilder(id));
  controls.pattern?.addEventListener('input', () => {
    appearanceContextSearches[id].mode = 'regex';
    if (controls.input) controls.input.value = controls.pattern.value;
    applyAppearanceContextSearch(id);
  });
  controls.sample?.addEventListener('input', () => applyAppearanceContextSearch(id));
  Object.values(controls.flags).forEach((control) => control?.addEventListener('change', () => {
    appearanceContextSearches[id].mode = 'regex';
    applyAppearanceContextSearch(id);
  }));
  $$(`[data-appearance-regex-insert="${id}"]`).forEach((button) => button.addEventListener('click', () => insertAppearanceRegexToken(id, button.dataset.appearanceRegexToken || '')));
  $$(`[data-appearance-regex-plain="${id}"]`).forEach((button) => button.addEventListener('click', () => usePlainAppearanceContextSearch(id)));
}

function openTabOverflow() {
  const panel = $('#tab-overflow-panel');
  const button = $('#tab-overflow-toggle');
  if (!panel || !button) return;
  panel.hidden = false;
  button.setAttribute('aria-expanded', 'true');
  renderTabOverflow();
  panel.querySelector('button')?.focus();
}

function closeTabOverflow(restoreFocus = true) {
  const panel = $('#tab-overflow-panel');
  const button = $('#tab-overflow-toggle');
  if (!panel || !button) return;
  panel.hidden = true;
  button.setAttribute('aria-expanded', 'false');
  if (restoreFocus) button.focus();
}

function toggleTabOverflow() {
  if ($('#tab-overflow-panel')?.hidden) openTabOverflow();
  else closeTabOverflow();
}

function handleServerTabKeydown(event) {
  const strip = $('#server-tab-strip');
  const vertical = strip?.getAttribute('aria-orientation') === 'vertical';
  const tabs = $$('#server-editor .tab').filter((tab) => !tab.hidden);
  if (!tabs.length) return;
  const currentIndex = Math.max(0, tabs.indexOf(event.currentTarget));
  let nextIndex = null;
  if ((vertical && event.key === 'ArrowDown') || (!vertical && event.key === 'ArrowRight')) nextIndex = (currentIndex + 1) % tabs.length;
  if ((vertical && event.key === 'ArrowUp') || (!vertical && event.key === 'ArrowLeft')) nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
  if (event.key === 'Home') nextIndex = 0;
  if (event.key === 'End') nextIndex = tabs.length - 1;
  if (nextIndex === null) return;
  event.preventDefault();
  setActiveTab(tabs[nextIndex].dataset.tab, { persist: true, focus: true });
}

function setActiveTab(tab, options = {}) {
  if (!SERVER_TAB_IDS.includes(tab)) return;
  const persist = options.persist === true;
  const focus = options.focus === true;
  state.activeTab = tab;
  let activeTabId = '';
  $$('#server-editor .tab').forEach((button) => {
    const active = button.dataset.tab === tab;
    const tabId = button.id || `server-tab-${button.dataset.tab}`;
    button.id = tabId;
    if (active) activeTabId = tabId;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
    button.tabIndex = active ? 0 : -1;
    if (active && focus) button.focus();
  });
  $$('#server-editor .settings-panel').forEach((panel) => {
    const active = panel.dataset.panel === tab;
    panel.classList.toggle('active', active);
    panel.hidden = !active;
    if (active && activeTabId) panel.setAttribute('aria-labelledby', activeTabId);
  });
  renderTabOverflow();
  if (persist) persistActiveTab(tab);
}

async function refreshServers() {
  const servers = await safely(() => window.studio.listServers());
  if (!servers) return;
  const previouslySelected = state.selectedId;
  state.servers = servers;
  if (!selectedServer() && servers.length) state.selectedId = servers[0].id;
  if (previouslySelected !== state.selectedId) {
    resetBackupLifecycleState();
    state.paperCliPlan = null;
  }
  renderAll();
  await refreshCommandCatalog();
  await refreshDependencies();
  await refreshBackupOverview();
}

async function refreshDependencies() {
  const inspection = await safely(() => window.studio.inspectDependencies(selectedServer()?.id));
  if (inspection) {
    state.dependencies = inspection;
    for (const dependency of Object.values(inspection.dependencies)) {
      if (dependency.available || dependency.installable === false) delete state.dependencyErrors[dependency.id];
    }
    renderDependencies();
  }
}

async function refreshLocalStatus() {
  const status = await safely(() => window.studio.localStatus());
  if (status) {
    state.localStatus = status;
    state.statusHubBridge = status.snapshot?.statusHubBridge || state.statusHubBridge;
    renderLocalStatus();
  }
}

async function refreshConverter() {
  const snapshot = await safely(() => window.studio.converterSnapshot());
  if (!snapshot) return;
  state.converterSnapshot = snapshot;
  renderConverter();
}

async function chooseConverterSource() {
  const result = await safely(() => window.studio.pickConverterSource());
  if (!result) return;
  state.converterSource = result.source || null;
  state.converterSnapshot = result.snapshot || state.converterSnapshot;
  renderConverter();
  toast('Local source inspection was recorded. No conversion was started.', 'success');
}

async function refreshStatusHubBridgeConfiguration() {
  const bridge = await safely(() => window.studio.statusHubBridge());
  if (!bridge) return;
  state.statusHubBridge = bridge.status || state.statusHubBridge;
  const endpoint = $('#status-hub-endpoint');
  const loopback = $('#status-hub-allow-loopback');
  if (endpoint && document.activeElement !== endpoint) endpoint.value = bridge.configuration?.endpoint || '';
  if (loopback && document.activeElement !== loopback) loopback.checked = bridge.configuration?.allowInsecureLoopback === true;
  renderStatusHubBridge(state.statusHubBridge);
}

async function saveStatusHubBridgeSettings() {
  const bridge = await safely(() => window.studio.configureStatusHubBridge({
    endpoint: $('#status-hub-endpoint').value.trim(),
    allowInsecureLoopback: $('#status-hub-allow-loopback').checked
  }));
  if (!bridge) return;
  state.statusHubBridge = bridge;
  state.unsaved.statusHubBridge = false;
  renderStatusHubBridge(bridge);
  if (bridge.state === 'credential-unavailable') {
    toast('Bridge settings were saved, but a protected enrollment credential is unavailable. No external request was sent.');
  } else {
    toast('Bridge settings were saved. Local status remains the fallback until an accepted transport response arrives.');
  }
  await refreshLocalStatus();
}

async function synchronizeStatusHubBridge() {
  const status = await safely(() => window.studio.syncStatusHubBridge());
  if (!status) return;
  state.localStatus = status;
  state.statusHubBridge = status.snapshot?.statusHubBridge || state.statusHubBridge;
  renderLocalStatus();
  const bridge = state.statusHubBridge;
  if (bridge?.state === 'connected') {
    toast('The Status Hub accepted the bridge response. Raw replies were not delivered to chat.');
  } else {
    toast(bridge?.detail || 'The bridge did not report an accepted external response.', bridge?.state === 'failed' ? 'error' : 'info');
  }
}

async function clearStatusHubBridgeSettings() {
  const bridge = await safely(() => window.studio.configureStatusHubBridge({ endpoint: '', allowInsecureLoopback: false }));
  if (!bridge) return;
  state.statusHubBridge = bridge;
  state.unsaved.statusHubBridge = false;
  renderStatusHubBridge(bridge);
  toast('Bridge settings were removed. Local status remains available.');
  await refreshLocalStatus();
}

async function refreshBackupOverview() {
  const server = selectedServer();
  if (!server) {
    resetBackupLifecycleState();
    renderBackupLifecycle();
    return;
  }
  const overview = await safely(() => window.studio.backupOverview(server.id));
  if (!overview) return;
  if (selectedServer()?.id !== server.id) return;
  state.backupOverview = overview;
  renderBackupLifecycle();
}

async function refreshApplicationUpdate() {
  const update = await safely(() => window.studio.updateStatus());
  if (!update) return;
  state.applicationUpdate = update;
  renderApplicationUpdate();
}

function updateStateLabel(value) {
  return ({
    idle: 'Automatic check scheduled',
    checking: 'Checking for updates',
    current: 'Current',
    available: 'Update available',
    downloading: 'Downloading update',
    ready: 'Ready to restart',
    offline: 'Update feed offline',
    failed: 'Update check failed',
    disabled: 'Automatic checks disabled',
    unconfigured: 'Update feed unavailable'
  })[value] || 'Update status unavailable';
}

function renderApplicationUpdate() {
  const update = state.applicationUpdate;
  const card = $('#application-update-card');
  if (!card || !update) return;
  const stateValue = String(update.state || 'unconfigured');
  card.dataset.state = stateValue;
  $('#application-update-state').textContent = updateStateLabel(stateValue);
  $('#application-update-copy').textContent = update.message || 'No update state is available yet.';
  $('#application-update-version').textContent = update.availableVersion
    ? `Installed version: ${update.currentVersion || 'unknown'} · candidate: ${update.availableVersion}${update.releaseTag ? ` · release: ${update.releaseTag}` : ''}`
    : `Installed version: ${update.currentVersion || 'unknown'}`;
  const integrity = update.integrity || {};
  $('#application-update-integrity').textContent = integrity.detail || 'Squirrel RELEASES metadata has not been checked during this session.';
  $('#application-update-warning').textContent = update.unsignedWarning || 'Update signing state is unavailable.';
  const enabled = update.enabled !== false;
  $('#updates-enabled').checked = enabled;
  $('#updates-enabled').disabled = stateValue === 'unconfigured';
  $('#check-updates-button').disabled = !enabled || ['checking', 'available', 'downloading'].includes(stateValue);
  $('#restart-update-button').disabled = stateValue !== 'ready';
  $('#later-update-button').disabled = stateValue !== 'ready';
  $('#open-update-notes-button').disabled = !update.releaseNotesUrl;
  $('#restart-update-button').textContent = update.restartBlocked ? 'Save work before restart' : 'Restart to install update';
}

const OLLAMA_FALLBACK = Object.freeze({
  state: 'not-checked',
  detail: 'Refresh the fixed local endpoint to inspect the installed and running model inventory.',
  updatedAt: null,
  lastSuccessfulAt: null,
  stale: false,
  version: null,
  installedModels: [],
  runningModels: [],
  capabilities: {}
});

function currentOllama() {
  return state.ollama || OLLAMA_FALLBACK;
}

function ollamaStateLabel(value) {
  return ({
    'not-checked': 'Not checked',
    checking: 'Checking local service',
    healthy: 'Local service healthy',
    unavailable: 'Local service unavailable',
    offline: 'Local API offline',
    failed: 'Local API response rejected'
  })[value] || 'Local runtime status unavailable';
}

function ollamaModelText(model) {
  const details = model?.details || {};
  return [
    model?.name,
    model?.model,
    details.family,
    details.parameterSize,
    details.quantizationLevel,
    ...(Array.isArray(details.families) ? details.families : [])
  ].filter(Boolean).join(' ').slice(0, 1024);
}

function normalizeOllamaRegexFlags(value) {
  const flags = String(value || '').trim();
  if (!/^[imu]*$/.test(flags)) return { valid: false, message: 'Only i, m, and u flags are supported for this bounded local model search.' };
  if (new Set(flags).size !== flags.length) return { valid: false, message: 'Each regex flag can be used only once.' };
  return { valid: true, flags };
}

function ollamaSearchMatcher() {
  const search = state.ollamaSearch;
  if (search.mode !== 'regex') {
    const query = search.query.trim().toLocaleLowerCase();
    return {
      mode: 'plain',
      valid: true,
      match: (model) => !query || ollamaModelText(model).toLocaleLowerCase().includes(query)
    };
  }
  const pattern = search.pattern.trim();
  const normalizedFlags = normalizeOllamaRegexFlags(search.flags);
  if (!normalizedFlags.valid) return { mode: 'regex', valid: false, message: normalizedFlags.message, match: () => false };
  if (!pattern) return { mode: 'regex', valid: true, empty: true, regex: null, match: () => true };
  try {
    const regex = new RegExp(pattern, normalizedFlags.flags);
    return { mode: 'regex', valid: true, regex, match: (model) => regex.test(ollamaModelText(model)) };
  } catch (error) {
    return { mode: 'regex', valid: false, message: `Pattern is invalid: ${error?.message || 'unknown regex error'}.`, match: () => false };
  }
}

function distinctObservedOllamaModels(source) {
  const records = [...(Array.isArray(source.installedModels) ? source.installedModels : []), ...(Array.isArray(source.runningModels) ? source.runningModels : [])];
  const seen = new Set();
  return records.filter((model) => {
    const key = `${model?.name || ''}\u0000${model?.digest || ''}`;
    if (!model?.name || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 256);
}

function renderOllamaRegexBuilder(source, matcher) {
  const search = $('#ollama-model-search');
  const toggle = $('#ollama-model-regex-toggle');
  const builder = $('#ollama-model-regex-builder');
  const pattern = $('#ollama-model-pattern');
  const flags = $('#ollama-model-flags');
  const feedback = $('#ollama-model-regex-feedback');
  const matches = $('#ollama-model-regex-matches');
  const regexMode = state.ollamaSearch.mode === 'regex';
  if (search && document.activeElement !== search) search.value = regexMode ? state.ollamaSearch.pattern : state.ollamaSearch.query;
  if (pattern && document.activeElement !== pattern) pattern.value = state.ollamaSearch.pattern;
  if (flags && document.activeElement !== flags) flags.value = state.ollamaSearch.flags;
  if (builder) builder.hidden = !regexMode;
  if (toggle) {
    toggle.setAttribute('aria-expanded', String(regexMode));
    toggle.textContent = regexMode ? 'Close regex builder' : 'Open regex builder';
  }
  if (!feedback || !matches) return;
  if (!regexMode) {
    feedback.textContent = 'Regex mode is inactive. Plain-text matching is applied to the observed local model names and metadata.';
    matches.textContent = 'No regex pattern is active.';
    return;
  }
  if (!matcher.valid) {
    feedback.textContent = matcher.message;
    matches.textContent = 'Invalid patterns do not filter or execute against the local model inventory.';
    return;
  }
  if (matcher.empty) {
    feedback.textContent = 'Regex mode is active. Enter a bounded pattern to filter the observed local model inventory.';
    matches.textContent = 'An empty pattern currently leaves all observed model records visible.';
    return;
  }
  const observed = distinctObservedOllamaModels(source);
  const matched = observed.filter((model) => matcher.match(model));
  feedback.textContent = `Regex mode is active with flags ${state.ollamaSearch.flags || '(none)'}. The pattern is evaluated only against ${observed.length} bounded local model record(s).`;
  const first = matched[0];
  const firstMatch = first ? matcher.regex.exec(ollamaModelText(first)) : null;
  const captures = firstMatch && firstMatch.length > 1
    ? firstMatch.slice(1).map((value, index) => `group ${index + 1}: ${String(value || '').slice(0, 80)}`).join(' · ')
    : 'no capture groups observed';
  matches.textContent = `${matched.length} matching model record(s). ${captures}.`;
}

function renderOllamaModelList(selector, models, label, matcher, running) {
  const container = $(selector);
  if (!container) return;
  container.replaceChildren();
  const records = Array.isArray(models) ? models.slice(0, 256) : [];
  const visible = records.filter((model) => matcher.match(model));
  if (!visible.length) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = records.length
      ? `No observed ${label.toLowerCase()} models match the active search.`
      : `No ${label.toLowerCase()} models were returned by the local API.`;
    container.append(empty);
    return;
  }
  for (const model of visible) {
    const card = document.createElement('article');
    card.className = 'ollama-model-record';
    card.dataset.running = String(Boolean(running));
    const title = document.createElement('strong');
    title.textContent = model.name || 'Unnamed local model';
    const metadata = [];
    if (model.model && model.model !== model.name) metadata.push(model.model);
    if (Number.isFinite(model.size)) metadata.push(formatBytes(model.size));
    if (Number.isFinite(model.sizeVram)) metadata.push(`${formatBytes(model.sizeVram)} VRAM`);
    if (Number.isFinite(model.contextLength)) metadata.push(`context ${model.contextLength.toLocaleString()}`);
    if (model.details?.family) metadata.push(model.details.family);
    if (model.details?.parameterSize) metadata.push(model.details.parameterSize);
    if (model.details?.quantizationLevel) metadata.push(model.details.quantizationLevel);
    if (model.expiresAt) metadata.push(`expires ${new Date(model.expiresAt).toLocaleString()}`);
    const detail = document.createElement('span');
    detail.textContent = metadata.length ? metadata.join(' · ') : 'The local API did not provide additional safe display metadata for this model.';
    card.append(title, detail);
    container.append(card);
  }
}

function renderOllamaCapabilities(source) {
  const container = $('#ollama-capability-list');
  if (!container) return;
  container.replaceChildren();
  const capabilities = Object.values(source.capabilities || {});
  if (!capabilities.length) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'No local Ollama capability map is available yet.';
    container.append(empty);
    return;
  }
  capabilities.forEach((capability) => {
    const card = document.createElement('article');
    card.className = 'ollama-capability-record';
    card.dataset.state = capability.state || 'unavailable';
    const title = document.createElement('strong');
    title.textContent = `${capability.label || 'Unnamed capability'} — ${capability.state || 'unavailable'}`;
    const detail = document.createElement('span');
    detail.textContent = capability.detail || 'No capability detail is available.';
    card.append(title, detail);
    container.append(card);
  });
}

function renderOllama() {
  const source = currentOllama();
  const card = $('#ollama-suite-card');
  if (!card) return;
  card.dataset.state = source.state || 'not-checked';
  $('#ollama-state').textContent = ollamaStateLabel(source.state);
  $('#ollama-runtime-state').textContent = ollamaStateLabel(source.state);
  $('#ollama-version').textContent = source.version || 'Not observed';
  $('#ollama-last-success').textContent = source.lastSuccessfulAt ? new Date(source.lastSuccessfulAt).toLocaleString() : 'None this session';
  $('#ollama-detail').textContent = source.detail || OLLAMA_FALLBACK.detail;
  $('#refresh-ollama-button').disabled = source.state === 'checking';
  const matcher = ollamaSearchMatcher();
  renderOllamaRegexBuilder(source, matcher);
  renderOllamaModelList('#ollama-installed-models', source.installedModels, 'Installed', matcher, false);
  renderOllamaModelList('#ollama-running-models', source.runningModels, 'Running', matcher, true);
  renderOllamaCapabilities(source);
  setOllamaTab(state.ollamaTab);
}

function setOllamaTab(tab) {
  const target = tab === 'capabilities' ? 'capabilities' : 'runtime';
  state.ollamaTab = target;
  $$('.ollama-tab').forEach((button) => {
    const active = button.dataset.ollamaTab === target;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
    button.tabIndex = active ? 0 : -1;
  });
  $$('.ollama-panel').forEach((panel) => {
    const active = panel.dataset.ollamaPanel === target;
    panel.classList.toggle('active', active);
    panel.hidden = !active;
  });
}

async function refreshOllama() {
  const snapshot = await safely(() => window.studio.refreshOllama());
  if (!snapshot) return;
  state.ollama = snapshot;
  renderOllama();
}

function unsavedWorkState() {
  const createDialog = $('#create-dialog');
  const experienceDialog = $('#experience-settings-dialog');
  const confirmationDialog = $('#command-confirmation-dialog');
  const hasUnsavedWork = Boolean(
    state.unsaved.settings
    || state.unsaved.createDraft
    || state.unsaved.pluginSelection
    || state.unsaved.consoleDraft
    || state.unsaved.statusHubBridge
    || state.unsaved.authenticatorEntry
    || state.unsaved.toyLockDraft
    || state.unsaved.toyLockUnlock
    || state.unsaved.appearance
    || createDialog?.open
    || experienceDialog?.open
    || confirmationDialog?.open
  );
  return {
    hasUnsavedWork,
    detail: hasUnsavedWork ? 'A server setting, creation draft, plugin selection, console draft, authenticator or toy-lock draft, Status Hub bridge edit, appearance preview, or open decision surface has not been saved, discarded, or resolved.' : 'No pending application-owned draft is recorded.'
  };
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
  const plan = await safely(() => window.studio.planBuildTools(server.id, buildToolsInput()));
  if (plan) {
    state.buildToolsPlan = plan;
    $('#buildtools-output').value = plan.workspace?.outputDirectory || '';
    renderBuildToolsPlan(plan);
    toast(plan.readiness?.state === 'blocked'
      ? 'BuildTools plan preview prepared with Java or Git blockers. No process started.'
      : 'Typed BuildTools argument preview prepared. This surface remains plan-only and did not start a process.', plan.readiness?.state === 'blocked' ? 'error' : 'success');
  }
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
  } else if (response.installPlan?.portable?.state === 'configured') {
    $('#java-runtime-state').textContent += ' A verified Eclipse Adoptium fallback is available for the required Java feature if package-manager installation does not provide a compatible runtime.';
  }
}

function renderPluginPlan() {
  const container = $('#plugin-plan');
  if (!container) return;
  const plan = state.pluginPlanServerId === selectedServer()?.id ? state.pluginPlan : null;
  container.replaceChildren();
  if (!plan) {
    container.textContent = 'Choose a local JAR to inspect its ZIP signature, SHA-256, descriptor, dependencies, and compatibility plan before staging.';
    $('#install-plugin-button').disabled = true;
    return;
  }
  const title = document.createElement('strong');
  const descriptor = plan.descriptor || {};
  title.textContent = `${descriptor.name || plan.source.fileName} ${descriptor.version ? `· ${descriptor.version}` : ''}`;
  const summary = document.createElement('span');
  summary.textContent = `${plan.state.replace(/-/g, ' ')} · SHA-256 ${String(plan.source.sha256 || '').slice(0, 16)}… · ${plan.compatibility?.reason || 'Compatibility is not declared.'}`;
  container.append(title, summary);
  const details = [
    descriptor.apiVersion ? `api-version ${descriptor.apiVersion}` : 'no api-version declaration',
    descriptor.hardDependencies?.length ? `required: ${descriptor.hardDependencies.join(', ')}` : 'no declared required dependencies',
    plan.serverRunning ? 'the live server is running, so this JAR will be staged outside plugins' : 'the server is stopped, so a verified JAR can be atomically promoted'
  ];
  const detail = document.createElement('small');
  detail.textContent = details.join(' · ');
  container.append(detail);
  for (const message of [...(plan.blockers || []), ...(plan.warnings || [])]) {
    const item = document.createElement('small');
    item.className = plan.blockers?.includes(message) ? 'plugin-plan-blocker' : 'muted';
    item.textContent = message;
    container.append(item);
  }
  $('#install-plugin-button').disabled = Boolean(plan.blockers?.length);
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
    text.textContent = 'No plugin JARs are installed or staged for this server.';
    container.append(text);
  } else {
    plugins.forEach((plugin) => {
      const item = document.createElement('article');
      item.className = 'plugin-pill';
      const title = document.createElement('strong');
      title.textContent = `${plugin.state === 'staged' ? 'Staged' : 'Installed'} · ${plugin.fileName}`;
      const descriptor = plugin.descriptor || {};
      const detail = document.createElement('small');
      detail.textContent = `${descriptor.name || 'Unidentified plugin'}${descriptor.version ? ` ${descriptor.version}` : ''}${plugin.sha256 ? ` · SHA-256 ${plugin.sha256.slice(0, 16)}…` : ''}`;
      item.append(title, detail);
      if (plugin.inspectionError) {
        const warning = document.createElement('small');
        warning.className = 'plugin-plan-blocker';
        warning.textContent = plugin.inspectionError;
        item.append(warning);
      }
      container.append(item);
    });
  }
  const stagedCount = plugins.filter((plugin) => plugin.state === 'staged').length;
  $('#promote-staged-plugins-button').disabled = !stagedCount || server.status === 'running';
  renderPluginPlan();
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
    state.unsaved.createDraft = false;
    $('#create-dialog').close();
    await refreshServers();
    await refreshDependencies();
  }
}

async function saveSettings(event) {
  event.preventDefault();
  const server = selectedServer();
  if (!server) return;
  const gameRules = gameRulesFromForm();
  const saved = await safely(() => window.studio.updateServer(server.id, {
    name: $('#edit-name').value,
    memoryGb: $('#memory-gb').value,
    javaPath: $('#java-runtime').value || $('#java-path').value,
      launchProfile: {
        gc: $('#jvm-gc').value,
        diagnostics: $('#jvm-diagnostics').value,
        expertTokens: $('#jvm-expert-tokens').value
      },
      paperCliProfile: paperCliProfileFromForm(),
      eulaAccepted: $('#eula-accepted').checked,
    settings: settingsFromForm()
  }), 'Server properties and local settings saved.');
  if (saved) {
    const applied = await safely(() => window.studio.applyGameRules(server.id, gameRules));
    if (applied) toast('Game-rule delivery state updated without treating it as a server.properties field.', 'success');
    state.unsaved.settings = false;
    await refreshServers();
  }
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
    state.unsaved.settings = false;
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

function destructiveConfirmationFor(plan) {
  return {
    confirmed: true,
    firstConfirmation: true,
    secondConfirmation: true,
    sliderValue: 100,
    digest: plan?.authority?.digest || '',
    confirmedAt: new Date().toISOString()
  };
}

async function prepareBackup() {
  const server = selectedServer();
  if (!server) return;
  const plan = await safely(() => window.studio.backupPreflight(server.id));
  if (!plan) return;
  state.backupPlan = plan;
  renderBackupLifecycle();
  toast(plan.state === 'ready' ? 'Bounded backup preview prepared. Review the inventory before copying.' : planCopy(plan, 'Backup preview is blocked.'), plan.state === 'ready' ? 'success' : 'error');
}

async function createBackup() {
  const server = selectedServer();
  const plan = state.backupPlan;
  if (!server || !plan || plan.state !== 'ready') return toast('Prepare a ready backup preview before creating a local snapshot.', 'error');
  const backup = await safely(() => window.studio.createBackup(server.id, { digest: plan.authority?.digest || '' }), 'Local backup created with a manifest and per-file SHA-256 values.');
  if (!backup) return;
  state.backupPlan = null;
  await refreshBackupOverview();
  await refreshLocalStatus();
}

async function prepareRestore() {
  const server = selectedServer();
  const backupId = $('#restore-backup-select')?.value;
  if (!server || !backupId) return toast('Choose a complete local backup before preparing a restore preview.', 'error');
  const plan = await safely(() => window.studio.restorePreflight(server.id, backupId));
  if (!plan) return;
  state.restorePlan = plan;
  renderBackupLifecycle();
  toast(plan.state === 'ready' ? 'Restore preview prepared. It will create a new safety backup before replacement.' : planCopy(plan, 'Restore preview is blocked.'), plan.state === 'ready' ? 'success' : 'error');
}

function requestRestore() {
  const server = selectedServer();
  const plan = state.restorePlan;
  if (!server || !plan || plan.state !== 'ready') return toast('Prepare a ready restore preview before replacing managed server state.', 'error');
  openDestructiveConfirmation({
    title: 'Confirm snapshot restore',
    copy: 'This replaces the listed managed world, configuration, plugin, log, and server JAR roots. The server must remain stopped. The app creates a new safety backup before replacement, then retains no vault credentials in either snapshot.',
    target: `Affected resource: ${server.name} · backup ${plan.backup?.backupId || 'unknown'} · roots ${(plan.targets || []).join(', ') || 'none'}`,
    execute: async () => {
      const restored = await safely(() => window.studio.restoreBackup(server.id, destructiveConfirmationFor(plan)), 'Snapshot restore completed after a new safety backup was created.');
      if (!restored) return;
      state.restorePlan = null;
      state.paperUpdatePlan = null;
      state.paperRollbackPlan = null;
      await refreshServers();
      await refreshLocalStatus();
    }
  });
}

async function preparePaperUpdate() {
  const server = selectedServer();
  if (!server) return;
  const plan = await safely(() => window.studio.paperUpdatePreflight(server.id));
  if (!plan) return;
  state.paperUpdatePlan = plan;
  renderBackupLifecycle();
  toast(plan.state === 'ready' ? 'Official stable Paper update preview prepared with checksum and backup preflight.' : planCopy(plan, 'Paper update preview is unavailable.'), plan.state === 'ready' ? 'success' : 'error');
}

function requestPaperUpdate() {
  const server = selectedServer();
  const plan = state.paperUpdatePlan;
  if (!server || !plan || plan.state !== 'ready') return toast('Prepare a ready official Paper update preview before replacing server.jar.', 'error');
  openDestructiveConfirmation({
    title: 'Confirm Paper server JAR update',
    copy: 'This replaces only server.jar while the server is stopped. The app creates a new verified local backup first, downloads the reviewed stable Paper JAR to local staging, verifies its byte size and SHA-256, then retains the previous JAR as an app-controlled rollback record. Plugins are never auto-updated.',
    target: `Affected resource: ${server.name} · server.jar · Paper build ${plan.release?.build || 'unknown'} · pre-update backup required`,
    execute: async () => {
      const updated = await safely(() => window.studio.applyPaperUpdate(server.id, destructiveConfirmationFor(plan)), 'Paper server JAR updated with a new backup and rollback record.');
      if (!updated) return;
      state.paperUpdatePlan = null;
      state.paperRollbackPlan = null;
      await refreshServers();
      await refreshLocalStatus();
    }
  });
}

async function preparePaperRollback() {
  const server = selectedServer();
  if (!server) return;
  const plan = await safely(() => window.studio.paperRollbackPreflight(server.id));
  if (!plan) return;
  state.paperRollbackPlan = plan;
  renderBackupLifecycle();
  toast(plan.state === 'ready' ? 'Paper rollback preview prepared with its required pre-replacement backup.' : planCopy(plan, 'Paper rollback preview is unavailable.'), plan.state === 'ready' ? 'success' : 'error');
}

function requestPaperRollback() {
  const server = selectedServer();
  const plan = state.paperRollbackPlan;
  if (!server || !plan || plan.state !== 'ready') return toast('Prepare a ready Paper rollback preview before replacing server.jar.', 'error');
  openDestructiveConfirmation({
    title: 'Confirm Paper server JAR rollback',
    copy: 'This replaces only server.jar while the server is stopped. The app creates a new verified local backup before promoting the retained app-controlled rollback JAR. Plugins are never auto-updated or replaced.',
    target: `Affected resource: ${server.name} · server.jar · retained rollback record · pre-rollback backup required`,
    execute: async () => {
      const rolledBack = await safely(() => window.studio.applyPaperRollback(server.id, destructiveConfirmationFor(plan)), 'Paper server JAR rollback completed with a new backup and a retained reverse rollback record.');
      if (!rolledBack) return;
      state.paperRollbackPlan = null;
      state.paperUpdatePlan = null;
      await refreshServers();
      await refreshLocalStatus();
    }
  });
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

function openDestructiveConfirmation({ title, copy, target, execute }) {
  const dialog = $('#command-confirmation-dialog');
  if (!dialog) return;
  $('#command-confirmation-title').textContent = title;
  $('#command-confirmation-copy').textContent = copy;
  $('#command-confirmation-target').textContent = target;
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
  confirm.onclick = () => { dialog.close('confirmed'); execute(); };
  $('#command-confirmation-cancel').onclick = () => dialog.close('cancelled');
  update();
  dialog.showModal();
}

function openCommandConfirmation(payload) {
  const label = payload.action.label || payload.action.title || payload.action.id;
  const requiresBackup = payload.action.backupRequirement === 'required' || payload.action.backup;
  openDestructiveConfirmation({
    title: `Confirm ${label}`,
    copy: requiresBackup
      ? 'This action can change world or server state. Review the affected server, create the required backup, operate both confirmation controls, then move the slider to authorize it.'
      : 'This action can affect the selected server or connected players. Review the affected server, operate both confirmation controls, then move the slider to authorize it.',
    target: `Affected resource: ${selectedServer()?.name || 'selected local server'} · command /${payload.command}`,
    execute: () => executeCommandAction(payload)
  });
}

function logEvent(event) {
  if (event.type === 'file-converter') {
    refreshConverter();
    return;
  }
  if (event.type === 'status-hub-bridge' && event.bridge) {
    state.statusHubBridge = event.bridge;
    renderStatusHubBridge(event.bridge);
    return;
  }
  if (event?.type === 'application-update') {
    state.applicationUpdate = event.update || null;
    renderApplicationUpdate();
    return;
  }
  const prefix = new Date(event.at || Date.now()).toLocaleTimeString();
  const label = event.serverId ? `[${event.serverId.slice(0, 8)}] ` : '';
  if (event.message) state.logs.push(`${prefix} ${label}${event.message}`);
  else if (event.type === 'server-state') state.logs.push(`${prefix} ${label}Server state: ${event.status}`);
  if (state.logs.length > 800) state.logs.splice(0, state.logs.length - 800);
  renderConsole();
  if (event.type === 'server-state') refreshServers();
  if (/^(backup|paper-)/.test(String(event.type || ''))) refreshBackupOverview();
}

function handleStudioEvent(event) {
  if (event?.type === 'experience-settings') {
    applyExperienceSnapshot(event.payload);
    return;
  }
  if (event?.type === 'local-history' && event.history) {
    state.localHistory = event.history;
    refreshLocalHistory();
    return;
  }
  if (event?.type === 'local-history-recording-failed') {
    toast(event.detail || 'The requested change completed, but its local history event could not be recorded.', 'error');
    refreshLocalHistory();
    return;
  }
  if (event?.type === 'ollama-suite') {
    state.ollama = event.ollama || null;
    renderOllama();
    return;
  }
  if (event?.type === 'authenticator-changed') {
    refreshAuthenticator();
    return;
  }
  if (event?.type === 'toy-locks-changed') {
    refreshToyLocks();
    return;
  }
  logEvent(event || {});
}

function insertOllamaRegexToken(token) {
  const input = $('#ollama-model-pattern');
  if (!input) return;
  const start = Number.isInteger(input.selectionStart) ? input.selectionStart : input.value.length;
  const end = Number.isInteger(input.selectionEnd) ? input.selectionEnd : start;
  const value = input.value;
  const next = `${value.slice(0, start)}${token}${value.slice(end)}`.slice(0, 128);
  state.ollamaSearch.pattern = next;
  state.ollamaSearch.query = next;
  renderOllama();
  input.focus();
  const cursor = Math.min(start + token.length, next.length);
  input.setSelectionRange(cursor, cursor);
}

function bindOllamaSuiteEvents() {
  const search = $('#ollama-model-search');
  const toggle = $('#ollama-model-regex-toggle');
  const pattern = $('#ollama-model-pattern');
  const flags = $('#ollama-model-flags');
  search?.addEventListener('input', () => {
    if (state.ollamaSearch.mode === 'regex') state.ollamaSearch.pattern = search.value.slice(0, 128);
    else state.ollamaSearch.query = search.value.slice(0, 128);
    renderOllama();
  });
  toggle?.addEventListener('click', () => {
    const opening = state.ollamaSearch.mode !== 'regex';
    if (opening) {
      state.ollamaSearch.mode = 'regex';
      state.ollamaSearch.pattern = state.ollamaSearch.query;
    } else {
      state.ollamaSearch.mode = 'plain';
      state.ollamaSearch.query = state.ollamaSearch.pattern;
    }
    renderOllama();
    if (opening) $('#ollama-model-pattern')?.focus();
  });
  pattern?.addEventListener('input', () => {
    state.ollamaSearch.pattern = pattern.value.slice(0, 128);
    state.ollamaSearch.query = state.ollamaSearch.pattern;
    renderOllama();
  });
  flags?.addEventListener('input', () => {
    state.ollamaSearch.flags = flags.value.slice(0, 3);
    renderOllama();
  });
  $$('.regex-token-row [data-ollama-regex-token]').forEach((button) => button.addEventListener('click', () => insertOllamaRegexToken(button.dataset.ollamaRegexToken || '')));
  $('#ollama-copy-pattern')?.addEventListener('click', async () => {
    const matcher = ollamaSearchMatcher();
    if (!matcher.valid) return toast(matcher.message || 'Enter a valid regex pattern before copying it.', 'error');
    const serialized = `/${state.ollamaSearch.pattern}/${state.ollamaSearch.flags}`;
    try {
      await navigator.clipboard.writeText(serialized);
      toast('The local model-search pattern was copied.');
    } catch {
      toast('Clipboard access was unavailable. Select the pattern text instead.', 'error');
    }
  });
  $$('.ollama-tab').forEach((button, index, tabs) => {
    button.addEventListener('click', () => setOllamaTab(button.dataset.ollamaTab));
    button.addEventListener('keydown', (event) => {
      const direction = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
      const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : direction ? (index + direction + tabs.length) % tabs.length : null;
      if (nextIndex === null) return;
      event.preventDefault();
      const target = tabs[nextIndex];
      setOllamaTab(target.dataset.ollamaTab);
      target.focus();
    });
  });
  $('#refresh-ollama-button')?.addEventListener('click', refreshOllama);
}

function bindEvents() {
  attachRegexSearch('preferences');
  attachRegexSearch('schedules');
  bindAppearanceContextSearch('tab');
  bindAppearanceContextSearch('appearance');
  $('#experience-settings-button').addEventListener('click', openExperienceSettings);
  $('#close-experience-settings-dialog').addEventListener('click', closeExperienceSettings);
  $('#close-experience-settings-button').addEventListener('click', closeExperienceSettings);
  $('#experience-settings-form').addEventListener('submit', saveExperienceSettings);
  $('#funny-english').addEventListener('input', previewFunnyLevelOutputs);
  $('#funny-cantonese').addEventListener('input', previewFunnyLevelOutputs);
  $('#save-narrator-settings-button').addEventListener('click', saveNarratorSettings);
  $('#narrator-preview').addEventListener('click', speakNarratorPreview);
  $('#narrator-english-rate').addEventListener('input', renderNarratorRangeOutputs);
  $('#narrator-english-pitch').addEventListener('input', renderNarratorRangeOutputs);
  $('#narrator-cantonese-rate').addEventListener('input', renderNarratorRangeOutputs);
  $('#narrator-cantonese-pitch').addEventListener('input', renderNarratorRangeOutputs);
  $('#schedule-every-day').addEventListener('change', updateScheduleWeekdayControls);
  $('#schedule-source').addEventListener('change', updateScheduleSourceDetail);
  $('#add-scheduled-setting-button').addEventListener('click', addScheduledSetting);
  $('#scheduled-settings-list').addEventListener('change', async (event) => {
    const control = event.target;
    const scheduleId = control?.dataset?.scheduleId;
    if (!scheduleId) return;
    const snapshot = await safely(() => window.studio.setScheduledSettingEnabled(scheduleId, control.checked), 'Scheduled language rule updated.');
    if (snapshot) applyExperienceSnapshot(snapshot);
    else renderScheduledSettings();
  });
  $('#create-school-mode-record-button').addEventListener('click', createSchoolModeRecord);
  $('#save-school-mode-label-button').addEventListener('click', saveSchoolModeLabel);
  $('#save-school-mode-credential-button').addEventListener('click', saveSchoolModeCredential);
  $('#school-mode-enabled').addEventListener('change', changeSchoolMode);
  $('#tab-overflow-toggle').addEventListener('click', toggleTabOverflow);
  $('#tab-overflow-panel').addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeTabOverflow();
    }
  });
  $('#save-appearance-navigation-button').addEventListener('click', saveAppearanceNavigation);
  $('#reset-appearance-target-button').addEventListener('click', resetAppearanceTarget);
  $('#appearance-target').addEventListener('change', () => {
    if (state.unsaved.appearance) {
      state.unsaved.appearance = false;
      applyAppearanceNavigation();
    }
    renderAppearanceTargetEditor();
  });
  $('#appearance-target-surface').addEventListener('input', previewSelectedAppearanceTarget);
  $('#appearance-target-on-surface').addEventListener('input', previewSelectedAppearanceTarget);
  $('#appearance-target-radius').addEventListener('input', previewSelectedAppearanceTarget);
  $('#appearance-font-scale').addEventListener('input', () => {
    $('#appearance-font-scale-output').textContent = `${Math.round(Number($('#appearance-font-scale').value) * 100)}%`;
  });
  $('#tab-dock').addEventListener('change', changeTabDock);
  $('#authenticator-destination-button').addEventListener('click', openAuthenticatorDestination);
  $('#return-to-servers-button').addEventListener('click', returnToServers);
  $$('.authenticator-tab-strip .tab').forEach((button) => button.addEventListener('click', () => setAuthenticatorTab(button.dataset.authenticatorTab)));
  $('#authenticator-entry-form').addEventListener('submit', createAuthenticatorEntry);
  $('#authenticator-entry-form').addEventListener('input', () => { state.unsaved.authenticatorEntry = true; });
  $('#authenticator-entry-form').addEventListener('change', () => { state.unsaved.authenticatorEntry = true; });
  $('#authenticator-refresh-button').addEventListener('click', refreshAuthenticator);
  $('#authenticator-search').addEventListener('input', renderAuthenticator);
  $('#authenticator-regex-toggle').addEventListener('click', () => {
    const builder = $('#authenticator-regex-builder');
    builder.hidden = !builder.hidden;
    $('#authenticator-regex-toggle').setAttribute('aria-expanded', String(!builder.hidden));
    if (!builder.hidden) $('#authenticator-regex-pattern').focus();
  });
  ['authenticator-regex-enabled', 'authenticator-regex-pattern', 'authenticator-regex-flags'].forEach((id) => {
    $(`#${id}`).addEventListener(id === 'authenticator-regex-enabled' ? 'change' : 'input', renderAuthenticator);
  });
  $$('[data-authenticator-regex-token]').forEach((button) => button.addEventListener('click', () => {
    const input = $('#authenticator-regex-pattern');
    const token = button.dataset.authenticatorRegexToken || '';
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    input.setRangeText(token, start, end, 'end');
    input.focus();
    renderAuthenticator();
  }));
  $('#toy-lock-create-form').addEventListener('submit', createToyLock);
  $('#toy-lock-create-form').addEventListener('input', () => { state.unsaved.toyLockDraft = true; });
  $('#toy-lock-create-form').addEventListener('change', () => { state.unsaved.toyLockDraft = true; });
  $('#toy-lock-method').addEventListener('change', toggleToyLockMethod);
  $('#toy-lock-unlock-form').addEventListener('submit', submitToyLockUnlock);
  $('#toy-lock-unlock-credential').addEventListener('input', () => { state.unsaved.toyLockUnlock = Boolean($('#toy-lock-unlock-credential').value); });
  $('#close-toy-lock-unlock-dialog').addEventListener('click', closeToyLockUnlockDialog);
  $('#toy-lock-unlock-cancel').addEventListener('click', closeToyLockUnlockDialog);
  $('#toy-lock-unlock-dialog').addEventListener('close', () => {
    if (state.activeToyLockId) {
      state.activeToyLockId = null;
      state.pendingAuthenticatorDestination = false;
      state.unsaved.toyLockUnlock = false;
    }
  });
  $('#new-server-button').addEventListener('click', openCreateDialog);
  $('#empty-create-button').addEventListener('click', openCreateDialog);
  $('#close-create-dialog').addEventListener('click', () => { state.unsaved.createDraft = false; $('#create-dialog').close(); });
  $('#cancel-create-button').addEventListener('click', () => { state.unsaved.createDraft = false; $('#create-dialog').close(); });
  $('#create-form').addEventListener('submit', createServer);
  $('#create-form').addEventListener('input', () => { state.unsaved.createDraft = true; });
  $('#create-form').addEventListener('change', () => { state.unsaved.createDraft = true; });
  $('#create-dialog').addEventListener('close', () => { state.unsaved.createDraft = false; });
  const markSettingsDraft = (event) => {
    const panel = event.target.closest('[data-panel]')?.dataset.panel;
    if (panel === 'status') {
      state.unsaved.statusHubBridge = true;
      return;
    }
    if (['commands', 'console', 'plugins', 'history'].includes(panel)) return;
    state.unsaved.settings = true;
  };
  $('#settings-form').addEventListener('input', markSettingsDraft);
  $('#settings-form').addEventListener('change', markSettingsDraft);
  $('#browse-root-button').addEventListener('click', async () => {
    const folder = await safely(() => window.studio.pickFolder());
    if (folder) $('#create-root').value = folder;
  });
  $('#create-memory').addEventListener('input', () => { $('#create-memory-output').value = $('#create-memory').value; });
  $('#server-search').addEventListener('input', renderServers);
  $('#refresh-converter-button').addEventListener('click', refreshConverter);
  $('#browse-converter-source-button').addEventListener('click', chooseConverterSource);
  $('#converter-adapter-search').addEventListener('input', () => {
    if ($('#converter-regex-mode').checked) $('#converter-regex-pattern').value = $('#converter-adapter-search').value;
    renderConverter();
  });
  $('#converter-regex-mode').addEventListener('change', () => {
    if ($('#converter-regex-mode').checked && !$('#converter-regex-pattern').value) $('#converter-regex-pattern').value = $('#converter-adapter-search').value;
    renderConverter();
  });
  $('#converter-regex-builder-button').addEventListener('click', () => {
    state.converterRegexBuilderOpen = !state.converterRegexBuilderOpen;
    renderConverter();
  });
  $('#converter-regex-pattern').addEventListener('input', () => {
    $('#converter-adapter-search').value = $('#converter-regex-pattern').value;
    renderConverter();
  });
  $('#converter-regex-flag-ignore-case').addEventListener('change', renderConverter);
  $('#converter-regex-flag-multiline').addEventListener('change', renderConverter);
  $('#converter-regex-sample').addEventListener('input', renderConverter);
  $$('[data-converter-regex-token]').forEach((button) => button.addEventListener('click', () => {
    const pattern = $('#converter-regex-pattern');
    const token = String(button.dataset.converterRegexToken || '');
    pattern.value = `${pattern.value}${token}`.slice(0, 128);
    $('#converter-adapter-search').value = pattern.value;
    $('#converter-regex-mode').checked = true;
    state.converterRegexBuilderOpen = true;
    renderConverter();
    pattern.focus();
  }));
  $('#refresh-button').addEventListener('click', () => { refreshServers(); refreshDependencies(); });
  $('#open-documentation-button').addEventListener('click', openOfflineDocumentation);
  $('#close-documentation-button').addEventListener('click', closeOfflineDocumentation);
  $('#documentation-search').addEventListener('input', () => {
    state.documentationQuery = $('#documentation-search').value.slice(0, 256);
    if (state.documentationRegex.enabled) state.documentationRegex = { enabled: false, pattern: '', flags: '' };
    renderDocumentationArticleList();
  });
  $('#open-documentation-regex-button').addEventListener('click', openDocumentationRegexBuilder);
  $('#close-documentation-regex-button').addEventListener('click', closeDocumentationRegexBuilder);
  $('#documentation-regex-pattern').addEventListener('input', renderDocumentationRegexStatus);
  $('#documentation-regex-sample').addEventListener('input', renderDocumentationRegexStatus);
  ['#documentation-regex-flag-i', '#documentation-regex-flag-m', '#documentation-regex-flag-s'].forEach((selector) => {
    $(selector).addEventListener('change', renderDocumentationRegexStatus);
  });
  $$('[data-documentation-regex-token]').forEach((button) => {
    button.addEventListener('click', () => insertDocumentationRegexToken(button.dataset.documentationRegexToken));
  });
  $('#apply-documentation-regex-button').addEventListener('click', applyDocumentationRegex);
  $('#reset-documentation-regex-button').addEventListener('click', resetDocumentationRegex);
  $('#refresh-dependencies-button').addEventListener('click', refreshDependencies);
  $('#refresh-status-button').addEventListener('click', refreshLocalStatus);
  $('#refresh-local-history-button').addEventListener('click', refreshLocalHistory);
  $('#apply-history-filter-button').addEventListener('click', refreshLocalHistory);
  $('#clear-history-filter-button').addEventListener('click', clearHistoryFilters);
  $('#export-local-history-button').addEventListener('click', exportLocalHistory);
  $('#open-history-export-vscode-button').addEventListener('click', openLatestHistoryExportInVsCode);
  $('#history-search').addEventListener('input', historyRegexPreview);
  $('#history-search').addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    refreshLocalHistory();
  });
  $('#history-regex-enabled').addEventListener('change', historyRegexPreview);
  $('#history-regex-flags').addEventListener('input', historyRegexPreview);
  $('#history-regex-sample').addEventListener('input', historyRegexPreview);
  $$('.history-regex-token').forEach((button) => button.addEventListener('click', () => insertHistoryRegexToken(button.dataset.historyRegexToken || '')));
  bindOllamaSuiteEvents();
  $('#save-status-hub-bridge-button').addEventListener('click', saveStatusHubBridgeSettings);
  $('#sync-status-hub-bridge-button').addEventListener('click', synchronizeStatusHubBridge);
  $('#clear-status-hub-bridge-button').addEventListener('click', clearStatusHubBridgeSettings);
  $('#updates-enabled').addEventListener('change', async () => {
    const update = await safely(() => window.studio.setUpdatesEnabled($('#updates-enabled').checked));
    if (update) {
      state.applicationUpdate = update;
      renderApplicationUpdate();
    }
  });
  $('#check-updates-button').addEventListener('click', async () => {
    const update = await safely(() => window.studio.checkForUpdates());
    if (update) {
      state.applicationUpdate = update;
      renderApplicationUpdate();
    }
  });
  $('#later-update-button').addEventListener('click', async () => {
    const update = await safely(() => window.studio.deferUpdate());
    if (update) {
      state.applicationUpdate = update;
      renderApplicationUpdate();
    }
  });
  $('#restart-update-button').addEventListener('click', async () => {
    const update = await safely(() => window.studio.restartForUpdate());
    if (update) {
      state.applicationUpdate = update;
      renderApplicationUpdate();
      if (update.restartBlocked) toast('Save or discard the recorded work before restarting to install the update.', 'error');
    }
  });
  $('#open-update-notes-button').addEventListener('click', () => safely(() => window.studio.openUpdateNotes()));
  $('#install-dependencies-button').addEventListener('click', async () => {
    const missing = Object.values(state.dependencies?.dependencies || {}).filter((item) => !item.available && item.installable !== false).map((item) => item.id);
    if (!missing.length) {
      return toast(state.dependencies?.dependencies?.java?.requirementState === 'unknown'
        ? 'Automatic Java installation is unavailable because the selected server version has no documented Java requirement.'
        : 'All tools required by the selected server are already available.', state.dependencies?.dependencies?.java?.requirementState === 'unknown' ? 'error' : 'success');
    }
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
  $$('#server-editor .tab').forEach((button) => {
    button.addEventListener('click', () => setActiveTab(button.dataset.tab, { persist: true }));
    button.addEventListener('keydown', handleServerTabKeydown);
  });
  $('#settings-form').addEventListener('submit', saveSettings);
  $('#memory-gb').addEventListener('input', () => { $('#memory-output').value = $('#memory-gb').value; });
  $('#view-distance').addEventListener('input', () => { $('#view-distance-output').value = $('#view-distance').value; });
  $('#simulation-distance').addEventListener('input', () => { $('#simulation-distance-output').value = $('#simulation-distance').value; });
  $('#clear-java-button').addEventListener('click', () => { $('#java-path').value = ''; });
  $('#browse-java-button').addEventListener('click', async () => { const selected = await safely(() => window.studio.pickJava()); if (selected) { $('#java-path').value = selected; $('#java-runtime').value = ''; } });
  $('#refresh-runtimes-button').addEventListener('click', async () => { const server = selectedServer(); if (!server) return; const inventory = await safely(() => window.studio.runtimeInventory(server.id)); if (inventory) renderRuntimeInventory(inventory); });
  $('#prepare-paper-cli-button').addEventListener('click', preparePaperCliPreflight);
  $('#paper-cli-probe-button').addEventListener('click', collectPaperCliJarEvidence);
  $('#paper-cli-open-plugins-button').addEventListener('click', () => setActiveTab('plugins', { persist: true }));
  $$('[data-paper-cli-browse]').forEach((button) => button.addEventListener('click', async () => {
    const selected = await safely(() => window.studio.pickPaperCliPath(button.dataset.paperCliBrowse));
    const target = document.getElementById(button.dataset.paperCliTarget || '');
    if (!selected || !target) return;
    target.value = selected;
    state.paperCliPlan = null;
    state.unsaved.settings = true;
    renderPaperCliPlan(selectedServer());
  }));
  $$('[data-paper-cli-control]').filter((control) => ['INPUT', 'SELECT', 'TEXTAREA'].includes(control.tagName) && !control.disabled).forEach((control) => {
    const invalidate = () => {
      state.paperCliPlan = null;
      renderPaperCliPlan(selectedServer());
    };
    control.addEventListener('input', invalidate);
    control.addEventListener('change', invalidate);
  });
  $('#refresh-spigot-versions-button').addEventListener('click', refreshSpigotVersions);
  $('#browse-buildtools-workspace').addEventListener('click', async () => { const folder = await safely(() => window.studio.pickFolder()); if (folder) $('#buildtools-workspace').value = folder; });
  $('#plan-buildtools-button').addEventListener('click', prepareBuildToolsPlan);
  $('#backup-refresh-button').addEventListener('click', refreshBackupOverview);
  $('#backup-preflight-button').addEventListener('click', prepareBackup);
  $('#backup-create-button').addEventListener('click', createBackup);
  $('#restore-preflight-button').addEventListener('click', prepareRestore);
  $('#restore-backup-button').addEventListener('click', requestRestore);
  $('#restore-backup-select').addEventListener('change', () => {
    state.restorePlan = null;
    renderBackupLifecycle();
  });
  $('#paper-update-preflight-button').addEventListener('click', preparePaperUpdate);
  $('#paper-update-apply-button').addEventListener('click', requestPaperUpdate);
  $('#paper-rollback-preflight-button').addEventListener('click', preparePaperRollback);
  $('#paper-rollback-apply-button').addEventListener('click', requestPaperRollback);
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
  $('#setup-button').addEventListener('click', async () => { const server = selectedServer(); if (!server) return; if (server.software === 'spigot') { setActiveTab('buildtools'); return toast('Spigot setup is unavailable in this build. Review the typed BuildTools plan-only preview; no executor is registered.', 'error'); } await safely(() => window.studio.provision(server.id), 'Official server software is ready.'); });
  $('#start-button').addEventListener('click', async () => { const server = selectedServer(); if (server) await safely(() => window.studio.start(server.id), 'Server start requested.'); });
  $('#stop-button').addEventListener('click', async () => { const server = selectedServer(); if (server) await safely(() => window.studio.stop(server.id), 'Graceful server stop requested.'); });
  $('#browse-plugin-button').addEventListener('click', async () => {
    const selected = await safely(() => window.studio.pickPlugin());
    if (!selected) return;
    const server = selectedServer();
    state.pluginPath = selected;
    state.unsaved.pluginSelection = true;
    $('#plugin-path').value = selected;
    state.pluginPlan = server ? await safely(() => window.studio.planPluginInstall(server.id, selected)) : null;
    state.pluginPlanServerId = server?.id || null;
    renderPluginPlan();
  });
  $('#install-plugin-button').addEventListener('click', async () => {
    const server = selectedServer();
    if (!server) return;
    if (!state.pluginPath) return toast('Choose a local plugin JAR first.', 'error');
    const result = await safely(() => window.studio.installPlugin(server.id, state.pluginPath));
    if (result) {
      toast(result.state === 'staged' ? 'Plugin JAR staged safely outside the live plugins directory.' : 'Plugin JAR promoted with its local rollback record.', 'success');
      state.pluginPath = '';
      state.unsaved.pluginSelection = false;
      state.pluginPlan = null;
      state.pluginPlanServerId = null;
      $('#plugin-path').value = '';
      await refreshPlugins();
    }
  });
  $('#promote-staged-plugins-button').addEventListener('click', async () => {
    const server = selectedServer();
    if (!server) return;
    const result = await safely(() => window.studio.promoteStagedPlugins(server.id));
    if (result) {
      toast(result.promoted?.length ? `Promoted ${result.promoted.length} staged plugin JAR(s).` : 'No staged plugin JAR required promotion.', 'success');
      await refreshPlugins();
    }
  });
  $('#send-console-button').addEventListener('click', async () => { const server = selectedServer(); if (!server) return; const command = $('#console-command').value; const result = await safely(() => window.studio.console(server.id, command)); if (result) { $('#console-command').value = ''; state.unsaved.consoleDraft = false; } });
  $('#console-command').addEventListener('input', () => { state.unsaved.consoleDraft = Boolean($('#console-command').value.trim()); });
  $('#send-rcon-button').addEventListener('click', async () => { const server = selectedServer(); if (!server) return; const command = $('#console-command').value; const response = await safely(() => window.studio.rcon(server.id, command)); if (response !== null) { state.logs.push(rconConsoleLine(response)); $('#console-command').value = ''; state.unsaved.consoleDraft = false; renderConsole(); } });
  $('#clear-console-button').addEventListener('click', () => { state.logs = []; renderConsole(); });
  $$('.command-presets button').forEach((button) => button.addEventListener('click', () => { $('#console-command').value = button.dataset.command; $('#console-command').focus(); }));
}

async function initialize() {
  renderAdvancedControls();
  bindEvents();
  updateScheduleWeekdayControls();
  narrator?.onChange((snapshot) => renderNarratorControls(snapshot));
  toggleToyLockMethod();
  setAuthenticatorTab(state.activeAuthenticatorTab);
  window.studio.onEvent(handleStudioEvent);
  window.studio.onUnsavedWorkQuery(unsavedWorkState);
  const experience = await safely(() => window.studio.experienceSettings());
  if (experience) applyExperienceSnapshot(experience);
  const directory = await safely(() => window.studio.dataDirectory());
  if (directory) $('#data-directory').textContent = `Data: ${directory}`;
  await Promise.all([refreshServers(), refreshDependencies(), refreshVersions(), refreshLocalStatus(), refreshLocalHistory(), refreshStatusHubBridgeConfiguration(), refreshApplicationUpdate(), refreshOllama(), refreshConverter(), refreshOfflineDocumentation(), refreshAuthenticator(), refreshToyLocks()]);
  renderCommandCenter();
  setInterval(() => {
    if (state.workspaceDestination === 'authenticator') refreshAuthenticator({ quiet: true });
  }, 1_000);
}

initialize();
