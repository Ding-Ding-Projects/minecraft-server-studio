'use strict';

// Main-process-only storage for opaque credentials such as RCON passwords and
// management bearer tokens. Callers must pass Electron's `safeStorage` after
// app.whenReady(), plus an application-private data directory.

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const VAULT_VERSION = 1;
const LIMITS = Object.freeze({
  dataDirectoryChars: 4096,
  serviceChars: 96,
  accountChars: 160,
  secretChars: 16 * 1024,
  protectedBlobBytes: 64 * 1024,
  metadataBytes: 512 * 1024,
  entries: 2048
});

const KEY_PART_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

function vaultError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function isPlainRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function own(record, key) {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function validateExactKeys(record, keys, message) {
  if (!isPlainRecord(record)) throw vaultError('VAULT_INVALID_INPUT', message);
  const received = Object.keys(record).sort();
  const expected = [...keys].sort();
  if (received.length !== expected.length || received.some((key, index) => key !== expected[index])) {
    throw vaultError('VAULT_INVALID_INPUT', message);
  }
}

function normalizeKeyPart(value, label, maximum) {
  if (typeof value !== 'string') throw vaultError('VAULT_INVALID_KEY', 'Credential ' + label + ' is invalid.');
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum || !KEY_PART_PATTERN.test(normalized)) {
    throw vaultError('VAULT_INVALID_KEY', 'Credential ' + label + ' is invalid.');
  }
  return normalized;
}

function createCredentialKey(service, account) {
  const safeService = normalizeKeyPart(service, 'service key', LIMITS.serviceChars);
  const safeAccount = normalizeKeyPart(account, 'account key', LIMITS.accountChars);
  const id = crypto.createHash('sha256').update(safeService + '\n' + safeAccount, 'utf8').digest('hex');
  return Object.freeze({ service: safeService, account: safeAccount, id });
}

function normalizeCredentialKey(value) {
  if (!isPlainRecord(value)) {
    throw vaultError('VAULT_INVALID_KEY', 'Credential key is invalid.');
  }
  const received = Object.keys(value).sort();
  const supported = received.length === 2
    ? received[0] === 'account' && received[1] === 'service'
    : received.length === 3 && received[0] === 'account' && received[1] === 'id' && received[2] === 'service';
  if (!supported) throw vaultError('VAULT_INVALID_KEY', 'Credential key is invalid.');
  const key = createCredentialKey(value.service, value.account);
  if (own(value, 'id') && value.id !== key.id) {
    throw vaultError('VAULT_INVALID_KEY', 'Credential key is invalid.');
  }
  return key;
}

function normalizeDataDirectory(value) {
  if (typeof value !== 'string' || !value || value.length > LIMITS.dataDirectoryChars || /[\u0000-\u001f]/.test(value)) {
    throw vaultError('VAULT_INVALID_DIRECTORY', 'Credential vault requires an application-private data directory.');
  }
  const resolved = path.resolve(value);
  if (resolved === path.parse(resolved).root) {
    throw vaultError('VAULT_INVALID_DIRECTORY', 'Credential vault requires an application-private data directory.');
  }
  return resolved;
}

function normalizeSecret(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > LIMITS.secretChars) {
    throw vaultError('VAULT_INVALID_SECRET', 'Credential value is invalid.');
  }
  return value;
}

function safeStorageAvailable(adapter) {
  if (!adapter || typeof adapter.encryptString !== 'function' || typeof adapter.decryptString !== 'function' || typeof adapter.isEncryptionAvailable !== 'function') {
    return false;
  }
  try {
    return adapter.isEncryptionAvailable() === true;
  } catch {
    return false;
  }
}

function decodeProtectedBlob(value) {
  if (typeof value !== 'string' || !value || value.length > LIMITS.protectedBlobBytes * 2 || !BASE64_PATTERN.test(value)) {
    throw vaultError('VAULT_CORRUPT', 'Protected credential data is unavailable.');
  }
  const bytes = Buffer.from(value, 'base64');
  if (bytes.length === 0 || bytes.length > LIMITS.protectedBlobBytes || bytes.toString('base64') !== value) {
    throw vaultError('VAULT_CORRUPT', 'Protected credential data is unavailable.');
  }
  return bytes;
}

function makeReceipt(key, state, mode) {
  return Object.freeze({
    service: key.service,
    account: key.account,
    state,
    mode
  });
}

/**
 * Stores only Electron safeStorage ciphertext on disk. This module does not
 * import Electron itself so that the caller explicitly provides safeStorage.
 */
