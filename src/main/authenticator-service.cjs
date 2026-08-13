'use strict';

// Main-process-only local authenticator state. TOTP secrets are deliberately
// never written to this metadata file: they stay in the supplied credential
// vault and this service returns only short-lived code snapshots to IPC.

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {
  DEFAULT_ALGORITHM,
  DEFAULT_DIGITS,
  DEFAULT_PERIOD_SECONDS,
  normalizeAlgorithm,
  normalizeBase32Secret,
  normalizeDigits,
  normalizePeriod,
  totpSnapshot
} = require('./totp-engine.cjs');

const AUTHENTICATOR_SCHEMA_VERSION = 1;
const LIMITS = Object.freeze({
  dataDirectoryChars: 4096,
  entries: 512,
  issuerChars: 96,
  accountChars: 160,
  labelChars: 160,
  groupChars: 80,
  uriChars: 8192,
  metadataBytes: 512 * 1024
});

const OTPAUTH_QUERY_KEYS = new Set(['secret', 'issuer', 'algorithm', 'digits', 'period']);
const IDENTIFIER_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function serviceError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function isPlainRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertKnownKeys(value, allowed, message) {
  if (!isPlainRecord(value)) throw serviceError('AUTHENTICATOR_INVALID_INPUT', message);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw serviceError('AUTHENTICATOR_INVALID_INPUT', message);
  }
}

function assertExactKeys(value, keys, message) {
  if (!isPlainRecord(value)) throw serviceError('AUTHENTICATOR_INVALID_RECORD', message);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw serviceError('AUTHENTICATOR_INVALID_RECORD', message);
  }
}

function normalizeDataDirectory(value) {
  if (typeof value !== 'string' || !value || value.length > LIMITS.dataDirectoryChars || /[\u0000-\u001f]/.test(value)) {
    throw serviceError('AUTHENTICATOR_INVALID_DIRECTORY', 'Authenticator storage requires an application-private data directory.');
  }
  const resolved = path.resolve(value);
  if (resolved === path.parse(resolved).root) {
    throw serviceError('AUTHENTICATOR_INVALID_DIRECTORY', 'Authenticator storage requires an application-private data directory.');
  }
  return resolved;
}

function normalizeText(value, fallback, maximum, label) {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'string') throw serviceError('AUTHENTICATOR_INVALID_INPUT', `${label} must be text.`);
  const normalized = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!normalized) {
    if (fallback !== undefined) return fallback;
    throw serviceError('AUTHENTICATOR_INVALID_INPUT', `${label} cannot be empty.`);
  }
  if (normalized.length > maximum) throw serviceError('AUTHENTICATOR_INVALID_INPUT', `${label} is too long.`);
  return normalized;
}

function normalizeId(value) {
  if (typeof value !== 'string' || !IDENTIFIER_PATTERN.test(value)) {
    throw serviceError('AUTHENTICATOR_INVALID_RECORD', 'Authenticator metadata is invalid.');
  }
  return value.toLowerCase();
}

function normalizeTimestamp(value) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw serviceError('AUTHENTICATOR_INVALID_RECORD', 'Authenticator metadata is invalid.');
  }
  return new Date(value).toISOString();
}

function normalizePositiveInteger(value, fallback, normalize) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'string' && /^\d+$/.test(value)) return normalize(Number(value));
  return normalize(value);
}

