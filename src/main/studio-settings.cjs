'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { AppearanceNavigationSettings } = require('./appearance-navigation-settings.cjs');

const SETTINGS_VERSION = 1;
const LANGUAGE_MODES = Object.freeze(['english', 'cantonese', 'bilingual']);
const DEFAULT_DISPLAY_NAME = 'Minecraft Server Studio';
const DEFAULT_SCHOOL_MODE_LABEL = 'School mode';
const MAX_DISPLAY_NAME_LENGTH = 80;
const MAX_SCHOOL_MODE_LABEL_LENGTH = 80;

function settingsError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function isPlainRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function assertExactKeys(value, keys, message) {
  if (!isPlainRecord(value)) throw settingsError('SETTINGS_INVALID_RECORD', message);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw settingsError('SETTINGS_INVALID_RECORD', message);
  }
}

function normalizePath(value, label) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) throw settingsError('SETTINGS_INVALID_PATH', `${label} must be an absolute path.`);
  return path.normalize(value);
}

function normalizeName(value, fallback, maximum, label) {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'string') throw settingsError('SETTINGS_INVALID_VALUE', `${label} must be text.`);
  const normalized = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!normalized) throw settingsError('SETTINGS_INVALID_VALUE', `${label} cannot be empty.`);
  if (normalized.length > maximum) throw settingsError('SETTINGS_INVALID_VALUE', `${label} must be ${maximum} characters or fewer.`);
  return normalized;
}

function normalizeFunnyLevel(value, label) {
  if (!Number.isInteger(value) || value < 1 || value > 5) throw settingsError('SETTINGS_INVALID_VALUE', `${label} must be a whole number from 1 to 5.`);
  return value;
}

function normalizeTimestamp(value) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw settingsError('SETTINGS_INVALID_RECORD', 'The shared mode record has an invalid timestamp.');
  return new Date(value).toISOString();
}

function defaultLocalSettings() {
  return {
    version: SETTINGS_VERSION,
    language: 'english',
    funnyLevels: { english: 2, cantonese: 3 },
    dialogEmoji: true,
    displayName: DEFAULT_DISPLAY_NAME
  };
}

function defaultSharedSettings() {
  return {
    version: SETTINGS_VERSION,
    schoolMode: {
      enabled: false,
      label: DEFAULT_SCHOOL_MODE_LABEL,
      updatedAt: new Date().toISOString()
    }
  };
}

function normalizeLocalSettings(value) {
  assertExactKeys(value, ['version', 'language', 'funnyLevels', 'dialogEmoji', 'displayName'], 'App settings are invalid.');
  if (value.version !== SETTINGS_VERSION) throw settingsError('SETTINGS_UNSUPPORTED_VERSION', 'App settings use an unsupported version.');
  if (!LANGUAGE_MODES.includes(value.language)) throw settingsError('SETTINGS_INVALID_RECORD', 'App settings contain an unsupported language mode.');
  assertExactKeys(value.funnyLevels, ['english', 'cantonese'], 'App settings contain invalid message playfulness values.');
  if (typeof value.dialogEmoji !== 'boolean') throw settingsError('SETTINGS_INVALID_RECORD', 'App settings contain an invalid dialog emoji value.');
  return {
    version: SETTINGS_VERSION,
    language: value.language,
    funnyLevels: {
      english: normalizeFunnyLevel(value.funnyLevels.english, 'English message playfulness'),
      cantonese: normalizeFunnyLevel(value.funnyLevels.cantonese, 'Cantonese message playfulness')
    },
    dialogEmoji: value.dialogEmoji,
    displayName: normalizeName(value.displayName, DEFAULT_DISPLAY_NAME, MAX_DISPLAY_NAME_LENGTH, 'Display name')
  };
}

function normalizeSharedSettings(value) {
  assertExactKeys(value, ['version', 'schoolMode'], 'The shared mode record is invalid.');
  if (value.version !== SETTINGS_VERSION) throw settingsError('SETTINGS_UNSUPPORTED_VERSION', 'The shared mode record uses an unsupported version.');
  assertExactKeys(value.schoolMode, ['enabled', 'label', 'updatedAt'], 'The shared mode record is invalid.');
  if (typeof value.schoolMode.enabled !== 'boolean') throw settingsError('SETTINGS_INVALID_RECORD', 'The shared mode record is invalid.');
  return {
    version: SETTINGS_VERSION,
    schoolMode: {
      enabled: value.schoolMode.enabled,
      label: normalizeName(value.schoolMode.label, DEFAULT_SCHOOL_MODE_LABEL, MAX_SCHOOL_MODE_LABEL_LENGTH, 'Mode label'),
      updatedAt: normalizeTimestamp(value.schoolMode.updatedAt)
    }
  };
}

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * Persists app-specific presentation settings and observes a shared local
 * School-mode record. The shared record deliberately contains no credential;
 * callers keep unlock material in the credential vault.
 */