class CredentialVault {
  constructor(options = {}) {
    if (!isPlainRecord(options)) throw vaultError('VAULT_INVALID_OPTIONS', 'Credential vault options are invalid.');
    const allowed = new Set(['safeStorage', 'dataDir', 'allowInMemoryFallback']);
    for (const key of Object.keys(options)) {
      if (!allowed.has(key)) throw vaultError('VAULT_INVALID_OPTIONS', 'Credential vault options are invalid.');
    }

    this.safeStorage = options.safeStorage || null;
    this.allowInMemoryFallback = options.allowInMemoryFallback === true;
    this.dataDir = options.dataDir === undefined || options.dataDir === null ? null : normalizeDataDirectory(options.dataDir);
    this.mode = safeStorageAvailable(this.safeStorage) && this.dataDir ? 'protected' : (this.allowInMemoryFallback ? 'memory' : 'unavailable');
    this.secretDirectory = this.dataDir ? path.join(this.dataDir, 'secrets') : null;
    this.indexPath = this.secretDirectory ? path.join(this.secretDirectory, 'index.json') : null;
    this.memory = new Map();
  }

  createKey(service, account) {
    return createCredentialKey(service, account);
  }

  getStatus() {
    if (this.mode === 'protected') {
      return Object.freeze({ state: 'ready', mode: 'protected', persistent: true, encryption: 'electron-safe-storage' });
    }
    if (this.mode === 'memory') {
      return Object.freeze({ state: 'fallback-active', mode: 'memory', persistent: false, encryption: 'unavailable' });
    }
    return Object.freeze({ state: 'unavailable', mode: 'none', persistent: false, encryption: 'unavailable' });
  }

  save(keyInput, secretValue) {
    const key = normalizeCredentialKey(keyInput);
    const secret = normalizeSecret(secretValue);
    this._assertWritable();

    if (this.mode === 'memory') {
      this.memory.set(key.id, { key, secret });
      return makeReceipt(key, 'saved', 'memory');
    }

    let protectedBytes;
    try {
      protectedBytes = Buffer.from(this.safeStorage.encryptString(secret));
    } catch {
      throw vaultError('VAULT_ENCRYPTION_FAILED', 'Credential could not be protected.');
    }
    if (protectedBytes.length === 0 || protectedBytes.length > LIMITS.protectedBlobBytes) {
      throw vaultError('VAULT_ENCRYPTION_FAILED', 'Credential could not be protected.');
    }

    const envelope = JSON.stringify({
      version: VAULT_VERSION,
      keyDigest: key.id,
      protected: protectedBytes.toString('base64')
    });
    this._writeAtomic(this._secretPath(key), envelope);
    this._upsertMetadata(key);
    return makeReceipt(key, 'saved', 'protected');
  }

  set(keyInput, secretValue) {
    return this.save(keyInput, secretValue);
  }

  read(keyInput) {
    const key = normalizeCredentialKey(keyInput);
    this._assertReadable();

    if (this.mode === 'memory') return this.memory.get(key.id)?.secret || null;

    const secretPath = this._secretPath(key);
    if (!fs.existsSync(secretPath)) return null;
    const envelope = this._readEnvelope(secretPath, key);
    try {
      const secret = this.safeStorage.decryptString(decodeProtectedBlob(envelope.protected));
      return normalizeSecret(secret);
    } catch (error) {
      if (error?.code === 'VAULT_INVALID_SECRET') throw vaultError('VAULT_CORRUPT', 'Protected credential data is unavailable.');
      throw vaultError('VAULT_DECRYPTION_FAILED', 'Protected credential data is unavailable.');
    }
  }

  get(keyInput) {
    return this.read(keyInput);
  }

  has(keyInput) {
    const key = normalizeCredentialKey(keyInput);
    if (this.mode === 'memory') return this.memory.has(key.id);
    if (this.mode !== 'protected') return false;
    try {
      return fs.existsSync(this._secretPath(key));
    } catch {
      return false;
    }
  }

  deleteByKey(keyInput) {
    const key = normalizeCredentialKey(keyInput);
    this._assertWritable();

    if (this.mode === 'memory') {
      const deleted = this.memory.delete(key.id);
      return makeReceipt(key, deleted ? 'deleted' : 'missing', 'memory');
    }

    const secretPath = this._secretPath(key);
    let deleted = false;
    try {
      if (fs.existsSync(secretPath)) {
        fs.rmSync(secretPath, { force: false });
        deleted = true;
      }
    } catch {
      throw vaultError('VAULT_DELETE_FAILED', 'Protected credential could not be removed.');
    }
    this._removeMetadata(key);
    return makeReceipt(key, deleted ? 'deleted' : 'missing', 'protected');
  }

  delete(keyInput) {
    return this.deleteByKey(keyInput);
  }

  // This status list intentionally contains only non-secret lookup metadata.
  listStatus() {
    if (this.mode === 'memory') {
      return [...this.memory.values()]
        .map(({ key }) => makeReceipt(key, 'saved', 'memory'))
        .sort((left, right) => (left.service + ':' + left.account).localeCompare(right.service + ':' + right.account));
    }
    if (this.mode !== 'protected') return [];
    return this._readMetadata().map((entry) => makeReceipt(entry, 'saved', 'protected'));
  }

