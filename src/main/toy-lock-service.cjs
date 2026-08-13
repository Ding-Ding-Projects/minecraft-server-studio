'use strict';

// Local toy-lock metadata and vault-backed credential handling. These locks
// are intentionally a user-experience speed bump, not encryption or security.
// Passwords are represented only by a salted verifier inside the protected
// credential vault; TOTP secrets likewise never enter metadata or IPC results.

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { normalizeBase32Secret, validateTotp } = require('./totp-engine.cjs');

const TOY_LOCK_SCHEMA_VERSION = 1;
const PASSWORD_RECORD_VERSION = 1;
const LIMITS = Object.freeze({
  dataDirectoryChars: 4096,
  recoveryDirectoryChars: 4096,
  locks: 1_024,
  targetIdChars: 160,
  targetLabelChars: 160,
  passwordChars: 256,
  metadataBytes: 768 * 1024,
  unlockMinutes: 1_440,
  protectedRecordChars: 512
});

const TARGET_TYPES = new Set(['tab', 'element', 'appearance']);
const LOCK_METHODS = new Set(['password', 'totp']);
const IDENTIFIER_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TARGET_ID_PATTERN = /^[A-Za-z][A-Za-z0-9._:-]*$/;
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

function lockError(code, message) {
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
  if (!isPlainRecord(value)) throw lockError('TOY_LOCK_INVALID_INPUT', message);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw lockError('TOY_LOCK_INVALID_INPUT', message);
  }
}

function assertExactKeys(value, keys, message) {
  if (!isPlainRecord(value)) throw lockError('TOY_LOCK_INVALID_RECORD', message);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw lockError('TOY_LOCK_INVALID_RECORD', message);
  }
}

function normalizeDirectory(value, maximum, message) {
  if (typeof value !== 'string' || !value || value.length > maximum || /[\u0000-\u001f]/.test(value)) throw lockError('TOY_LOCK_INVALID_DIRECTORY', message);
  const resolved = path.resolve(value);
  if (resolved === path.parse(resolved).root) throw lockError('TOY_LOCK_INVALID_DIRECTORY', message);
  return resolved;
}

function normalizeText(value, maximum, label) {
  if (typeof value !== 'string') throw lockError('TOY_LOCK_INVALID_INPUT', `${label} must be text.`);
  const normalized = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!normalized || normalized.length > maximum) throw lockError('TOY_LOCK_INVALID_INPUT', `${label} is invalid.`);
  return normalized;
}

function normalizeTargetType(value) {
  if (typeof value !== 'string' || !TARGET_TYPES.has(value)) throw lockError('TOY_LOCK_INVALID_INPUT', 'Toy-lock target type is invalid.');
  return value;
}

function normalizeTargetId(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > LIMITS.targetIdChars || !TARGET_ID_PATTERN.test(value)) {
    throw lockError('TOY_LOCK_INVALID_INPUT', 'Toy-lock target identifier is invalid.');
  }
  return value;
}

function normalizeMethod(value) {
  if (typeof value !== 'string' || !LOCK_METHODS.has(value)) throw lockError('TOY_LOCK_INVALID_INPUT', 'Toy-lock method is invalid.');
  return value;
}

function normalizeUnlockMinutes(value) {
  if (value === undefined || value === null || value === '' || value === 'session') return 0;
  const numeric = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  if (!Number.isInteger(numeric) || numeric < 1 || numeric > LIMITS.unlockMinutes) {
    throw lockError('TOY_LOCK_INVALID_INPUT', 'Unlock duration must be a session or a whole number of minutes within the supported range.');
  }
  return numeric;
}

function normalizePassword(value) {
  if (typeof value !== 'string' || value.length < 4 || value.length > LIMITS.passwordChars || /\u0000/.test(value)) {
    throw lockError('TOY_LOCK_INVALID_CREDENTIAL', 'Toy-lock password is invalid.');
  }
  return value;
}

function normalizeId(value) {
  if (typeof value !== 'string' || !IDENTIFIER_PATTERN.test(value)) throw lockError('TOY_LOCK_INVALID_RECORD', 'Toy-lock metadata is invalid.');
  return value.toLowerCase();
}

function normalizeTimestamp(value) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw lockError('TOY_LOCK_INVALID_RECORD', 'Toy-lock metadata is invalid.');
  return new Date(value).toISOString();
}

