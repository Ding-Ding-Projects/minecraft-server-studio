'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const APPEARANCE_NAVIGATION_VERSION = 2;
const MAX_RECORD_BYTES = 64 * 1024;
const THEME_MODES = Object.freeze(['system', 'light', 'dark']);
const DENSITY_MODES = Object.freeze(['comfortable', 'compact', 'spacious']);
const FONT_FAMILIES = Object.freeze(['system-ui', 'Segoe UI', 'Arial', 'Georgia', 'Consolas']);
const FONT_WEIGHTS = Object.freeze([400, 500, 600, 700]);
const TAB_DOCKS = Object.freeze(['left', 'right', 'top', 'bottom']);
const TAB_IDS = Object.freeze([
  'general', 'world', 'gameplay', 'network', 'runtime', 'paper-cli', 'buildtools', 'backups',
  'live', 'commands', 'status', 'history', 'advanced', 'plugins', 'console'
]);
const ELEMENT_TARGETS = Object.freeze(['shell', 'tabStrip', 'primaryAction']);
const MAX_TAB_GROUPS = 32;
const MAX_TAB_GROUP_NAME_CHARS = 64;
const TAB_GROUP_ID_PATTERN = /^group-[a-z0-9-]{1,40}$/;

function settingsError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function isPlainRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function assertExactKeys(value, keys, message) {
  if (!isPlainRecord(value)) throw settingsError('APPEARANCE_NAVIGATION_INVALID_RECORD', message);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw settingsError('APPEARANCE_NAVIGATION_INVALID_RECORD', message);
  }
}

function assertPatchKeys(value, keys, message) {
  if (!isPlainRecord(value)) throw settingsError('APPEARANCE_NAVIGATION_INVALID_PATCH', message);
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) throw settingsError('APPEARANCE_NAVIGATION_INVALID_PATCH', message);
  }
}

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeColor(value, label, nullable = false) {
  if (nullable && value === null) return null;
  if (typeof value !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(value)) {
    throw settingsError('APPEARANCE_NAVIGATION_INVALID_VALUE', `${label} must be a six-digit hexadecimal color.`);
  }
  return value.toUpperCase();
}

function normalizeRadius(value, label) {
  if (value === null) return null;
  if (!Number.isInteger(value) || value < 0 || value > 999) {
    throw settingsError('APPEARANCE_NAVIGATION_INVALID_VALUE', `${label} must be a whole number from 0 through 999, or inherit the theme value.`);
  }
  return value;
}

function normalizeTypography(value) {
  assertExactKeys(value, ['family', 'scale', 'weight'], 'Typography settings are invalid.');
  if (!FONT_FAMILIES.includes(value.family)) throw settingsError('APPEARANCE_NAVIGATION_INVALID_VALUE', 'The selected font family is unsupported by this foundation.');
  if (typeof value.scale !== 'number' || !Number.isFinite(value.scale) || value.scale < 0.85 || value.scale > 1.25) {
    throw settingsError('APPEARANCE_NAVIGATION_INVALID_VALUE', 'Typography scale must be between 0.85 and 1.25.');
  }
  if (!FONT_WEIGHTS.includes(value.weight)) throw settingsError('APPEARANCE_NAVIGATION_INVALID_VALUE', 'Typography weight is unsupported.');
  return { family: value.family, scale: Number(value.scale.toFixed(2)), weight: value.weight };
}

function normalizeTabIdList(value, label, options = {}) {
  const { exact = false } = options;
  if (!Array.isArray(value) || value.length > TAB_IDS.length || value.some((tab) => typeof tab !== 'string' || !TAB_IDS.includes(tab))) {
    throw settingsError('APPEARANCE_NAVIGATION_INVALID_VALUE', `${label} must contain supported tab identifiers.`);
  }
  if (new Set(value).size !== value.length) {
    throw settingsError('APPEARANCE_NAVIGATION_INVALID_VALUE', `${label} cannot contain the same tab more than once.`);
  }
  if (exact && (value.length !== TAB_IDS.length || TAB_IDS.some((tab) => !value.includes(tab)))) {
    throw settingsError('APPEARANCE_NAVIGATION_INVALID_VALUE', `${label} must contain every supported tab exactly once.`);
  }
  return [...value];
}