  _assertReadable() {
    if (this.mode === 'unavailable') {
      throw vaultError('VAULT_UNAVAILABLE', 'Protected credential storage is unavailable.');
    }
  }

  _assertWritable() {
    this._assertReadable();
  }

  _secretPath(key) {
    return path.join(this.secretDirectory, key.id + '.vault');
  }

  _ensureSecretDirectory() {
    try {
      fs.mkdirSync(this.secretDirectory, { recursive: true, mode: 0o700 });
    } catch {
      throw vaultError('VAULT_DIRECTORY_UNAVAILABLE', 'Protected credential storage is unavailable.');
    }
  }

  _writeAtomic(destination, text) {
    this._ensureSecretDirectory();
    const temporary = destination + '.' + process.pid + '.' + crypto.randomBytes(8).toString('hex') + '.tmp';
    try {
      const descriptor = fs.openSync(temporary, 'wx', 0o600);
      try {
        fs.writeFileSync(descriptor, text, { encoding: 'utf8' });
        fs.fsyncSync(descriptor);
      } finally {
        fs.closeSync(descriptor);
      }
      fs.renameSync(temporary, destination);
    } catch {
      try {
        if (fs.existsSync(temporary)) fs.rmSync(temporary, { force: true });
      } catch {
        // A stale temporary file contains encrypted data only.
      }
      throw vaultError('VAULT_WRITE_FAILED', 'Protected credential could not be saved.');
    }
  }

  _readEnvelope(secretPath, key) {
    let text;
    try {
      const stat = fs.statSync(secretPath);
      if (!stat.isFile() || stat.size <= 0 || stat.size > LIMITS.metadataBytes) {
        throw new Error('invalid');
      }
      text = fs.readFileSync(secretPath, 'utf8');
    } catch {
      throw vaultError('VAULT_CORRUPT', 'Protected credential data is unavailable.');
    }

    let envelope;
    try {
      envelope = JSON.parse(text);
      validateExactKeys(envelope, ['version', 'keyDigest', 'protected'], 'Protected credential data is unavailable.');
    } catch {
      throw vaultError('VAULT_CORRUPT', 'Protected credential data is unavailable.');
    }
    if (envelope.version !== VAULT_VERSION || envelope.keyDigest !== key.id) {
      throw vaultError('VAULT_CORRUPT', 'Protected credential data is unavailable.');
    }
    decodeProtectedBlob(envelope.protected);
    return envelope;
  }

  _readMetadata() {
    this._ensureSecretDirectory();
    if (!fs.existsSync(this.indexPath)) return [];
    let parsed;
    try {
      const stat = fs.statSync(this.indexPath);
      if (!stat.isFile() || stat.size <= 0 || stat.size > LIMITS.metadataBytes) throw new Error('invalid');
      parsed = JSON.parse(fs.readFileSync(this.indexPath, 'utf8'));
      validateExactKeys(parsed, ['version', 'entries'], 'Credential metadata is unavailable.');
      if (parsed.version !== VAULT_VERSION || !Array.isArray(parsed.entries) || parsed.entries.length > LIMITS.entries) throw new Error('invalid');
    } catch {
      throw vaultError('VAULT_METADATA_UNAVAILABLE', 'Credential metadata is unavailable.');
    }

    const entries = [];
    const seen = new Set();
    for (const candidate of parsed.entries) {
      const key = normalizeCredentialKey(candidate);
      if (seen.has(key.id)) throw vaultError('VAULT_METADATA_UNAVAILABLE', 'Credential metadata is unavailable.');
      seen.add(key.id);
      entries.push(key);
    }
    return entries;
  }

  _writeMetadata(entries) {
    const unique = new Map();
    for (const entry of entries) {
      const key = normalizeCredentialKey(entry);
      unique.set(key.id, { service: key.service, account: key.account });
    }
    if (unique.size > LIMITS.entries) throw vaultError('VAULT_METADATA_UNAVAILABLE', 'Credential metadata is unavailable.');
    const safeEntries = [...unique.values()].sort((left, right) => (left.service + ':' + left.account).localeCompare(right.service + ':' + right.account));
    this._writeAtomic(this.indexPath, JSON.stringify({ version: VAULT_VERSION, entries: safeEntries }));
  }

  _upsertMetadata(key) {
    const entries = this._readMetadata();
    entries.push(key);
    this._writeMetadata(entries);
  }

  _removeMetadata(key) {
    const entries = this._readMetadata().filter((entry) => entry.id !== key.id);
    this._writeMetadata(entries);
  }
}

module.exports = {
  CredentialVault,
  LIMITS,
  VAULT_VERSION,
  createCredentialKey
};