function normalizePersistedLock(value) {
  assertExactKeys(value, ['id', 'targetType', 'targetId', 'targetLabel', 'method', 'unlockMinutes', 'createdAt', 'updatedAt'], 'Toy-lock metadata is invalid.');
  const unlockMinutes = value.unlockMinutes;
  if (!Number.isInteger(unlockMinutes) || unlockMinutes < 0 || unlockMinutes > LIMITS.unlockMinutes) {
    throw lockError('TOY_LOCK_INVALID_RECORD', 'Toy-lock metadata is invalid.');
  }
  return Object.freeze({
    id: normalizeId(value.id),
    targetType: normalizeTargetType(value.targetType),
    targetId: normalizeTargetId(value.targetId),
    targetLabel: normalizeText(value.targetLabel, LIMITS.targetLabelChars, 'Toy-lock target label'),
    method: normalizeMethod(value.method),
    unlockMinutes,
    createdAt: normalizeTimestamp(value.createdAt),
    updatedAt: normalizeTimestamp(value.updatedAt)
  });
}

function normalizeTotpLockPairingInput(value) {
  const input = value || {};
  assertKnownKeys(input, new Set(['targetType', 'targetId', 'targetLabel', 'method', 'password', 'passwordConfirmation', 'totpSecret', 'unlockMinutes']), 'Toy-lock input is invalid.');
  const method = normalizeMethod(input.method);
  if (method !== 'totp') throw lockError('TOY_LOCK_INVALID_INPUT', 'Only a TOTP toy lock can use the pairing flow.');
  return Object.freeze({
    targetType: normalizeTargetType(input.targetType),
    targetId: normalizeTargetId(input.targetId),
    targetLabel: normalizeText(input.targetLabel, LIMITS.targetLabelChars, 'Toy-lock target label'),
    method,
    totpSecret: normalizeBase32Secret(input.totpSecret || ''),
    unlockMinutes: normalizeUnlockMinutes(input.unlockMinutes)
  });
}

function scryptVerifier(password, salt) {
  return crypto.scryptSync(Buffer.from(password, 'utf8'), salt, 32, { N: 16_384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 });
}

function createPasswordRecord(password) {
  const salt = crypto.randomBytes(16);
  const derived = scryptVerifier(password, salt);
  return JSON.stringify({
    version: PASSWORD_RECORD_VERSION,
    algorithm: 'scrypt',
    salt: salt.toString('base64'),
    derived: derived.toString('base64')
  });
}

function decodePasswordRecord(value) {
  if (typeof value !== 'string' || !value || value.length > LIMITS.protectedRecordChars) return null;
  try {
    const parsed = JSON.parse(value);
    assertExactKeys(parsed, ['version', 'algorithm', 'salt', 'derived'], 'Toy-lock credential is invalid.');
    if (parsed.version !== PASSWORD_RECORD_VERSION || parsed.algorithm !== 'scrypt' || !BASE64_PATTERN.test(parsed.salt) || !BASE64_PATTERN.test(parsed.derived)) return null;
    const salt = Buffer.from(parsed.salt, 'base64');
    const derived = Buffer.from(parsed.derived, 'base64');
    if (salt.length !== 16 || derived.length !== 32 || salt.toString('base64') !== parsed.salt || derived.toString('base64') !== parsed.derived) return null;
    return { salt, derived };
  } catch {
    return null;
  }
}

function passwordMatches(record, candidate) {
  const decoded = decodePasswordRecord(record);
  if (!decoded) return false;
  const derived = scryptVerifier(candidate, decoded.salt);
  return derived.length === decoded.derived.length && crypto.timingSafeEqual(derived, decoded.derived);
}

function normalizeTargetRegistry(value) {
  if (!Array.isArray(value) || value.length > LIMITS.locks) {
    throw lockError('TOY_LOCK_TARGET_REGISTRY_INVALID', 'Toy-lock target registry is unavailable.');
  }
  const identifiers = new Set();
  return Object.freeze(value.map((candidate) => {
    assertExactKeys(candidate, ['targetType', 'targetId', 'targetLabel'], 'Toy-lock target registry is invalid.');
    const target = Object.freeze({
      targetType: normalizeTargetType(candidate.targetType),
      targetId: normalizeTargetId(candidate.targetId),
      targetLabel: normalizeText(candidate.targetLabel, LIMITS.targetLabelChars, 'Toy-lock target label')
    });
    const identifier = `${target.targetType}:${target.targetId}`;
    if (identifiers.has(identifier)) throw lockError('TOY_LOCK_TARGET_REGISTRY_INVALID', 'Toy-lock target registry is invalid.');
    identifiers.add(identifier);
    return target;
  }).sort((left, right) => left.targetLabel.localeCompare(right.targetLabel)));
}