function normalizeTabGroups(value) {
  if (!Array.isArray(value) || value.length > MAX_TAB_GROUPS) {
    throw settingsError('APPEARANCE_NAVIGATION_INVALID_VALUE', 'Tab groups are invalid.');
  }
  const seenIds = new Set();
  const seenNames = new Set();
  const assignedTabs = new Set();
  return value.map((group) => {
    assertExactKeys(group, ['id', 'name', 'color', 'collapsed', 'tabIds'], 'A tab group is invalid.');
    if (typeof group.id !== 'string' || !TAB_GROUP_ID_PATTERN.test(group.id) || seenIds.has(group.id)) {
      throw settingsError('APPEARANCE_NAVIGATION_INVALID_VALUE', 'A tab group identifier is invalid.');
    }
    const name = typeof group.name === 'string'
      ? group.name.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
      : '';
    if (!name || name.length > MAX_TAB_GROUP_NAME_CHARS || seenNames.has(name.toLocaleLowerCase())) {
      throw settingsError('APPEARANCE_NAVIGATION_INVALID_VALUE', 'A tab group name is invalid or already in use.');
    }
    const tabIds = normalizeTabIdList(group.tabIds, `The ${name} tab group`);
    if (tabIds.some((tab) => assignedTabs.has(tab))) {
      throw settingsError('APPEARANCE_NAVIGATION_INVALID_VALUE', 'A tab can belong to only one tab group.');
    }
    if (typeof group.collapsed !== 'boolean') {
      throw settingsError('APPEARANCE_NAVIGATION_INVALID_VALUE', 'A tab group collapse state is invalid.');
    }
    seenIds.add(group.id);
    seenNames.add(name.toLocaleLowerCase());
    tabIds.forEach((tab) => assignedTabs.add(tab));
    return {
      id: group.id,
      name,
      color: normalizeColor(group.color, `${name} group color`),
      collapsed: group.collapsed,
      tabIds
    };
  });
}

function normalizeTabs(value, options = {}) {
  const { legacy = false } = options;
  if (legacy) {
    assertExactKeys(value, ['dock', 'activeTab'], 'Tab-navigation settings are invalid.');
  } else {
    assertExactKeys(value, ['dock', 'activeTab', 'order', 'pinned', 'groups', 'closed'], 'Tab-navigation settings are invalid.');
  }
  if (!TAB_DOCKS.includes(value.dock)) throw settingsError('APPEARANCE_NAVIGATION_INVALID_VALUE', 'Tab dock must be left, right, top, or bottom.');
  if (!TAB_IDS.includes(value.activeTab)) throw settingsError('APPEARANCE_NAVIGATION_INVALID_VALUE', 'The selected tab is unsupported.');
  if (legacy) {
    return {
      dock: value.dock,
      activeTab: value.activeTab,
      order: [...TAB_IDS],
      pinned: [],
      groups: [],
      closed: []
    };
  }
  const order = normalizeTabIdList(value.order, 'Tab order', { exact: true });
  const pinned = normalizeTabIdList(value.pinned, 'Pinned tabs');
  const groups = normalizeTabGroups(value.groups);
  const closed = normalizeTabIdList(value.closed, 'Closed tabs');
  const activeTab = closed.includes(value.activeTab) ? (order.find((tab) => !closed.includes(tab)) || order[0]) : value.activeTab;
  return { dock: value.dock, activeTab, order, pinned, groups, closed };
}

function normalizeElementOverride(value, target) {
  assertExactKeys(value, ['surface', 'onSurface', 'radius'], `The ${target} appearance override is invalid.`);
  return {
    surface: normalizeColor(value.surface, `${target} surface color`, true),
    onSurface: normalizeColor(value.onSurface, `${target} text color`, true),
    radius: normalizeRadius(value.radius, `${target} corner radius`)
  };
}