function parseOtpAuthUri(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > LIMITS.uriChars) {
    throw serviceError('AUTHENTICATOR_INVALID_URI', 'The authenticator URI is invalid.');
  }
  let parsed;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw serviceError('AUTHENTICATOR_INVALID_URI', 'The authenticator URI is invalid.');
  }
  if (parsed.protocol !== 'otpauth:' || parsed.hostname.toLowerCase() !== 'totp' || parsed.username || parsed.password || parsed.port || parsed.hash) {
    throw serviceError('AUTHENTICATOR_INVALID_URI', 'The authenticator URI is invalid.');
  }

  const queryEntries = [...parsed.searchParams.entries()];
  const seen = new Set();
  for (const [key] of queryEntries) {
    const normalized = key.toLowerCase();
    if (key !== normalized || !OTPAUTH_QUERY_KEYS.has(normalized) || seen.has(normalized)) {
      throw serviceError('AUTHENTICATOR_INVALID_URI', 'The authenticator URI is invalid.');
    }
    seen.add(normalized);
  }

  let decodedLabel;
  try {
    decodedLabel = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
  } catch {
    throw serviceError('AUTHENTICATOR_INVALID_URI', 'The authenticator URI is invalid.');
  }
  const separator = decodedLabel.indexOf(':');
  const labelIssuer = separator >= 0 ? decodedLabel.slice(0, separator) : '';
  const labelAccount = separator >= 0 ? decodedLabel.slice(separator + 1) : decodedLabel;
  const issuerFromUri = parsed.searchParams.get('issuer') || '';
  const issuer = normalizeText(issuerFromUri || labelIssuer, undefined, LIMITS.issuerChars, 'Issuer');
  const account = normalizeText(labelAccount, undefined, LIMITS.accountChars, 'Account');
  if (issuerFromUri && labelIssuer && normalizeText(issuerFromUri, undefined, LIMITS.issuerChars, 'Issuer') !== normalizeText(labelIssuer, undefined, LIMITS.issuerChars, 'Issuer')) {
    throw serviceError('AUTHENTICATOR_INVALID_URI', 'The authenticator URI issuer does not match its label.');
  }

  return Object.freeze({
    issuer,
    account,
    secret: normalizeBase32Secret(parsed.searchParams.get('secret') || ''),
    algorithm: normalizeAlgorithm(parsed.searchParams.get('algorithm') || DEFAULT_ALGORITHM),
    digits: normalizePositiveInteger(parsed.searchParams.get('digits'), DEFAULT_DIGITS, normalizeDigits),
    period: normalizePositiveInteger(parsed.searchParams.get('period'), DEFAULT_PERIOD_SECONDS, normalizePeriod)
  });
}

function normalizeManualEntry(input) {
  const issuer = normalizeText(input.issuer, undefined, LIMITS.issuerChars, 'Issuer');
  const account = normalizeText(input.account, undefined, LIMITS.accountChars, 'Account');
  return Object.freeze({
    issuer,
    account,
    secret: normalizeBase32Secret(input.manualSecret || ''),
    algorithm: normalizeAlgorithm(input.algorithm || DEFAULT_ALGORITHM),
    digits: normalizePositiveInteger(input.digits, DEFAULT_DIGITS, normalizeDigits),
    period: normalizePositiveInteger(input.period, DEFAULT_PERIOD_SECONDS, normalizePeriod)
  });
}

function normalizeAuthenticatorEntryInput(value) {
  const input = value || {};
  assertKnownKeys(input, new Set(['issuer', 'account', 'label', 'group', 'manualSecret', 'otpauthUri', 'algorithm', 'digits', 'period']), 'Authenticator entry input is invalid.');
  const uri = typeof input.otpauthUri === 'string' ? input.otpauthUri.trim() : '';
  const manualSecret = typeof input.manualSecret === 'string' ? input.manualSecret.trim() : '';
  if (uri && manualSecret) throw serviceError('AUTHENTICATOR_INVALID_INPUT', 'Use a manual secret or an authenticator URI, not both.');
  if (!uri && !manualSecret) throw serviceError('AUTHENTICATOR_INVALID_INPUT', 'Enter a manual secret or a standard authenticator URI.');
  const parsed = uri ? parseOtpAuthUri(uri) : normalizeManualEntry(input);
  const label = normalizeText(input.label, `${parsed.issuer} · ${parsed.account}`, LIMITS.labelChars, 'Display label');
  const group = normalizeText(input.group, 'Ungrouped', LIMITS.groupChars, 'Group');
  return Object.freeze({ ...parsed, label, group });
}

function buildOtpAuthUri(value) {
  if (!isPlainRecord(value)) throw serviceError('AUTHENTICATOR_INVALID_INPUT', 'Authenticator pairing input is invalid.');
  const issuer = normalizeText(value.issuer, undefined, LIMITS.issuerChars, 'Issuer');
  const account = normalizeText(value.account, undefined, LIMITS.accountChars, 'Account');
  const secret = normalizeBase32Secret(value.secret || '');
  const algorithm = normalizeAlgorithm(value.algorithm || DEFAULT_ALGORITHM);
  const digits = normalizePositiveInteger(value.digits, DEFAULT_DIGITS, normalizeDigits);
  const period = normalizePositiveInteger(value.period, DEFAULT_PERIOD_SECONDS, normalizePeriod);
  const params = new URLSearchParams();
  params.set('secret', secret);
  params.set('issuer', issuer);
  params.set('algorithm', algorithm.replace('SHA-', ''));
  params.set('digits', String(digits));
  params.set('period', String(period));
  const uri = `otpauth://totp/${encodeURIComponent(`${issuer}:${account}`)}?${params.toString()}`;
  if (uri.length > LIMITS.uriChars) throw serviceError('AUTHENTICATOR_INVALID_URI', 'The authenticator URI is too long.');
  return uri;
}