function publicTarget(target, lock, state) {
  return Object.freeze({
    targetType: target.targetType,
    targetId: target.targetId,
    targetLabel: target.targetLabel,
    lock: lock ? publicLock(lock, state) : null
  });
}

function publicLock(lock, state) {
  return Object.freeze({
    id: lock.id,
    targetType: lock.targetType,
    targetId: lock.targetId,
    targetLabel: lock.targetLabel,
    method: lock.method,
    unlockMinutes: lock.unlockMinutes,
    createdAt: lock.createdAt,
    updatedAt: lock.updatedAt,
    state: state.state,
    unlockedUntil: state.unlockedUntil
  });
}

class ToyLockService {
  constructor(options = {}) {
    assertKnownKeys(options, new Set(['dataDir', 'recoveryDirectory', 'credentialVault', 'onChange', 'targets']), 'Toy-lock service options are invalid.');
    this.dataDir = normalizeDirectory(options.dataDir, LIMITS.dataDirectoryChars, 'Toy-lock storage requires an application-private data directory.');
    this.recoveryDirectory = normalizeDirectory(options.recoveryDirectory, LIMITS.recoveryDirectoryChars, 'Toy-lock recovery requires an application-private data directory.');
    this.locksPath = path.join(this.dataDir, 'toy-locks.json');
    this.targets = normalizeTargetRegistry(options.targets || []);
    this.credentialVault = options.credentialVault || null;
    this.onChange = typeof options.onChange === 'function' ? options.onChange : null;
    this.locks = [];
    this.unlocked = new Map();
    this.initialized = false;
    this.metadataError = '';
  }

  initialize() {
    this.initialized = true;
    this.metadataError = '';
    this.locks = [];
    try {
      this._ensureDirectory();
      if (!fs.existsSync(this.locksPath)) return this.getStatus();
      const stat = fs.statSync(this.locksPath);
      if (!stat.isFile() || stat.size <= 0 || stat.size > LIMITS.metadataBytes) throw new Error('invalid');
      const parsed = JSON.parse(fs.readFileSync(this.locksPath, 'utf8'));
      assertExactKeys(parsed, ['version', 'locks'], 'Toy-lock metadata is invalid.');
      if (parsed.version !== TOY_LOCK_SCHEMA_VERSION || !Array.isArray(parsed.locks) || parsed.locks.length > LIMITS.locks) throw new Error('invalid');
      const identifiers = new Set();
      this.locks = parsed.locks.map((lock) => {
        const normalized = normalizePersistedLock(lock);
        if (identifiers.has(normalized.id)) throw new Error('duplicate');
        identifiers.add(normalized.id);
        return normalized;
      }).sort((left, right) => left.targetLabel.localeCompare(right.targetLabel));
    } catch {
      this.locks = [];
      this.metadataError = 'Toy-lock metadata is unavailable. Existing records were not overwritten.';
    }
    return this.getStatus();
  }

  getStatus() {
    const vault = this._vaultStatus();
    return Object.freeze({
      state: this.metadataError ? 'metadata-unavailable' : (vault.ready ? 'ready' : 'credential-unavailable'),
      lockCount: this.locks.length,
      detail: this.metadataError || (vault.ready ? 'Each configured toy lock has an independent protected credential.' : 'Protected credential storage is unavailable, so toy locks cannot be created or unlocked.'),
      disclosure: 'Toy locks are a user-experience speed bump, not encryption or security. Delete this application data folder yourself to reset every toy lock.',
      recoveryDirectory: this.recoveryDirectory,
      registeredTargetCount: this.targets.length,
      everyElementCoverage: Object.freeze({ state: 'incomplete', detail: 'This lane guards its shipped registered targets only. Context-menu and keyboard wiring for every rendered element is not implemented yet.' })
    });
  }

  listLocks() {
    this._assertMetadataReady();
    this._expireUnlocks();
    return Object.freeze({
      status: this.getStatus(),
      targets: this.targets.map((target) => {
        const lock = this.locks.find((candidate) => candidate.targetType === target.targetType && candidate.targetId === target.targetId);
        return publicTarget(target, lock, lock ? this._lockState(lock.id) : null);
      }),
      locks: this.locks.map((lock) => publicLock(lock, this._lockState(lock.id)))
    });
  }