function normalizeElementOverrides(value) {
  assertExactKeys(value, ELEMENT_TARGETS, 'Element appearance overrides are invalid.');
  return Object.fromEntries(ELEMENT_TARGETS.map((target) => [target, normalizeElementOverride(value[target], target)]));
}

function defaultAppearanceNavigationSettings() {
  return {
    version: APPEARANCE_NAVIGATION_VERSION,
    theme: 'system',
    density: 'comfortable',
    seedColor: '#6750A4',
    typography: { family: 'system-ui', scale: 1, weight: 400 },
    tabs: { dock: 'left', activeTab: 'general', order: [...TAB_IDS], pinned: [], groups: [], closed: [] },
    elementOverrides: Object.fromEntries(ELEMENT_TARGETS.map((target) => [target, { surface: null, onSurface: null, radius: null }]))
  };
}

function normalizeAppearanceNavigationSettings(value) {
  assertExactKeys(value, ['version', 'theme', 'density', 'seedColor', 'typography', 'tabs', 'elementOverrides'], 'Appearance and tab-navigation settings are invalid.');
  if (value.version !== 1 && value.version !== APPEARANCE_NAVIGATION_VERSION) {
    throw settingsError('APPEARANCE_NAVIGATION_UNSUPPORTED_VERSION', 'Appearance and tab-navigation settings use an unsupported version.');
  }
  if (!THEME_MODES.includes(value.theme)) throw settingsError('APPEARANCE_NAVIGATION_INVALID_VALUE', 'Theme must be system, light, or dark.');
  if (!DENSITY_MODES.includes(value.density)) throw settingsError('APPEARANCE_NAVIGATION_INVALID_VALUE', 'Density must be comfortable, compact, or spacious.');
  return {
    version: APPEARANCE_NAVIGATION_VERSION,
    theme: value.theme,
    density: value.density,
    seedColor: normalizeColor(value.seedColor, 'Seed color'),
    typography: normalizeTypography(value.typography),
    tabs: normalizeTabs(value.tabs, { legacy: value.version === 1 }),
    elementOverrides: normalizeElementOverrides(value.elementOverrides)
  };
}

function mergeNested(current, patch, key, allowed, message) {
  if (patch[key] === undefined) return current[key];
  assertPatchKeys(patch[key], allowed, message);
  return { ...current[key], ...patch[key] };
}

function mergeElementOverrides(current, patch) {
  if (patch.elementOverrides === undefined) return current.elementOverrides;
  assertPatchKeys(patch.elementOverrides, ELEMENT_TARGETS, 'Element appearance overrides contain an unsupported target.');
  const next = {};
  for (const target of ELEMENT_TARGETS) {
    const requested = patch.elementOverrides[target];
    if (requested === undefined) {
      next[target] = current.elementOverrides[target];
      continue;
    }
    assertPatchKeys(requested, ['surface', 'onSurface', 'radius'], `The ${target} appearance override contains an unsupported field.`);
    next[target] = { ...current.elementOverrides[target], ...requested };
  }
  return next;
}

class AppearanceNavigationSettings {
  constructor(options = {}) {
    if (!isPlainRecord(options) || Object.keys(options).some((key) => key !== 'dataDir')) {
      throw settingsError('APPEARANCE_NAVIGATION_INVALID_OPTIONS', 'Appearance and tab-navigation settings options are invalid.');
    }
    if (typeof options.dataDir !== 'string' || !path.isAbsolute(options.dataDir)) {
      throw settingsError('APPEARANCE_NAVIGATION_INVALID_OPTIONS', 'Appearance and tab-navigation settings need an absolute data directory.');
    }
    this.dataDir = path.normalize(options.dataDir);
    this.recordPath = path.join(this.dataDir, 'appearance-navigation-settings.json');
    this.settings = defaultAppearanceNavigationSettings();
    this.state = 'not-loaded';
    this.detail = 'Appearance and tab-navigation settings have not been loaded.';
  }