function normalizePersistedEntry(value) {
  assertExactKeys(value, ['id', 'issuer', 'account', 'label', 'group', 'algorithm', 'digits', 'period', 'createdAt', 'updatedAt'], 'Authenticator metadata is invalid.');
  return Object.freeze({
    id: normalizeId(value.id),
    issuer: normalizeText(value.issuer, undefined, LIMITS.issuerChars, 'Issuer'),
    account: normalizeText(value.account, undefined, LIMITS.accountChars, 'Account'),
    label: normalizeText(value.label, undefined, LIMITS.labelChars, 'Display label'),
    group: normalizeText(value.group, 'Ungrouped', LIMITS.groupChars, 'Group'),
    algorithm: normalizeAlgorithm(value.algorithm),
    digits: normalizeDigits(value.digits),
    period: normalizePeriod(value.period),
    createdAt: normalizeTimestamp(value.createdAt),
    updatedAt: normalizeTimestamp(value.updatedAt)
  });
}

function publicEntry(entry, status) {
  return Object.freeze({
    id: entry.id,
    issuer: entry.issuer,
    account: entry.account,
    label: entry.label,
    group: entry.group,
    algorithm: entry.algorithm,
    digits: entry.digits,
    period: entry.period,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    codeState: status.codeState,
    code: status.code || '',
    nextCode: status.nextCode || '',
    secondsRemaining: Number.isInteger(status.secondsRemaining) ? status.secondsRemaining : null,
    detail: status.detail || ''
  });
}

class AuthenticatorService {
  constructor(options = {}) {
    assertKnownKeys(options, new Set(['dataDir', 'credentialVault', 'onChange']), 'Authenticator service options are invalid.');
    this.dataDir = normalizeDataDirectory(options.dataDir);
    this.entriesPath = path.join(this.dataDir, 'authenticator-entries.json');
    this.credentialVault = options.credentialVault || null;
    this.onChange = typeof options.onChange === 'function' ? options.onChange : null;
    this.entries = [];
    this.initialized = false;
    this.metadataError = '';
  }

  initialize() {
    this.initialized = true;
    this.metadataError = '';
    this.entries = [];
    try {
      this._ensureDirectory();
      if (!fs.existsSync(this.entriesPath)) return this.getStatus();
      const stat = fs.statSync(this.entriesPath);
      if (!stat.isFile() || stat.size <= 0 || stat.size > LIMITS.metadataBytes) throw new Error('invalid');
      const parsed = JSON.parse(fs.readFileSync(this.entriesPath, 'utf8'));
      assertExactKeys(parsed, ['version', 'entries'], 'Authenticator metadata is invalid.');
      if (parsed.version !== AUTHENTICATOR_SCHEMA_VERSION || !Array.isArray(parsed.entries) || parsed.entries.length > LIMITS.entries) throw new Error('invalid');
      const identifiers = new Set();
      this.entries = parsed.entries.map((entry) => {
        const normalized = normalizePersistedEntry(entry);
        if (identifiers.has(normalized.id)) throw new Error('duplicate');
        identifiers.add(normalized.id);
        return normalized;
      }).sort((left, right) => left.label.localeCompare(right.label));
    } catch {
      this.entries = [];
      this.metadataError = 'Authenticator metadata is unavailable. Existing records were not overwritten.';
    }
    return this.getStatus();
  }

  getStatus() {
    const vault = this._vaultStatus();
    return Object.freeze({
      state: this.metadataError ? 'metadata-unavailable' : (vault.ready ? 'ready' : 'credential-unavailable'),
      entryCount: this.entries.length,
      detail: this.metadataError || (vault.ready ? 'Authenticator metadata stays local and codes are computed only in the main process.' : 'Protected credential storage is unavailable, so authenticator secrets cannot be created or read.'),
      clock: Object.freeze({ state: 'local-clock', detail: 'Codes use this computer\'s local clock. This foundation cannot independently measure clock skew.' }),
      registration: Object.freeze({
        manualBase32: true,
        otpauthUri: true,
        qrPairing: Object.freeze({ available: true, reason: 'An explicit 60-second local pairing reveal can draw a standard TOTP QR code before a new entry is stored.' }),
        qrImport: Object.freeze({ available: false, reason: 'QR image, clipboard, and camera import are unavailable because this build has no bundled decoder or capture route.' })
      })
    });
  }

