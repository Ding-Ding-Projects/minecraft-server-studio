'use strict';

// App-private notification metadata. Renderer-visible messages are deliberately
// reduced to fixed, non-secret summaries before this service receives them.
// This service never accepts server output, command text, credentials, paths,
// TOTP material, URLs, or a raw error payload for persistence.

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const NOTIFICATION_CENTER_SCHEMA_VERSION = 1;
const LIMITS = Object.freeze({
  dataDirectoryChars: 4096,
  metadataBytes: 1024 * 1024,
  records: 500,
  selection: 100,
  titleChars: 160,
  detailChars: 320
});

const SEVERITIES = new Set(['info', 'success', 'progress', 'warning', 'error']);
const IDENTIFIER_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAFE_SUMMARIES = Object.freeze({
  info: Object.freeze({ title: 'Information', detail: 'An app action reported an informational update.' }),
  success: Object.freeze({ title: 'Completed', detail: 'An app action completed.' }),
  progress: Object.freeze({ title: 'In progress', detail: 'An app action reported progress.' }),
  warning: Object.freeze({ title: 'Attention needed', detail: 'An app action needs attention.' }),
  error: Object.freeze({ title: 'Action failed', detail: 'An app action reported an error.' })
});

function notificationError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function isPlainRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertExactKeys(value, keys, message) {
  if (!isPlainRecord(value)) throw notificationError('NOTIFICATION_INVALID_INPUT', message);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw notificationError('NOTIFICATION_INVALID_INPUT', message);
  }
}

function normalizeDirectory(value) {
  if (typeof value !== 'string' || !value || value.length > LIMITS.dataDirectoryChars || /[\u0000-\u001f]/.test(value)) {
    throw notificationError('NOTIFICATION_INVALID_DIRECTORY', 'Notification storage requires an application-private data directory.');
  }
  const resolved = path.resolve(value);
  if (resolved === path.parse(resolved).root) {
    throw notificationError('NOTIFICATION_INVALID_DIRECTORY', 'Notification storage requires an application-private data directory.');
  }
  return resolved;
}

function normalizeText(value, maximum, label) {
  if (typeof value !== 'string') throw notificationError('NOTIFICATION_INVALID_INPUT', `${label} must be text.`);
  const normalized = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!normalized || normalized.length > maximum) throw notificationError('NOTIFICATION_INVALID_INPUT', `${label} is invalid.`);
  if (hasSensitiveText(normalized)) {
    throw notificationError('NOTIFICATION_SENSITIVE_TEXT', `${label} cannot include credentials, command output, paths, URLs, or secret-related text.`);
  }
  return normalized;
}

function hasSensitiveText(value) {
  return /\b(?:passwords?|passcodes?|pins?|secrets?|tokens?|bearer|authorization|private[ -]?keys?|credentials?|rcon|totp|otp|otpauth|one[- ]?time\s+codes?|server\.properties|server\.jar)\b/iu.test(value)
    || /(?:[a-z]:\\|\\\\|\/home\/|\/users\/|https?:\/\/|file:)/iu.test(value);
}

function normalizeSeverity(value) {
  if (typeof value !== 'string' || !SEVERITIES.has(value)) {
    throw notificationError('NOTIFICATION_INVALID_INPUT', 'Choose a supported notification severity.');
  }
  return value;
}

function normalizeSafeSummary(input) {
  const severity = normalizeSeverity(input.severity);
  const title = normalizeText(input.title, LIMITS.titleChars, 'Notification title');
  const detail = normalizeText(input.detail, LIMITS.detailChars, 'Notification detail');
  const expected = SAFE_SUMMARIES[severity];
  if (title !== expected.title || detail !== expected.detail) {
    throw notificationError('NOTIFICATION_UNSAFE_SUMMARY', 'Notification history accepts only fixed safe app-summary text.');
  }
  return Object.freeze({ severity, title, detail });
}

function normalizeIdentifier(value, message = 'Notification metadata is invalid.') {
  if (typeof value !== 'string' || !IDENTIFIER_PATTERN.test(value)) throw notificationError('NOTIFICATION_INVALID_RECORD', message);
  return value.toLowerCase();
}

function normalizeTimestamp(value, message = 'Notification metadata is invalid.') {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw notificationError('NOTIFICATION_INVALID_RECORD', message);
  return new Date(value).toISOString();
}

function normalizeOptionalTimestamp(value) {
  if (value === null) return null;
  return normalizeTimestamp(value);
}

function normalizePersistedRecord(value) {
  assertExactKeys(value, ['version', 'id', 'severity', 'title', 'detail', 'createdAt', 'dismissedAt'], 'Notification metadata is invalid.');
  if (value.version !== NOTIFICATION_CENTER_SCHEMA_VERSION) {
    throw notificationError('NOTIFICATION_UNSUPPORTED_VERSION', 'Notification metadata uses an unsupported schema version.');
  }
  return Object.freeze({
    version: NOTIFICATION_CENTER_SCHEMA_VERSION,
    id: normalizeIdentifier(value.id),
    severity: normalizeSeverity(value.severity),
    title: normalizeText(value.title, LIMITS.titleChars, 'Notification title'),
    detail: normalizeText(value.detail, LIMITS.detailChars, 'Notification detail'),
    createdAt: normalizeTimestamp(value.createdAt),
    dismissedAt: normalizeOptionalTimestamp(value.dismissedAt)
  });
}