  initialize() {
    const result = this._read();
    if (result.state === 'ready') {
      this.settings = result.value;
      this.state = 'ready';
      this.detail = 'Appearance and tab-navigation settings are available.';
      return this.snapshot();
    }
    this.settings = defaultAppearanceNavigationSettings();
    this.state = result.state;
    this.detail = result.state === 'missing'
      ? 'Appearance and tab-navigation settings were not found and will be initialized with local defaults.'
      : result.state === 'invalid'
        ? 'Appearance and tab-navigation settings are invalid and were not applied.'
        : 'Appearance and tab-navigation settings cannot be read and were not applied.';
    if (result.state === 'missing') {
      try {
        this._write(this.settings);
        this.state = 'ready';
        this.detail = 'Appearance and tab-navigation settings are available.';
      } catch {
        this.state = 'unavailable';
        this.detail = 'Appearance and tab-navigation settings could not be initialized.';
      }
    }
    return this.snapshot();
  }

  snapshot() {
    return Object.freeze({
      state: this.state,
      detail: this.detail,
      settings: Object.freeze(copy(this.settings))
    });
  }

  update(patch) {
    if (this.state !== 'ready') {
      throw settingsError('APPEARANCE_NAVIGATION_UNAVAILABLE', 'Appearance and tab-navigation settings are unavailable. Repair or reset the local settings record before changing them.');
    }
    assertPatchKeys(patch, ['theme', 'density', 'seedColor', 'typography', 'tabs', 'elementOverrides'], 'Appearance and tab-navigation settings contain an unsupported field.');
    const next = normalizeAppearanceNavigationSettings({
      version: APPEARANCE_NAVIGATION_VERSION,
      theme: patch.theme === undefined ? this.settings.theme : patch.theme,
      density: patch.density === undefined ? this.settings.density : patch.density,
      seedColor: patch.seedColor === undefined ? this.settings.seedColor : patch.seedColor,
      typography: mergeNested(this.settings, patch, 'typography', ['family', 'scale', 'weight'], 'Typography settings contain an unsupported field.'),
      tabs: mergeNested(this.settings, patch, 'tabs', ['dock', 'activeTab', 'order', 'pinned', 'groups', 'closed'], 'Tab-navigation settings contain an unsupported field.'),
      elementOverrides: mergeElementOverrides(this.settings, patch)
    });
    this._write(next);
    this.settings = next;
    this.state = 'ready';
    this.detail = 'Appearance and tab-navigation settings are available.';
    return this.snapshot();
  }

  _read() {
    let contents;
    try {
      const stat = fs.statSync(this.recordPath);
      if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_RECORD_BYTES) return { state: 'invalid' };
      contents = fs.readFileSync(this.recordPath, 'utf8');
    } catch (error) {
      if (error?.code === 'ENOENT') return { state: 'missing' };
      return { state: 'unavailable' };
    }
    try {
      return { state: 'ready', value: normalizeAppearanceNavigationSettings(JSON.parse(contents)) };
    } catch {
      return { state: 'invalid' };
    }
  }

  _write(settings) {
    try {
      fs.mkdirSync(this.dataDir, { recursive: true, mode: 0o700 });
      const temporary = `${this.recordPath}.${process.pid}.${crypto.randomBytes(8).toString('hex')}.tmp`;
      const descriptor = fs.openSync(temporary, 'wx', 0o600);
      try {
        fs.writeFileSync(descriptor, JSON.stringify(settings, null, 2), 'utf8');
        fs.fsyncSync(descriptor);
      } finally {
        fs.closeSync(descriptor);
      }
      fs.renameSync(temporary, this.recordPath);
    } catch {
      throw settingsError('APPEARANCE_NAVIGATION_WRITE_FAILED', 'Appearance and tab-navigation settings could not be saved.');
    }
  }
}

module.exports = {
  APPEARANCE_NAVIGATION_VERSION,
  AppearanceNavigationSettings,
  DENSITY_MODES,
  ELEMENT_TARGETS,
  FONT_FAMILIES,
  FONT_WEIGHTS,
  TAB_DOCKS,
  TAB_IDS,
  THEME_MODES,
  defaultAppearanceNavigationSettings
};
