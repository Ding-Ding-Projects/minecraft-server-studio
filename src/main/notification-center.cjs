'use strict';

/**
 * Bounded local notification history for the desktop process.
 *
 * The renderer receives only a scrubbed, structured record. The on-disk file
 * intentionally omits action callbacks, credentials, raw response bodies,
 * source paths, and URL query strings. This is a reviewable convenience
 * history, not an audit log or a secret store.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');

const SCHEMA_VERSION = 1;
const MAX_RECORDS = 400;
const MAX_TITLE_LENGTH = 120;
const MAX_DETAIL_LENGTH = 480;
const MAX_SOURCE_LENGTH = 64;
const MAX_FILE_BYTES = 512 * 1024;
const KINDS = new Set(['info', 'success', 'warning', 'error', 'progress']);
const ID_PATTERN = /^[0-9a-f-]{36}$/i;

function notificationError(message) {
  const error = new Error(message);
  error.code = 'NOTIFICATION_CENTER_INVALID';
  return error;
}

function boundedText(value, limit, fallback = '') {
  if (value === null || value === undefined) return fallback;
  return String(value)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit) || fallback;
}

function scrubSafeText(value, limit, fallback = '') {
  let text = boundedText(value, limit * 4, fallback);
  text = text
    // Do not retain credential-shaped fragments or token-bearing URLs.
    .replace(/\b(password|passphrase|token|secret|authorization|api[-_ ]?key)\b\s*(?::|=|\bis\b)\s*[^\s,;]+/gi, (_match, label) => `${label}: [redacted]`)
    .replace(/\b(?:bearer|basic)\s+[a-z0-9._~+\/=:-]+/gi, '[redacted credential]')
    .replace(/([?&](?:token|secret|password|key|authorization)=)[^&#\s]+/gi, '$1[redacted]')
    // Persist neither local paths nor query values. The running toast can
    // still name a useful outcome; the durable center does not need a path.
    .replace(/(?:[a-z]:\\|\\\\)[^\s"'<>]+/gi, '[local path]')
    .replace(/file:\/\/[^\s"'<>]+/gi, '[local path]')
    .replace(/https?:\/\/([^\s/?#]+)[^\s?#]*(?:\?[^\s#]*)?(?:#[^\s]*)?/gi, 'https://$1/[link omitted]');
  return boundedText(text, limit, fallback);
}

function normalizeKind(value) {
  return KINDS.has(value) ? value : 'info';
}

function normalizeId(value) {
  const id = String(value || '').trim();
  if (!ID_PATTERN.test(id)) throw notificationError('Notification identifiers are invalid.');
  return id;
}

function normalizeIds(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_RECORDS) {
    throw notificationError('Choose between one and 400 notification records.');
  }
  return [...new Set(value.map(normalizeId))];
}

function clone(record) {
  return {
    id: record.id,
    kind: record.kind,
    title: record.title,
    detail: record.detail,
    source: record.source,
    createdAt: record.createdAt,
    read: record.read === true,
    dismissed: record.dismissed === true
  };
}

function normalizeStoredRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const id = String(value.id || '');
  const createdAt = Date.parse(value.createdAt || '');
  if (!ID_PATTERN.test(id) || !Number.isFinite(createdAt)) return null;
  return {
    id,
    kind: normalizeKind(value.kind),
    title: scrubSafeText(value.title, MAX_TITLE_LENGTH, 'Notification'),
    detail: scrubSafeText(value.detail, MAX_DETAIL_LENGTH, 'No additional safe detail was retained.'),
    source: scrubSafeText(value.source, MAX_SOURCE_LENGTH, 'desktop'),
    createdAt: new Date(createdAt).toISOString(),
    read: value.read === true,
    dismissed: value.dismissed === true
  };
}

class NotificationCenter {
  constructor(options = {}) {
    const dataDir = boundedText(options.dataDir, 4_096);
    if (!dataDir) throw notificationError('Notification history needs an application-data directory.');
    this.dataDir = dataDir;
    this.filePath = path.join(dataDir, 'notification-history.json');
    this.maxRecords = Number.isInteger(options.maxRecords) && options.maxRecords >= 20 && options.maxRecords <= MAX_RECORDS
      ? options.maxRecords
      : MAX_RECORDS;
    this.now = typeof options.now === 'function' ? options.now : () => new Date().toISOString();
    this.records = [];
    this.initialized = false;
    this.writeChain = Promise.resolve();
  }

  async initialize() {
    if (this.initialized) return this.snapshot();
    await fsp.mkdir(this.dataDir, { recursive: true });
    this.records = await this._readStoredRecords();
    this.initialized = true;
    return this.snapshot();
  }

  snapshot(options = {}) {
    const includeDismissed = options?.includeDismissed === true;
    const records = this.records
      .filter((record) => includeDismissed || !record.dismissed)
      .slice()
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
      .map(clone);
    return {
      schemaVersion: SCHEMA_VERSION,
      records,
      unreadCount: records.filter((record) => !record.read).length,
      retentionLimit: this.maxRecords,
      localOnly: true
    };
  }

  async list(options = {}) {
    await this.initialize();
    return this.snapshot(options);
  }

  async publish(input = {}) {
    await this.initialize();
    const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
    const record = {
      id: crypto.randomUUID(),
      kind: normalizeKind(source.kind),
      title: scrubSafeText(source.title, MAX_TITLE_LENGTH, 'Notification'),
      detail: scrubSafeText(source.detail, MAX_DETAIL_LENGTH, 'No additional safe detail was retained.'),
      source: scrubSafeText(source.source, MAX_SOURCE_LENGTH, 'desktop'),
      createdAt: new Date(this.now()).toISOString(),
      read: false,
      dismissed: false
    };
    this.records.unshift(record);
    this.records = this.records.slice(0, this.maxRecords);
    await this._persist();
    return clone(record);
  }

  async markRead(ids) {
    await this.initialize();
    const selected = new Set(normalizeIds(ids));
    let changed = 0;
    for (const record of this.records) {
      if (selected.has(record.id) && !record.read) {
        record.read = true;
        changed += 1;
      }
    }
    if (changed) await this._persist();
    return { changed, snapshot: this.snapshot() };
  }

  async dismiss(ids) {
    await this.initialize();
    const selected = new Set(normalizeIds(ids));
    let changed = 0;
    for (const record of this.records) {
      if (selected.has(record.id) && !record.dismissed) {
        record.dismissed = true;
        record.read = true;
        changed += 1;
      }
    }
    if (changed) await this._persist();
    return { changed, snapshot: this.snapshot() };
  }

  async _readStoredRecords() {
    let payload;
    try {
      const metadata = await fsp.stat(this.filePath);
      if (!metadata.isFile() || metadata.size > MAX_FILE_BYTES) return [];
      payload = JSON.parse(await fsp.readFile(this.filePath, 'utf8'));
    } catch (error) {
      if (error?.code === 'ENOENT' || error instanceof SyntaxError) return [];
      throw error;
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload) || payload.version !== SCHEMA_VERSION || !Array.isArray(payload.records)) return [];
    return payload.records
      .map(normalizeStoredRecord)
      .filter(Boolean)
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
      .slice(0, this.maxRecords);
  }

  async _persist() {
    const payload = JSON.stringify({
      version: SCHEMA_VERSION,
      records: this.records.map(clone)
    }, null, 2) + '\n';
    this.writeChain = this.writeChain.then(async () => {
      const temporaryPath = `${this.filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
      await fsp.writeFile(temporaryPath, payload, { encoding: 'utf8', mode: 0o600 });
      await fsp.rename(temporaryPath, this.filePath);
    });
    return this.writeChain;
  }
}

module.exports = {
  NotificationCenter,
  scrubSafeText
};