class StudioSettingsService {
  constructor(options = {}) {
    if (!isPlainRecord(options)) throw settingsError('SETTINGS_INVALID_OPTIONS', 'Settings service options are invalid.');
    const allowed = new Set(['dataDir', 'sharedDataDir', 'onChange']);
    for (const key of Object.keys(options)) {
      if (!allowed.has(key)) throw settingsError('SETTINGS_INVALID_OPTIONS', 'Settings service options are invalid.');
    }
    this.dataDir = normalizePath(options.dataDir, 'App settings directory');
    this.sharedDataDir = normalizePath(options.sharedDataDir, 'Shared settings directory');
    this.localPath = path.join(this.dataDir, 'presentation-settings.json');
    this.sharedPath = path.join(this.sharedDataDir, 'school-mode.json');
    this.appearanceNavigation = new AppearanceNavigationSettings({ dataDir: this.dataDir });
    this.onChange = typeof options.onChange === 'function' ? options.onChange : null;
    this.local = defaultLocalSettings();
    this.localState = 'not-loaded';
    this.shared = null;
    this.sharedState = 'not-loaded';
    this.sharedDetail = 'The shared mode record has not been loaded.';
    this.watching = false;
    this.watchTimer = null;
  }

  initialize() {
    this._loadLocal();
    this.appearanceNavigation.initialize();
    this._loadShared();
    this.startWatching();
    return this.snapshot();
  }

  snapshot() {
    const sharedReady = this.sharedState === 'ready' && this.shared;
    const schoolMode = sharedReady ? this.shared.schoolMode : defaultSharedSettings().schoolMode;
    return Object.freeze({
      schemaVersion: SETTINGS_VERSION,
      local: Object.freeze(copy(this.local)),
      localState: this.localState,
      appearanceNavigation: this.appearanceNavigation.snapshot(),
      shared: Object.freeze({
        state: this.sharedState,
        detail: this.sharedDetail,
        location: this.sharedDataDir,
        schoolMode: Object.freeze(copy(schoolMode)),
        effectiveSchoolMode: sharedReady ? schoolMode.enabled : true
      })
    });
  }

  updateLocal(patch) {
    if (!isPlainRecord(patch)) throw settingsError('SETTINGS_INVALID_PATCH', 'Presentation settings are invalid.');
    const allowed = new Set(['language', 'funnyLevels', 'dialogEmoji', 'displayName']);
    for (const key of Object.keys(patch)) {
      if (!allowed.has(key)) throw settingsError('SETTINGS_INVALID_PATCH', 'Presentation settings contain an unsupported field.');
    }
    const next = {
      ...this.local,
      ...patch,
      funnyLevels: patch.funnyLevels === undefined ? this.local.funnyLevels : patch.funnyLevels
    };
    this.local = normalizeLocalSettings({ ...next, version: SETTINGS_VERSION });
    this._writeJson(this.localPath, this.local, this.dataDir, 'App settings could not be saved.');
    this.localState = 'ready';
    this._emit();
    return this.snapshot();
  }

  updateAppearanceNavigation(patch) {
    this.appearanceNavigation.update(patch);
    this._emit();
    return this.snapshot();
  }

  ensureSharedRecord() {
    if (this.sharedState === 'ready' && this.shared) return this.snapshot();
    if (this.sharedState !== 'missing') {
      throw settingsError('SETTINGS_SHARED_UNAVAILABLE', 'The shared mode record is unavailable or invalid. Repair local application-data access before creating a new record.');
    }
    const record = defaultSharedSettings();
    this._writeJson(this.sharedPath, record, this.sharedDataDir, 'The shared mode record could not be created.');
    this.shared = record;
    this.sharedState = 'ready';
    this.sharedDetail = 'The shared mode record is available.';
    this._emit();
    return this.snapshot();
  }

  updateSchoolModeLabel(label) {
    this._assertSharedReady();
    const next = {
      version: SETTINGS_VERSION,
      schoolMode: {
        ...this.shared.schoolMode,
        label: normalizeName(label, DEFAULT_SCHOOL_MODE_LABEL, MAX_SCHOOL_MODE_LABEL_LENGTH, 'Mode label'),
        updatedAt: new Date().toISOString()
      }
    };
    this._writeShared(next);
    return this.snapshot();
  }