function publicRecord(record) {
  return Object.freeze({
    id: record.id,
    severity: record.severity,
    title: record.title,
    detail: record.detail,
    createdAt: record.createdAt,
    dismissedAt: record.dismissedAt,
    state: record.dismissedAt ? 'dismissed' : 'active'
  });
}

function sortRecords(records) {
  return records.slice().sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id));
}

function normalizeIdentifiers(value, { allowEmpty = false } = {}) {
  if (!Array.isArray(value) || value.length > LIMITS.selection) {
    throw notificationError('NOTIFICATION_INVALID_SELECTION', `Choose between ${allowEmpty ? 'zero and ' : 'one and '}${LIMITS.selection} notification records.`);
  }
  const ids = value.map((id) => normalizeIdentifier(id, 'Notification selection is invalid.'));
  const unique = [...new Set(ids)];
  if ((!allowEmpty && !unique.length) || unique.length !== ids.length) {
    throw notificationError('NOTIFICATION_INVALID_SELECTION', 'Notification selection is invalid.');
  }
  return unique;
}

function authorityDigest(records) {
  const payload = records
    .slice()
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((record) => `${record.id}\u0000${record.createdAt}\u0000${record.dismissedAt || ''}`)
    .join('\n');
  return crypto.createHash('sha256').update(`minecraft-server-studio-notification-clear-v1\n${payload}`, 'utf8').digest('hex');
}

function confirmationMatches(value, digest) {
  assertExactKeys(value, ['confirmed', 'firstConfirmation', 'secondConfirmation', 'sliderValue', 'digest', 'confirmedAt'], 'Destructive confirmation is invalid.');
  if (value.confirmed !== true || value.firstConfirmation !== true || value.secondConfirmation !== true || Number(value.sliderValue) < 100) {
    throw notificationError('NOTIFICATION_CONFIRMATION_REQUIRED', 'Both confirmations and the full authorization slider are required before clearing notification history.');
  }
  if (typeof value.digest !== 'string' || !/^[a-f0-9]{64}$/i.test(value.digest) || typeof value.confirmedAt !== 'string' || !Number.isFinite(Date.parse(value.confirmedAt))) {
    throw notificationError('NOTIFICATION_CONFIRMATION_INVALID', 'The destructive confirmation does not match the current notification selection.');
  }
  const supplied = Buffer.from(value.digest.toLowerCase(), 'utf8');
  const expected = Buffer.from(digest, 'utf8');
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
    throw notificationError('NOTIFICATION_CONFIRMATION_STALE', 'The notification selection changed. Review the current records before clearing them.');
  }
}

class NotificationCenterService {
  constructor(options = {}) {
    if (!isPlainRecord(options)) throw notificationError('NOTIFICATION_INVALID_OPTIONS', 'Notification service options are invalid.');
    for (const key of Object.keys(options)) {
      if (!new Set(['dataDir', 'onChange']).has(key)) throw notificationError('NOTIFICATION_INVALID_OPTIONS', 'Notification service options are invalid.');
    }
    this.dataDir = normalizeDirectory(options.dataDir);
    this.metadataPath = path.join(this.dataDir, 'notifications.json');
    this.onChange = typeof options.onChange === 'function' ? options.onChange : null;
    this.records = [];
    this.initialized = false;
    this.metadataError = '';
  }

  initialize() {
    this.initialized = true;
    this.metadataError = '';
    this.records = [];
    try {
      this._ensureDirectory();
      if (!fs.existsSync(this.metadataPath)) return this.status();
      const stat = fs.statSync(this.metadataPath);
      if (!stat.isFile() || stat.size <= 0 || stat.size > LIMITS.metadataBytes) throw new Error('invalid');
      const parsed = JSON.parse(fs.readFileSync(this.metadataPath, 'utf8'));
      assertExactKeys(parsed, ['version', 'records'], 'Notification metadata is invalid.');
      if (parsed.version !== NOTIFICATION_CENTER_SCHEMA_VERSION || !Array.isArray(parsed.records) || parsed.records.length > LIMITS.records) throw new Error('invalid');
      const identifiers = new Set();
      this.records = sortRecords(parsed.records.map((record) => {
        const normalized = normalizePersistedRecord(record);
        if (identifiers.has(normalized.id)) throw new Error('duplicate');
        identifiers.add(normalized.id);
        return normalized;
      }));
    } catch {
      this.records = [];
      this.metadataError = 'Notification history metadata is unavailable. Existing data was preserved without automatic replacement.';
    }
    return this.status();
  }