  snapshot() {
    this._assertMetadataReady();
    const entries = this.entries.map((entry) => {
      try {
        const secret = this.credentialVault.read(this._credentialKey(entry.id));
        if (!secret) return publicEntry(entry, { codeState: 'credential-missing', detail: 'The protected secret is unavailable for this entry.' });
        const code = totpSnapshot(secret, { algorithm: entry.algorithm, digits: entry.digits, period: entry.period });
        return publicEntry(entry, { codeState: 'ready', ...code, detail: 'Code is computed locally in the main process.' });
      } catch {
        return publicEntry(entry, { codeState: 'credential-unavailable', detail: 'The protected secret could not be read for this entry.' });
      }
    });
    return Object.freeze({ status: this.getStatus(), entries });
  }

  createEntry(input) {
    this._assertReady();
    if (this.entries.length >= LIMITS.entries) throw serviceError('AUTHENTICATOR_LIMIT', 'The authenticator entry limit has been reached.');
    const created = normalizeAuthenticatorEntryInput(input);
    const now = new Date().toISOString();
    const entry = Object.freeze({
      id: crypto.randomUUID(),
      issuer: created.issuer,
      account: created.account,
      label: created.label,
      group: created.group,
      algorithm: created.algorithm,
      digits: created.digits,
      period: created.period,
      createdAt: now,
      updatedAt: now
    });
    const key = this._credentialKey(entry.id);
    this.credentialVault.save(key, created.secret);
    try {
      this.entries = [...this.entries, entry].sort((left, right) => left.label.localeCompare(right.label));
      this._writeEntries();
    } catch (error) {
      this.entries = this.entries.filter((candidate) => candidate.id !== entry.id);
      try { this.credentialVault.delete(key); } catch { /* The protected vault may retain an unreachable secret after a failed metadata write. */ }
      throw error;
    }
    this._notify();
    return Object.freeze({ id: entry.id, state: 'created', label: entry.label });
  }

  _assertReady() {
    this._assertMetadataReady();
    const vault = this._vaultStatus();
    if (!vault.ready) throw serviceError('AUTHENTICATOR_CREDENTIAL_UNAVAILABLE', 'Protected credential storage is unavailable.');
  }

  _assertMetadataReady() {
    if (!this.initialized) throw serviceError('AUTHENTICATOR_NOT_READY', 'Authenticator storage is still starting.');
    if (this.metadataError) throw serviceError('AUTHENTICATOR_METADATA_UNAVAILABLE', this.metadataError);
  }

  _vaultStatus() {
    try {
      const status = this.credentialVault?.getStatus?.();
      return { ready: status?.state === 'ready' && status.mode === 'protected' };
    } catch {
      return { ready: false };
    }
  }

  _credentialKey(id) {
    if (!this.credentialVault || typeof this.credentialVault.createKey !== 'function') {
      throw serviceError('AUTHENTICATOR_CREDENTIAL_UNAVAILABLE', 'Protected credential storage is unavailable.');
    }
    return this.credentialVault.createKey('minecraft-server-studio-authenticator', `entry:${id}`);
  }

  _ensureDirectory() {
    try {
      fs.mkdirSync(this.dataDir, { recursive: true, mode: 0o700 });
    } catch {
      throw serviceError('AUTHENTICATOR_DIRECTORY_UNAVAILABLE', 'Authenticator storage is unavailable.');
    }
  }

  _writeEntries() {
    this._ensureDirectory();
    const payload = JSON.stringify({ version: AUTHENTICATOR_SCHEMA_VERSION, entries: this.entries });
    const temporary = `${this.entriesPath}.${process.pid}.${crypto.randomBytes(8).toString('hex')}.tmp`;
    try {
      const descriptor = fs.openSync(temporary, 'wx', 0o600);
      try {
        fs.writeFileSync(descriptor, payload, 'utf8');
        fs.fsyncSync(descriptor);
      } finally {
        fs.closeSync(descriptor);
      }
      fs.renameSync(temporary, this.entriesPath);
    } catch {
      try { if (fs.existsSync(temporary)) fs.rmSync(temporary, { force: true }); } catch { /* Best-effort cleanup only. */ }
      throw serviceError('AUTHENTICATOR_WRITE_FAILED', 'Authenticator metadata could not be saved.');
    }
  }

  _notify() {
    try { this.onChange?.(); } catch { /* Renderer notification failures do not change local storage state. */ }
  }
}

module.exports = Object.freeze({
  AUTHENTICATOR_SCHEMA_VERSION,
  AuthenticatorService,
  LIMITS,
  buildOtpAuthUri,
  normalizeAuthenticatorEntryInput,
  parseOtpAuthUri
});