  setSchoolModeEnabled(enabled) {
    this._assertSharedReady();
    if (typeof enabled !== 'boolean') throw settingsError('SETTINGS_INVALID_VALUE', 'Shared mode state must be on or off.');
    const next = {
      version: SETTINGS_VERSION,
      schoolMode: {
        ...this.shared.schoolMode,
        enabled,
        updatedAt: new Date().toISOString()
      }
    };
    this._writeShared(next);
    return this.snapshot();
  }

  startWatching() {
    if (this.watching) return;
    try {
      fs.mkdirSync(this.sharedDataDir, { recursive: true, mode: 0o700 });
    } catch {
      this.shared = null;
      this.sharedState = 'unavailable';
      this.sharedDetail = 'The shared mode directory cannot be accessed. English safety presentation remains active until the record is available.';
      return;
    }
    this.watching = true;
    fs.watchFile(this.sharedPath, { interval: 700, persistent: false }, () => this._scheduleSharedReload());
  }

  stopWatching() {
    if (!this.watching) return;
    fs.unwatchFile(this.sharedPath);
    this.watching = false;
    if (this.watchTimer) clearTimeout(this.watchTimer);
    this.watchTimer = null;
  }

  _scheduleSharedReload() {
    if (this.watchTimer) clearTimeout(this.watchTimer);
    this.watchTimer = setTimeout(() => {
      this.watchTimer = null;
      const before = this.snapshot();
      this._loadShared();
      if (!same(before, this.snapshot())) this._emit();
    }, 120);
  }

  _loadLocal() {
    const result = this._readJson(this.localPath, normalizeLocalSettings);
    if (result.state === 'ready') {
      this.local = result.value;
      this.localState = 'ready';
      return;
    }
    this.local = defaultLocalSettings();
    this.localState = result.state;
    if (result.state === 'missing') {
      try {
        this._writeJson(this.localPath, this.local, this.dataDir, 'App settings could not be created.');
        this.localState = 'ready';
      } catch {
        this.localState = 'unavailable';
      }
    }
  }

  _loadShared() {
    const result = this._readJson(this.sharedPath, normalizeSharedSettings);
    if (result.state === 'ready') {
      this.shared = result.value;
      this.sharedState = 'ready';
      this.sharedDetail = 'The shared mode record is available.';
      return;
    }
    this.shared = null;
    this.sharedState = result.state;
    if (result.state === 'missing') {
      this.sharedDetail = 'The shared mode record is missing. English safety presentation remains active until you create the record.';
    } else if (result.state === 'invalid') {
      this.sharedDetail = 'The shared mode record is invalid. English safety presentation remains active until the record is repaired.';
    } else {
      this.sharedDetail = 'The shared mode record cannot be read. English safety presentation remains active until the record is available.';
    }
  }

  _readJson(filePath, normalize) {
    let contents;
    try {
      const stat = fs.statSync(filePath);
      if (!stat.isFile() || stat.size <= 0 || stat.size > 64 * 1024) return { state: 'invalid' };
      contents = fs.readFileSync(filePath, 'utf8');
    } catch (error) {
      if (error?.code === 'ENOENT') return { state: 'missing' };
      return { state: 'unavailable' };
    }
    try {
      return { state: 'ready', value: normalize(JSON.parse(contents)) };
    } catch {
      return { state: 'invalid' };
    }
  }

  _writeShared(record) {
    const normalized = normalizeSharedSettings(record);
    this._writeJson(this.sharedPath, normalized, this.sharedDataDir, 'The shared mode record could not be saved.');
    this.shared = normalized;
    this.sharedState = 'ready';
    this.sharedDetail = 'The shared mode record is available.';
    this._emit();
  }

  _writeJson(destination, value, directory, message) {
    try {
      fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
      const temporary = `${destination}.${process.pid}.${crypto.randomBytes(8).toString('hex')}.tmp`;
      const text = JSON.stringify(value, null, 2);
      const descriptor = fs.openSync(temporary, 'wx', 0o600);
      try {
        fs.writeFileSync(descriptor, text, 'utf8');
        fs.fsyncSync(descriptor);
      } finally {
        fs.closeSync(descriptor);
      }
      fs.renameSync(temporary, destination);
    } catch {
      throw settingsError('SETTINGS_WRITE_FAILED', message);
    }
  }

  _assertSharedReady() {
    if (this.sharedState !== 'ready' || !this.shared) {
      throw settingsError('SETTINGS_SHARED_UNAVAILABLE', 'The shared mode record is unavailable. Create or repair it before changing the mode.');
    }
  }

  _emit() {
    if (this.onChange) this.onChange(this.snapshot());
  }
}

module.exports = {
  DEFAULT_DISPLAY_NAME,
  DEFAULT_SCHOOL_MODE_LABEL,
  LANGUAGE_MODES,
  SETTINGS_VERSION,
  StudioSettingsService,
  defaultLocalSettings,
  defaultSharedSettings
};
