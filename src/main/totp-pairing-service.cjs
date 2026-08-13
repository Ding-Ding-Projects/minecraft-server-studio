'use strict';

// Ephemeral main-process staging for an explicit authenticator pairing reveal.
// A pairing secret lives only in this process memory until the typed current
// TOTP code confirms it. It is then handed directly to the existing vault-backed
// services; no pairing session, QR pixels, URI, secret, or code is written here.

const crypto = require('node:crypto');
const { buildOtpAuthUri, normalizeAuthenticatorEntryInput } = require('./authenticator-service.cjs');
const { normalizeTotpLockPairingInput } = require('./toy-lock-service.cjs');
const {
  DEFAULT_ALGORITHM,
  DEFAULT_DIGITS,
  DEFAULT_PERIOD_SECONDS,
  validateTotp
} = require('./totp-engine.cjs');

const PAIRING_LIFETIME_MILLISECONDS = 60_000;
const MAX_PENDING_PAIRINGS = 8;
const MAX_CONFIRMATION_ATTEMPTS = 5;
const QR_MAX_UTF8_BYTES = 271;
const PAIRING_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function pairingError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function normalizedPairingId(value) {
  if (typeof value !== 'string' || !PAIRING_ID_PATTERN.test(value)) {
    throw pairingError('TOTP_PAIRING_INVALID_SESSION', 'The local pairing session is invalid. Start a new pairing reveal.');
  }
  return value.toLowerCase();
}

function pairingAccountForToyLock(targetLabel) {
  const value = String(targetLabel || '').replace(/\s+/g, ' ').trim();
  return `Toy lock · ${value}`.slice(0, 160);
}

class TotpPairingService {
  constructor() {
    this.sessions = new Map();
  }

  beginAuthenticatorEntry(input) {
    const entry = normalizeAuthenticatorEntryInput(input);
    return this._begin({
      kind: 'authenticator-entry',
      input: Object.freeze({
        issuer: entry.issuer,
        account: entry.account,
        label: entry.label,
        group: entry.group,
        manualSecret: entry.secret,
        algorithm: entry.algorithm,
        digits: entry.digits,
        period: entry.period
      }),
      issuer: entry.issuer,
      account: entry.account,
      secret: entry.secret,
      algorithm: entry.algorithm,
      digits: entry.digits,
      period: entry.period
    });
  }

  beginToyLock(input) {
    const lock = normalizeTotpLockPairingInput(input);
    return this._begin({
      kind: 'toy-lock',
      input: Object.freeze({
        targetType: lock.targetType,
        targetId: lock.targetId,
        targetLabel: lock.targetLabel,
        method: lock.method,
        totpSecret: lock.totpSecret,
        unlockMinutes: lock.unlockMinutes
      }),
      issuer: 'Minecraft Server Studio',
      account: pairingAccountForToyLock(lock.targetLabel),
      secret: lock.totpSecret,
      algorithm: DEFAULT_ALGORITHM,
      digits: DEFAULT_DIGITS,
      period: DEFAULT_PERIOD_SECONDS
    });
  }

  confirm(pairingId, code) {
    this._discardExpired();
    const id = normalizedPairingId(pairingId);
    const session = this.sessions.get(id);
    if (!session) throw pairingError('TOTP_PAIRING_EXPIRED', 'This local pairing reveal expired. Start a new pairing reveal.');
    const matched = validateTotp(session.secret, code, {
      algorithm: session.algorithm,
      digits: session.digits,
      period: session.period,
      window: 0
    });
    if (!matched) {
      session.attempts += 1;
      if (session.attempts >= MAX_CONFIRMATION_ATTEMPTS) {
        this._discard(id);
        throw pairingError('TOTP_PAIRING_DENIED', 'The current code did not match. This pairing reveal was cleared after too many attempts.');
      }
      throw pairingError('TOTP_PAIRING_DENIED', 'The current code did not match this local pairing reveal.');
    }
    const confirmed = Object.freeze({ kind: session.kind, input: session.input });
    this._discard(id);
    return confirmed;
  }

  cancel(pairingId) {
    const id = normalizedPairingId(pairingId);
    this._discard(id);
    return Object.freeze({ state: 'cleared' });
  }

  dispose() {
    for (const id of this.sessions.keys()) this._discard(id);
  }

  _begin(candidate) {
    this._discardExpired();
    if (this.sessions.size >= MAX_PENDING_PAIRINGS) {
      throw pairingError('TOTP_PAIRING_LIMIT', 'Too many local pairing reveals are active. Cancel or wait for an existing reveal to expire.');
    }
    const uri = buildOtpAuthUri(candidate);
    const id = crypto.randomUUID();
    const expiresAtMilliseconds = Date.now() + PAIRING_LIFETIME_MILLISECONDS;
    const session = {
      id,
      kind: candidate.kind,
      input: candidate.input,
      issuer: candidate.issuer,
      account: candidate.account,
      secret: candidate.secret,
      algorithm: candidate.algorithm,
      digits: candidate.digits,
      period: candidate.period,
      uri,
      expiresAtMilliseconds,
      attempts: 0,
      timer: null
    };
    session.timer = setTimeout(() => this._discard(id), PAIRING_LIFETIME_MILLISECONDS);
    session.timer.unref?.();
    this.sessions.set(id, session);
    const qrBytes = Buffer.byteLength(uri, 'utf8');
    return Object.freeze({
      id,
      kind: session.kind,
      issuer: session.issuer,
      account: session.account,
      algorithm: session.algorithm,
      digits: session.digits,
      period: session.period,
      manualSecret: session.secret,
      otpauthUri: session.uri,
      expiresAt: new Date(expiresAtMilliseconds).toISOString(),
      qr: Object.freeze({
        available: qrBytes <= QR_MAX_UTF8_BYTES,
        reason: qrBytes <= QR_MAX_UTF8_BYTES
          ? 'This QR code is rendered locally in the app and is never sent to a service.'
          : 'This standard URI is too long for the bundled local QR encoder. The one-minute manual Base32 reveal remains available.'
      })
    });
  }

  _discardExpired() {
    const now = Date.now();
    for (const [id, session] of this.sessions.entries()) {
      if (session.expiresAtMilliseconds <= now) this._discard(id);
    }
  }

  _discard(id) {
    const session = this.sessions.get(id);
    if (!session) return;
    if (session.timer) clearTimeout(session.timer);
    session.secret = '';
    session.uri = '';
    session.input = null;
    this.sessions.delete(id);
  }
}

module.exports = Object.freeze({
  MAX_CONFIRMATION_ATTEMPTS,
  MAX_PENDING_PAIRINGS,
  PAIRING_LIFETIME_MILLISECONDS,
  QR_MAX_UTF8_BYTES,
  TotpPairingService
});