  status() {
    const activeCount = this.records.filter((record) => !record.dismissedAt).length;
    return Object.freeze({
      version: NOTIFICATION_CENTER_SCHEMA_VERSION,
      state: this.metadataError ? 'metadata-unavailable' : (this.initialized ? 'ready' : 'starting'),
      detail: this.metadataError || 'Bounded app-private notification metadata is ready. Renderer-visible messages are stored only as fixed safe summaries.',
      maximumRecords: LIMITS.records,
      maximumSelection: LIMITS.selection,
      recordCount: this.records.length,
      activeCount,
      dismissedCount: this.records.length - activeCount
    });
  }

  list() {
    return Object.freeze({
      status: this.status(),
      records: Object.freeze(sortRecords(this.records).map(publicRecord))
    });
  }

  record(input) {
    this._assertReady();
    assertExactKeys(input, ['severity', 'title', 'detail'], 'Notification input is invalid.');
    if (this.records.length >= LIMITS.records) {
      throw notificationError('NOTIFICATION_LIMIT_REACHED', `Notification history has reached its ${LIMITS.records}-record limit. Clear reviewed records before recording more.`);
    }
    const summary = normalizeSafeSummary(input);
    const record = Object.freeze({
      version: NOTIFICATION_CENTER_SCHEMA_VERSION,
      id: crypto.randomUUID(),
      severity: summary.severity,
      title: summary.title,
      detail: summary.detail,
      createdAt: new Date().toISOString(),
      dismissedAt: null
    });
    this.records = sortRecords([record, ...this.records]);
    this._write();
    this._notify();
    return Object.freeze({ record: publicRecord(record), status: this.status() });
  }

  dismiss(ids) {
    return this._changeDismissed(ids, true);
  }

  restore(ids) {
    return this._changeDismissed(ids, false);
  }

  clearPreview(ids) {
    this._assertReady();
    const selected = this._selectedRecords(ids);
    const authority = Object.freeze({
      digest: authorityDigest(selected),
      recordCount: selected.length,
      purpose: 'clear-notification-history'
    });
    return Object.freeze({
      state: 'ready',
      count: selected.length,
      activeCount: selected.filter((record) => !record.dismissedAt).length,
      dismissedCount: selected.filter((record) => Boolean(record.dismissedAt)).length,
      authority
    });
  }

  clear(ids, confirmation) {
    const preview = this.clearPreview(ids);
    confirmationMatches(confirmation, preview.authority.digest);
    const selection = new Set(normalizeIdentifiers(ids));
    this.records = this.records.filter((record) => !selection.has(record.id));
    this._write();
    this._notify();
    return Object.freeze({
      removedCount: preview.count,
      status: this.status()
    });
  }

  _changeDismissed(ids, dismissed) {
    this._assertReady();
    const selected = this._selectedRecords(ids);
    const timestamp = dismissed ? new Date().toISOString() : null;
    const selection = new Set(selected.map((record) => record.id));
    this.records = sortRecords(this.records.map((record) => {
      if (!selection.has(record.id)) return record;
      return Object.freeze({ ...record, dismissedAt: timestamp });
    }));
    this._write();
    this._notify();
    return this.list();
  }

  _selectedRecords(ids) {
    const selection = new Set(normalizeIdentifiers(ids));
    const selected = this.records.filter((record) => selection.has(record.id));
    if (selected.length !== selection.size) {
      throw notificationError('NOTIFICATION_NOT_FOUND', 'One or more selected notification records no longer exist. Refresh the notification center and review the current selection.');
    }
    return selected;
  }

  _assertReady() {
    if (!this.initialized) throw notificationError('NOTIFICATION_STARTING', 'Notification history is still starting.');
    if (this.metadataError) throw notificationError('NOTIFICATION_METADATA_UNAVAILABLE', this.metadataError);
  }

  _ensureDirectory() {
    try {
      fs.mkdirSync(this.dataDir, { recursive: true, mode: 0o700 });
    } catch {
      throw notificationError('NOTIFICATION_DIRECTORY_UNAVAILABLE', 'App-private notification storage is unavailable.');
    }
  }

  _write() {
    this._ensureDirectory();
    const payload = JSON.stringify({ version: NOTIFICATION_CENTER_SCHEMA_VERSION, records: this.records });
    const temporary = `${this.metadataPath}.${process.pid}.${crypto.randomBytes(8).toString('hex')}.tmp`;
    try {
      const descriptor = fs.openSync(temporary, 'wx', 0o600);
      try {
        fs.writeFileSync(descriptor, payload, 'utf8');
        fs.fsyncSync(descriptor);
      } finally {
        fs.closeSync(descriptor);
      }
      fs.renameSync(temporary, this.metadataPath);
    } catch {
      try { if (fs.existsSync(temporary)) fs.rmSync(temporary, { force: true }); } catch { /* Best-effort temporary cleanup only. */ }
      throw notificationError('NOTIFICATION_WRITE_FAILED', 'App-private notification metadata could not be saved.');
    }
  }

  _notify() {
    try { this.onChange?.(this.list()); } catch { /* Renderer notification failures do not change local metadata. */ }
  }
}

module.exports = Object.freeze({
  LIMITS,
  NOTIFICATION_CENTER_SCHEMA_VERSION,
  NotificationCenterService,
  SAFE_SUMMARIES,
  SEVERITIES
});