  createLock(input) {
    this._assertReady();
    if (this.locks.length >= LIMITS.locks) throw lockError('TOY_LOCK_LIMIT', 'The toy-lock limit has been reached.');
    assertKnownKeys(input || {}, new Set(['targetType', 'targetId', 'targetLabel', 'method', 'password', 'passwordConfirmation', 'totpSecret', 'unlockMinutes']), 'Toy-lock input is invalid.');
    const source = input || {};
    const method = normalizeMethod(source.method);
    const password = method === 'password' ? normalizePassword(source.password) : '';
    if (method === 'password') {
      const confirmation = normalizePassword(source.passwordConfirmation);
      const left = Buffer.from(password, 'utf8');
      const right = Buffer.from(confirmation, 'utf8');
      if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) throw lockError('TOY_LOCK_INVALID_CREDENTIAL', 'Toy-lock password confirmation did not match.');
    }
    const totpSecret = method === 'totp' ? normalizeBase32Secret(source.totpSecret || '') : '';
    const now = new Date().toISOString();
    const targetType = normalizeTargetType(source.targetType);
    const targetId = normalizeTargetId(source.targetId);
    const registeredTarget = this.targets.find((candidate) => candidate.targetType === targetType && candidate.targetId === targetId);
    if (!registeredTarget) throw lockError('TOY_LOCK_UNKNOWN_TARGET', 'Choose a shipped toy-lock target from the registered local target list.');
    const requestedLabel = normalizeText(source.targetLabel, LIMITS.targetLabelChars, 'Toy-lock target label');
    if (requestedLabel !== registeredTarget.targetLabel) throw lockError('TOY_LOCK_TARGET_LABEL_MISMATCH', 'The toy-lock target label must match the selected shipped target.');
    const lock = Object.freeze({
      id: crypto.randomUUID(),
      targetType,
      targetId,
      targetLabel: registeredTarget.targetLabel,
      method,
      unlockMinutes: normalizeUnlockMinutes(source.unlockMinutes),
      createdAt: now,
      updatedAt: now
    });
    if (this.locks.some((candidate) => candidate.targetType === lock.targetType && candidate.targetId === lock.targetId)) {
      throw lockError('TOY_LOCK_TARGET_EXISTS', 'This target already has its own toy lock. Change or remove that lock before creating another one.');
    }
    const key = this._credentialKey(lock.id);
    this.credentialVault.save(key, method === 'password' ? createPasswordRecord(password) : totpSecret);
    try {
      this.locks = [...this.locks, lock].sort((left, right) => left.targetLabel.localeCompare(right.targetLabel));
      this._writeLocks();
    } catch (error) {
      this.locks = this.locks.filter((candidate) => candidate.id !== lock.id);
      try { this.credentialVault.delete(key); } catch { /* A protected but unreachable record is safer than plaintext recovery. */ }
      throw error;
    }
    this._notify();
    return publicLock(lock, this._lockState(lock.id));
  }

  unlock(lockId, credential) {
    this._assertReady();
    const lock = this._findLock(lockId);
    if (typeof credential !== 'string' || credential.length === 0 || credential.length > LIMITS.passwordChars) {
      throw lockError('TOY_LOCK_INVALID_CREDENTIAL', 'Toy-lock credential is invalid.');
    }
    let protectedValue;
    try {
      protectedValue = this.credentialVault.read(this._credentialKey(lock.id));
    } catch {
      throw lockError('TOY_LOCK_CREDENTIAL_UNAVAILABLE', 'The protected toy-lock credential is unavailable.');
    }
    const matched = lock.method === 'password'
      ? passwordMatches(protectedValue || '', credential)
      : (() => {
        try { return validateTotp(protectedValue || '', credential); } catch { return false; }
      })();
    if (!matched) throw lockError('TOY_LOCK_DENIED', 'The supplied credential did not unlock this toy lock. Delete the application data folder yourself if recovery is needed.');
    const expiresAt = lock.unlockMinutes === 0 ? null : new Date(Date.now() + lock.unlockMinutes * 60_000).toISOString();
    this.unlocked.set(lock.id, { expiresAt });
    this._notify();
    return publicLock(lock, this._lockState(lock.id));
  }

  relock(lockId) {
    this._assertMetadataReady();
    const lock = this._findLock(lockId);
    this.unlocked.delete(lock.id);
    this._notify();
    return publicLock(lock, this._lockState(lock.id));
  }

  removeLock(lockId) {
    this._assertReady();
    const lock = this._findLock(lockId);
    const original = this.locks;
    const retained = this.locks.filter((candidate) => candidate.id !== lock.id);
    this.locks = retained;
    this.unlocked.delete(lock.id);
    try {
      this._writeLocks();
    } catch (error) {
      this.locks = original;
      throw error;
    }
    try {
      this.credentialVault.delete(this._credentialKey(lock.id));
    } catch {
      // The metadata record is already gone. A protected orphan is safer than
      // recreating a deleted lock or exposing credential material.
    }
    this._notify();
    return Object.freeze({ id: lock.id, targetType: lock.targetType, targetId: lock.targetId, targetLabel: lock.targetLabel });
  }

  lockForTarget(targetType, targetId) {
    this._assertMetadataReady();
    this._expireUnlocks();
    const normalizedType = normalizeTargetType(targetType);
    const normalizedId = normalizeTargetId(targetId);
    const lock = this.locks.find((candidate) => candidate.targetType === normalizedType && candidate.targetId === normalizedId);
    return lock ? publicLock(lock, this._lockState(lock.id)) : null;
  }

  _assertMetadataReady() {
    if (!this.initialized) throw lockError('TOY_LOCK_NOT_READY', 'Toy-lock storage is still starting.');
    if (this.metadataError) throw lockError('TOY_LOCK_METADATA_UNAVAILABLE', this.metadataError);
  }

  _assertReady() {
    this._assertMetadataReady();
    if (!this._vaultStatus().ready) throw lockError('TOY_LOCK_CREDENTIAL_UNAVAILABLE', 'Protected credential storage is unavailable.');
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
      throw lockError('TOY_LOCK_CREDENTIAL_UNAVAILABLE', 'Protected credential storage is unavailable.');
    }
    return this.credentialVault.createKey('minecraft-server-studio-toy-lock', `lock:${id}`);
  }

  _findLock(id) {
    const normalized = normalizeId(id);
    const lock = this.locks.find((candidate) => candidate.id === normalized);
    if (!lock) throw lockError('TOY_LOCK_NOT_FOUND', 'The requested toy lock no longer exists.');
    return lock;
  }

  _expireUnlocks() {
    const now = Date.now();
    for (const [id, value] of this.unlocked) {
      if (value?.expiresAt && Date.parse(value.expiresAt) <= now) this.unlocked.delete(id);
    }
  }

  _lockState(id) {
    this._expireUnlocks();
    const value = this.unlocked.get(id);
    return value ? { state: 'unlocked', unlockedUntil: value.expiresAt } : { state: 'locked', unlockedUntil: null };
  }

  _ensureDirectory() {
    try {
      fs.mkdirSync(this.dataDir, { recursive: true, mode: 0o700 });
    } catch {
      throw lockError('TOY_LOCK_DIRECTORY_UNAVAILABLE', 'Toy-lock storage is unavailable.');
    }
  }

  _writeLocks() {
    this._ensureDirectory();
    const payload = JSON.stringify({ version: TOY_LOCK_SCHEMA_VERSION, locks: this.locks });
    const temporary = `${this.locksPath}.${process.pid}.${crypto.randomBytes(8).toString('hex')}.tmp`;
    try {
      const descriptor = fs.openSync(temporary, 'wx', 0o600);
      try {
        fs.writeFileSync(descriptor, payload, 'utf8');
        fs.fsyncSync(descriptor);
      } finally {
        fs.closeSync(descriptor);
      }
      fs.renameSync(temporary, this.locksPath);
    } catch {
      try { if (fs.existsSync(temporary)) fs.rmSync(temporary, { force: true }); } catch { /* Best-effort cleanup only. */ }
      throw lockError('TOY_LOCK_WRITE_FAILED', 'Toy-lock metadata could not be saved.');
    }
  }

  _notify() {
    try { this.onChange?.(); } catch { /* Renderer notification failures do not change local storage state. */ }
  }
}

module.exports = Object.freeze({
  LIMITS,
  normalizeTotpLockPairingInput,
  TOY_LOCK_SCHEMA_VERSION,
  ToyLockService
});
