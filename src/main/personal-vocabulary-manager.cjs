'use strict';

// This module deliberately handles private user-supplied replacement data only
// inside application-private storage. It never remembers an import location,
// source name, or payload-derived metadata outside the validated local cache.

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { PERSONAL_VOCABULARY_COPY_CATALOG } = require('./personal-vocabulary-copy-catalog.cjs');

const PERSONAL_VOCABULARY_SCHEMA_VERSION = 1;
const LIMITS = Object.freeze({
  dataDirectoryChars: 4096,
  payloadBytes: 64 * 1024,
  entries: 128,
  nestingDepth: 2,
  keyChars: 96,
  valueChars: 512,
  projectionStringChars: 2048,
  projectionBytes: 64 * 1024
});
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const PROTECTED_COPY_SEGMENT = /(https?:\/\/[^\s]+|(?:[A-Za-z]:\\|\\\\|\/)[^\s]*|`[^`]*`|\b(?:Ctrl|Alt|Shift)(?:\+[A-Za-z0-9]+)+\b|\b(?:JSON|UTF-8|KiB|schemaVersion|entries)\b|\{[A-Za-z0-9_]+\})/;
const EMPTY_COPY_PROJECTION = Object.freeze({
  english: Object.freeze({}),
  cantonese: Object.freeze({})
});

function vocabularyError(code, message) {
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
  if (!isPlainRecord(value)) throw vocabularyError('VOCABULARY_INVALID_RECORD', message);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw vocabularyError('VOCABULARY_INVALID_RECORD', message);
  }
}

function normalizeDataDirectory(value) {
  if (typeof value !== 'string' || !value || value.length > LIMITS.dataDirectoryChars || /[\u0000-\u001f]/.test(value)) {
    throw vocabularyError('VOCABULARY_INVALID_DIRECTORY', 'Private vocabulary storage requires an application-private data directory.');
  }
  const resolved = path.resolve(value);
  if (resolved === path.parse(resolved).root) {
    throw vocabularyError('VOCABULARY_INVALID_DIRECTORY', 'Private vocabulary storage requires an application-private data directory.');
  }
  return resolved;
}

function assertSafeKey(value) {
  if (typeof value !== 'string' || !value || value.length > LIMITS.keyChars || value !== value.trim() || /[\u0000-\u001f\u007f]/.test(value) || hasUnpairedSurrogate(value) || UNSAFE_KEYS.has(value)) {
    throw vocabularyError('VOCABULARY_INVALID_ENTRY', 'Private vocabulary entry keys must be bounded, non-empty text.');
  }
  return value;
}

function assertSafeValue(value) {
  if (typeof value !== 'string' || value.length > LIMITS.valueChars || /[\u0000-\u001f\u007f]/.test(value) || hasUnpairedSurrogate(value)) {
    throw vocabularyError('VOCABULARY_INVALID_ENTRY', 'Private vocabulary replacement text is invalid.');
  }
  return value;
}

function hasUnpairedSurrogate(value) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return true;
      index += 1;
      continue;
    }
    if (code >= 0xdc00 && code <= 0xdfff) return true;
  }
  return false;
}

function skipWhitespace(source, state) {
  while (state.index < source.length && /[\t\n\r ]/.test(source[state.index])) state.index += 1;
}

function parseJsonString(source, state) {
  if (source[state.index] !== '"') throw vocabularyError('VOCABULARY_INVALID_JSON', 'The private vocabulary file is not valid JSON.');
  const start = state.index;
  state.index += 1;
  while (state.index < source.length) {
    const character = source[state.index];
    if (character === '"') {
      state.index += 1;
      try {
        return JSON.parse(source.slice(start, state.index));
      } catch {
        throw vocabularyError('VOCABULARY_INVALID_JSON', 'The private vocabulary file is not valid JSON.');
      }
    }
    if (character === '\\') {
      const escape = source[state.index + 1];
      if (!'"\\/bfnrtu'.includes(escape || '')) {
        throw vocabularyError('VOCABULARY_INVALID_JSON', 'The private vocabulary file is not valid JSON.');
      }
      if (escape === 'u') {
        if (!/^[0-9a-fA-F]{4}$/.test(source.slice(state.index + 2, state.index + 6))) {
          throw vocabularyError('VOCABULARY_INVALID_JSON', 'The private vocabulary file is not valid JSON.');
        }
        state.index += 6;
      } else {
        state.index += 2;
      }
      continue;
    }
    if (character.charCodeAt(0) < 0x20) {
      throw vocabularyError('VOCABULARY_INVALID_JSON', 'The private vocabulary file is not valid JSON.');
    }
    state.index += 1;
  }
  throw vocabularyError('VOCABULARY_INVALID_JSON', 'The private vocabulary file is not valid JSON.');
}

function scanStrictJson(source) {
  const state = { index: 0 };
  const parseValue = (depth) => {
    skipWhitespace(source, state);
    if (depth > LIMITS.nestingDepth) {
      throw vocabularyError('VOCABULARY_NESTING_LIMIT', 'Private vocabulary data exceeds the supported nesting limit.');
    }
    const character = source[state.index];
    if (character === '{') return parseObject(depth + 1);
    if (character === '[') return parseArray(depth + 1);
    if (character === '"') return parseJsonString(source, state);
    if (source.startsWith('true', state.index)) {
      state.index += 4;
      return true;
    }
    if (source.startsWith('false', state.index)) {
      state.index += 5;
      return false;
    }
    if (source.startsWith('null', state.index)) {
      state.index += 4;
      return null;
    }
    const number = source.slice(state.index).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    if (number) {
      state.index += number[0].length;
      return Number(number[0]);
    }
    throw vocabularyError('VOCABULARY_INVALID_JSON', 'The private vocabulary file is not valid JSON.');
  };
  const parseObject = (depth) => {
    if (depth > LIMITS.nestingDepth) {
      throw vocabularyError('VOCABULARY_NESTING_LIMIT', 'Private vocabulary data exceeds the supported nesting limit.');
    }
    state.index += 1;
    skipWhitespace(source, state);
    const keys = new Set();
    if (source[state.index] === '}') {
      state.index += 1;
      return;
    }
    while (state.index < source.length) {
      skipWhitespace(source, state);
      const key = parseJsonString(source, state);
      if (keys.has(key)) throw vocabularyError('VOCABULARY_DUPLICATE_KEY', 'Private vocabulary data contains a duplicate object key.');
      keys.add(key);
      skipWhitespace(source, state);
      if (source[state.index] !== ':') throw vocabularyError('VOCABULARY_INVALID_JSON', 'The private vocabulary file is not valid JSON.');
      state.index += 1;
      parseValue(depth);
      skipWhitespace(source, state);
      if (source[state.index] === '}') {
        state.index += 1;
        return;
      }
      if (source[state.index] !== ',') throw vocabularyError('VOCABULARY_INVALID_JSON', 'The private vocabulary file is not valid JSON.');
      state.index += 1;
    }
    throw vocabularyError('VOCABULARY_INVALID_JSON', 'The private vocabulary file is not valid JSON.');
  };
  const parseArray = (depth) => {
    if (depth > LIMITS.nestingDepth) {
      throw vocabularyError('VOCABULARY_NESTING_LIMIT', 'Private vocabulary data exceeds the supported nesting limit.');
    }
    state.index += 1;
    skipWhitespace(source, state);
    if (source[state.index] === ']') {
      state.index += 1;
      return;
    }
    while (state.index < source.length) {
      parseValue(depth);
      skipWhitespace(source, state);
      if (source[state.index] === ']') {
        state.index += 1;
        return;
      }
      if (source[state.index] !== ',') throw vocabularyError('VOCABULARY_INVALID_JSON', 'The private vocabulary file is not valid JSON.');
      state.index += 1;
    }
    throw vocabularyError('VOCABULARY_INVALID_JSON', 'The private vocabulary file is not valid JSON.');
  };
  parseValue(0);
  skipWhitespace(source, state);
  if (state.index !== source.length) throw vocabularyError('VOCABULARY_INVALID_JSON', 'The private vocabulary file is not valid JSON.');
}

function parseVocabularyBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 1 || buffer.length > LIMITS.payloadBytes) {
    throw vocabularyError('VOCABULARY_SIZE_LIMIT', `Choose a private vocabulary JSON file no larger than ${Math.round(LIMITS.payloadBytes / 1024)} KiB.`);
  }
  const source = buffer.toString('utf8');
  if (!Buffer.from(source, 'utf8').equals(buffer)) {
    throw vocabularyError('VOCABULARY_ENCODING', 'Private vocabulary data must be valid UTF-8 JSON.');
  }
  scanStrictJson(source);
  let parsed;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw vocabularyError('VOCABULARY_INVALID_JSON', 'The private vocabulary file is not valid JSON.');
  }
  assertExactKeys(parsed, ['schemaVersion', 'entries'], 'Private vocabulary data must use the supported version-1 record.');
  if (parsed.schemaVersion !== PERSONAL_VOCABULARY_SCHEMA_VERSION) {
    throw vocabularyError('VOCABULARY_UNSUPPORTED_VERSION', 'Private vocabulary data uses an unsupported schema version.');
  }
  if (!isPlainRecord(parsed.entries)) {
    throw vocabularyError('VOCABULARY_INVALID_RECORD', 'Private vocabulary entries must be a plain object of text replacements.');
  }
  const rawEntries = Object.entries(parsed.entries);
  if (rawEntries.length > LIMITS.entries) {
    throw vocabularyError('VOCABULARY_ENTRY_LIMIT', `Private vocabulary data supports at most ${LIMITS.entries} replacement entries.`);
  }
  const entries = Object.create(null);
  for (const [key, value] of rawEntries) {
    entries[assertSafeKey(key)] = assertSafeValue(value);
  }
  return Object.freeze(entries);
}

function projectTemplate(template, entries) {
  const replacements = Object.entries(entries).sort((left, right) => right[0].length - left[0].length);
  const projected = String(template).split(PROTECTED_COPY_SEGMENT).map((segment, index) => {
    if (index % 2 === 1) return segment;
    return replacements.reduce((current, [source, replacement]) => current.split(source).join(replacement), segment);
  }).join('');
  if (projected.length > LIMITS.projectionStringChars || /\u0000/.test(projected)) {
    throw vocabularyError('VOCABULARY_PROJECTION_LIMIT', 'Private vocabulary replacements cannot safely be applied to this app copy.');
  }
  return projected;
}

function createCopyProjection(entries) {
  const english = {};
  const cantonese = {};
  let bytes = 0;
  for (const [key, copy] of Object.entries(PERSONAL_VOCABULARY_COPY_CATALOG)) {
    const projectedEnglish = projectTemplate(copy.english, entries);
    const projectedCantonese = projectTemplate(copy.cantonese, entries);
    bytes += Buffer.byteLength(key, 'utf8') + Buffer.byteLength(projectedEnglish, 'utf8') + Buffer.byteLength(projectedCantonese, 'utf8');
    if (bytes > LIMITS.projectionBytes) {
      throw vocabularyError('VOCABULARY_PROJECTION_LIMIT', 'Private vocabulary replacements cannot safely be applied to this app copy.');
    }
    english[key] = projectedEnglish;
    cantonese[key] = projectedCantonese;
  }
  return Object.freeze({
    english: Object.freeze(english),
    cantonese: Object.freeze(cantonese)
  });
}

function confirmationMatches(value, digest) {
  assertExactKeys(value, ['confirmed', 'firstConfirmation', 'secondConfirmation', 'sliderValue', 'digest', 'confirmedAt'], 'The private-vocabulary clear confirmation is invalid.');
  if (value.confirmed !== true || value.firstConfirmation !== true || value.secondConfirmation !== true || Number(value.sliderValue) < 100) {
    throw vocabularyError('VOCABULARY_CONFIRMATION_REQUIRED', 'Both confirmations and the full authorization slider are required before clearing private vocabulary data.');
  }
  if (typeof value.digest !== 'string' || !/^[a-f0-9]{64}$/i.test(value.digest) || typeof value.confirmedAt !== 'string' || !Number.isFinite(Date.parse(value.confirmedAt))) {
    throw vocabularyError('VOCABULARY_CONFIRMATION_INVALID', 'The private-vocabulary clear confirmation is invalid.');
  }
  const supplied = Buffer.from(value.digest.toLowerCase(), 'utf8');
  const expected = Buffer.from(digest, 'utf8');
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
    throw vocabularyError('VOCABULARY_CONFIRMATION_STALE', 'The private vocabulary state changed. Review it again before clearing it.');
  }
}

class PersonalVocabularyManager {
  constructor(options = {}) {
    if (!isPlainRecord(options) || Object.keys(options).some((key) => key !== 'dataDir')) {
      throw vocabularyError('VOCABULARY_INVALID_OPTIONS', 'Private vocabulary options are invalid.');
    }
    this.dataDir = normalizeDataDirectory(options.dataDir);
    this.cachePath = path.join(this.dataDir, 'validated-cache.json');
    this.entries = Object.freeze(Object.create(null));
    this.state = 'not-loaded';
    this.detail = 'Private vocabulary settings have not loaded.';
    this.cacheDigest = '';
    this.clearAuthority = null;
  }

  initialize() {
    return this.snapshot();
  }

  snapshot() {
    this._loadCache();
    return this._snapshotFromLoaded();
  }

  presentation(options = {}) {
    if (!isPlainRecord(options) || Object.keys(options).some((key) => key !== 'suppressCopy')) {
      throw vocabularyError('VOCABULARY_INVALID_OPTIONS', 'Private vocabulary presentation options are invalid.');
    }
    this._loadCache();
    return Object.freeze({
      status: this._snapshotFromLoaded(),
      copy: options.suppressCopy === true || this.state !== 'ready' ? EMPTY_COPY_PROJECTION : createCopyProjection(this.entries)
    });
  }

  _snapshotFromLoaded() {
    const ready = this.state === 'ready';
    return Object.freeze({
      schemaVersion: PERSONAL_VOCABULARY_SCHEMA_VERSION,
      state: this.state,
      detail: this.detail,
      active: ready
    });
  }

  importFile(filePath) {
    const candidate = this._normalizeSelectedPath(filePath);
    let stat;
    try {
      stat = fs.lstatSync(candidate);
    } catch {
      throw vocabularyError('VOCABULARY_READ_FAILED', 'The selected private vocabulary file could not be read. Choose it again.');
    }
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1 || stat.size > LIMITS.payloadBytes) {
      throw vocabularyError('VOCABULARY_SIZE_LIMIT', `Choose a regular private vocabulary JSON file no larger than ${Math.round(LIMITS.payloadBytes / 1024)} KiB.`);
    }
    let bytes;
    try {
      bytes = fs.readFileSync(candidate);
    } catch {
      throw vocabularyError('VOCABULARY_READ_FAILED', 'The selected private vocabulary file could not be read. Choose it again.');
    }
    const entries = parseVocabularyBuffer(bytes);
    createCopyProjection(entries);
    this._writeCache(entries);
    this.entries = entries;
    this.state = 'ready';
    this.detail = 'Validated private vocabulary is active locally.';
    this.clearAuthority = null;
    return this.snapshot();
  }

  clearPreview() {
    this._loadCache();
    if (this.state !== 'ready') {
      throw vocabularyError('VOCABULARY_NOT_ACTIVE', 'No validated private vocabulary data is active to clear.');
    }
    this.clearAuthority = Object.freeze({
      token: crypto.randomBytes(32).toString('hex'),
      cacheDigest: this.cacheDigest
    });
    return Object.freeze({
      state: 'ready',
      authority: Object.freeze({
        digest: this.clearAuthority.token,
        purpose: 'clear-private-vocabulary'
      })
    });
  }

  clear(confirmation) {
    this._loadCache();
    if (this.state !== 'ready' || !this.clearAuthority || this.clearAuthority.cacheDigest !== this.cacheDigest) {
      throw vocabularyError('VOCABULARY_CONFIRMATION_STALE', 'Review the active private vocabulary state before clearing it.');
    }
    confirmationMatches(confirmation, this.clearAuthority.token);
    try {
      const stat = fs.lstatSync(this.cachePath);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('invalid-cache');
      fs.unlinkSync(this.cachePath);
    } catch {
      this.clearAuthority = null;
      throw vocabularyError('VOCABULARY_CLEAR_FAILED', 'Private vocabulary data could not be cleared. It remains unavailable until local storage is repaired.');
    }
    this.entries = Object.freeze(Object.create(null));
    this.state = 'missing';
    this.detail = 'No private vocabulary data is active; shipped wording is shown.';
    this.clearAuthority = null;
    return this.snapshot();
  }

  _normalizeSelectedPath(value) {
    if (typeof value !== 'string' || !value || !path.isAbsolute(value)) {
      throw vocabularyError('VOCABULARY_INVALID_PATH', 'Choose a local private vocabulary JSON file.');
    }
    return path.normalize(value);
  }

  _ensureDirectory() {
    try {
      fs.mkdirSync(this.dataDir, { recursive: true, mode: 0o700 });
      const stat = fs.lstatSync(this.dataDir);
      if (!stat.isDirectory() || stat.isSymbolicLink()) {
        throw vocabularyError('VOCABULARY_DIRECTORY_UNAVAILABLE', 'App-private vocabulary storage is unavailable.');
      }
    } catch {
      throw vocabularyError('VOCABULARY_DIRECTORY_UNAVAILABLE', 'App-private vocabulary storage is unavailable.');
    }
  }

  _loadCache() {
    this.entries = Object.freeze(Object.create(null));
    this.cacheDigest = '';
    try {
      this._ensureDirectory();
      let stat;
      try {
        stat = fs.lstatSync(this.cachePath);
      } catch (error) {
        if (error?.code === 'ENOENT') {
          this.state = 'missing';
          this.detail = 'No private vocabulary data is active; shipped wording is shown.';
          return;
        }
        throw error;
      }
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1 || stat.size > LIMITS.payloadBytes) {
        throw vocabularyError('VOCABULARY_CACHE_INVALID', 'The validated private vocabulary cache is invalid.');
      }
      const cacheBytes = fs.readFileSync(this.cachePath);
      const entries = parseVocabularyBuffer(cacheBytes);
      createCopyProjection(entries);
      this.entries = entries;
      this.cacheDigest = crypto.createHash('sha256').update(cacheBytes).digest('hex');
      this.state = 'ready';
      this.detail = 'Validated private vocabulary is active locally.';
    } catch (error) {
      this.entries = Object.freeze(Object.create(null));
      this.state = error?.code === 'VOCABULARY_DIRECTORY_UNAVAILABLE' ? 'unavailable' : 'invalid';
      this.detail = this.state === 'unavailable'
        ? 'App-private vocabulary storage is unavailable; shipped wording is shown.'
        : 'Saved private vocabulary data is invalid or unsupported; shipped wording is shown until a new valid file is selected.';
    }
  }

  _writeCache(entries) {
    this._ensureDirectory();
    const payload = Buffer.from(JSON.stringify({ schemaVersion: PERSONAL_VOCABULARY_SCHEMA_VERSION, entries }), 'utf8');
    if (payload.length < 1 || payload.length > LIMITS.payloadBytes) {
      throw vocabularyError('VOCABULARY_SIZE_LIMIT', `Private vocabulary data must remain within ${Math.round(LIMITS.payloadBytes / 1024)} KiB after validation.`);
    }
    const temporary = path.join(this.dataDir, `.validated-cache.${process.pid}.${crypto.randomBytes(8).toString('hex')}.tmp`);
    try {
      const descriptor = fs.openSync(temporary, 'wx', 0o600);
      try {
        fs.writeFileSync(descriptor, payload);
        fs.fsyncSync(descriptor);
      } finally {
        fs.closeSync(descriptor);
      }
      fs.renameSync(temporary, this.cachePath);
    } catch {
      try { if (fs.existsSync(temporary)) fs.rmSync(temporary, { force: true }); } catch { /* Best-effort private temporary cleanup only. */ }
      throw vocabularyError('VOCABULARY_WRITE_FAILED', 'Validated private vocabulary data could not be saved locally.');
    }
  }
}

module.exports = Object.freeze({
  LIMITS,
  PERSONAL_VOCABULARY_SCHEMA_VERSION,
  PersonalVocabularyManager
});
