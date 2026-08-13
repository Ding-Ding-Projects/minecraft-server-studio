'use strict';

// Local RFC 4226 / RFC 6238 primitives. This module intentionally accepts
// only bounded base32 text, uses Node's built-in crypto implementation, and
// never logs or persists authenticator secrets.

const crypto = require('node:crypto');

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const DEFAULT_ALGORITHM = 'SHA-1';
const DEFAULT_DIGITS = 6;
const DEFAULT_PERIOD_SECONDS = 30;
const MAX_COUNTER = (1n << 64n) - 1n;
const LIMITS = Object.freeze({
  base32InputChars: 4096,
  base32Chars: 2048,
  secretBytes: 1280,
  periodSeconds: 86_400,
  validationWindow: 10,
  timestampMilliseconds: 8_640_000_000_000_000
});

const ALGORITHMS = Object.freeze({
  'SHA-1': 'sha1',
  'SHA-256': 'sha256',
  'SHA-512': 'sha512'
});

const ALGORITHM_ALIASES = Object.freeze({
  SHA1: 'SHA-1',
  'SHA-1': 'SHA-1',
  SHA256: 'SHA-256',
  'SHA-256': 'SHA-256',
  SHA512: 'SHA-512',
  'SHA-512': 'SHA-512'
});

const BASE32_PADDING_BY_REMAINDER = Object.freeze({
  0: 0,
  2: 6,
  4: 4,
  5: 3,
  7: 1
});

const BASE32_UNUSED_BITS_BY_REMAINDER = Object.freeze({
  0: 0,
  2: 2,
  4: 4,
  5: 1,
  7: 3
});

function totpError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function isPlainRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function normalizeOptions(value, allowedKeys) {
  const options = value === undefined ? {} : value;
  if (!isPlainRecord(options)) throw totpError('TOTP_INVALID_OPTIONS', 'Authenticator options are invalid.');
  for (const key of Object.keys(options)) {
    if (!allowedKeys.has(key)) throw totpError('TOTP_INVALID_OPTIONS', 'Authenticator options are invalid.');
  }
  return options;
}

function normalizeBase32Secret(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > LIMITS.base32InputChars) {
    throw totpError('TOTP_INVALID_SECRET', 'Authenticator secret is invalid.');
  }

  const compact = value.replace(/[\s-]/g, '').toUpperCase();
  const paddingStart = compact.indexOf('=');
  const body = paddingStart === -1 ? compact : compact.slice(0, paddingStart);
  const padding = paddingStart === -1 ? '' : compact.slice(paddingStart);

  if (!body || body.length > LIMITS.base32Chars || !/^[A-Z2-7]+$/.test(body) || (padding && !/^=+$/.test(padding))) {
    throw totpError('TOTP_INVALID_SECRET', 'Authenticator secret is invalid.');
  }

  const expectedPadding = BASE32_PADDING_BY_REMAINDER[body.length % 8];
  const unusedBits = BASE32_UNUSED_BITS_BY_REMAINDER[body.length % 8];
  const lastValue = BASE32_ALPHABET.indexOf(body[body.length - 1]);
  if (
    expectedPadding === undefined
    || unusedBits === undefined
    || (padding && (compact.length % 8 !== 0 || padding.length !== expectedPadding))
    || (unusedBits > 0 && (lastValue & ((1 << unusedBits) - 1)) !== 0)
  ) {
    throw totpError('TOTP_INVALID_SECRET', 'Authenticator secret is invalid.');
  }

  const decodedLength = Math.floor((body.length * 5) / 8);
  if (decodedLength === 0 || decodedLength > LIMITS.secretBytes) {
    throw totpError('TOTP_INVALID_SECRET', 'Authenticator secret is invalid.');
  }

  return body;
}

function isValidBase32Secret(value) {
  try {
    normalizeBase32Secret(value);
    return true;
  } catch {
    return false;
  }
}

function decodeBase32Secret(value) {
  const normalized = normalizeBase32Secret(value);
  const decoded = Buffer.alloc(Math.floor((normalized.length * 5) / 8));
  let accumulator = 0;
  let bitCount = 0;
  let offset = 0;

  for (const character of normalized) {
    accumulator = (accumulator << 5) | BASE32_ALPHABET.indexOf(character);
    bitCount += 5;
    while (bitCount >= 8) {
      bitCount -= 8;
      decoded[offset] = (accumulator >>> bitCount) & 0xff;
      offset += 1;
      accumulator &= (1 << bitCount) - 1;
    }
  }

  if (offset !== decoded.length) throw totpError('TOTP_INVALID_SECRET', 'Authenticator secret is invalid.');
  return decoded;
}

function normalizeAlgorithm(value = DEFAULT_ALGORITHM) {
  if (typeof value !== 'string' || value.length > 16) {
    throw totpError('TOTP_INVALID_ALGORITHM', 'Authenticator algorithm is invalid.');
  }
  const algorithm = ALGORITHM_ALIASES[value.trim().toUpperCase()];
  if (!algorithm) throw totpError('TOTP_INVALID_ALGORITHM', 'Authenticator algorithm is invalid.');
  return algorithm;
}

function normalizeDigits(value = DEFAULT_DIGITS) {
  if (!Number.isInteger(value) || value < 6 || value > 8) {
    throw totpError('TOTP_INVALID_DIGITS', 'Authenticator digits must be a whole number from 6 to 8.');
  }
  return value;
}

function normalizePeriod(value = DEFAULT_PERIOD_SECONDS) {
  if (!Number.isInteger(value) || value < 1 || value > LIMITS.periodSeconds) {
    throw totpError('TOTP_INVALID_PERIOD', 'Authenticator period is invalid.');
  }
  return value;
}

function normalizeTimestamp(value = Date.now()) {
  const timestamp = value instanceof Date ? value.getTime() : value;
  if (!Number.isSafeInteger(timestamp) || timestamp < 0 || timestamp > LIMITS.timestampMilliseconds) {
    throw totpError('TOTP_INVALID_TIMESTAMP', 'Authenticator timestamp is invalid.');
  }
  return timestamp;
}

function normalizeCounter(value) {
  let counter;
  if (typeof value === 'bigint') {
    counter = value;
  } else if (typeof value === 'number' && Number.isSafeInteger(value)) {
    counter = BigInt(value);
  } else {
    throw totpError('TOTP_INVALID_COUNTER', 'Authenticator counter is invalid.');
  }
  if (counter < 0n || counter > MAX_COUNTER) {
    throw totpError('TOTP_INVALID_COUNTER', 'Authenticator counter is invalid.');
  }
  return counter;
}

function normalizeValidationWindow(value = 0) {
  if (!Number.isInteger(value) || value < 0 || value > LIMITS.validationWindow) {
    throw totpError('TOTP_INVALID_WINDOW', 'Authenticator validation window is invalid.');
  }
  return value;
}

function normalizeHotpOptions(value) {
  const options = normalizeOptions(value, new Set(['algorithm', 'digits']));
  return Object.freeze({
    algorithm: normalizeAlgorithm(options.algorithm),
    digits: normalizeDigits(options.digits)
  });
}

function normalizeTotpOptions(value) {
  const options = normalizeOptions(value, new Set(['algorithm', 'digits', 'period', 'timestamp']));
  return Object.freeze({
    algorithm: normalizeAlgorithm(options.algorithm),
    digits: normalizeDigits(options.digits),
    period: normalizePeriod(options.period),
    timestamp: normalizeTimestamp(options.timestamp)
  });
}

function normalizeValidationOptions(value) {
  const options = normalizeOptions(value, new Set(['algorithm', 'digits', 'period', 'timestamp', 'window']));
  return Object.freeze({
    algorithm: normalizeAlgorithm(options.algorithm),
    digits: normalizeDigits(options.digits),
    period: normalizePeriod(options.period),
    timestamp: normalizeTimestamp(options.timestamp),
    window: normalizeValidationWindow(options.window)
  });
}

function counterForTimestamp(timestamp, period) {
  return normalizeCounter(BigInt(Math.floor(timestamp / (period * 1000))));
}

function counterBuffer(counter) {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(counter);
  return buffer;
}

function calculateHotpFromDecodedSecret(secret, counter, algorithm, digits) {
  const digest = crypto.createHmac(ALGORITHMS[algorithm], secret).update(counterBuffer(counter)).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24)
    | (digest[offset + 1] << 16)
    | (digest[offset + 2] << 8)
    | digest[offset + 3];
  return String(binary % (10 ** digits)).padStart(digits, '0');
}

function calculateHotp(secret, counter, options = {}) {
  const normalizedOptions = normalizeHotpOptions(options);
  return calculateHotpFromDecodedSecret(
    decodeBase32Secret(secret),
    normalizeCounter(counter),
    normalizedOptions.algorithm,
    normalizedOptions.digits
  );
}

function calculateTotp(secret, options = {}) {
  const normalizedOptions = normalizeTotpOptions(options);
  return calculateHotpFromDecodedSecret(
    decodeBase32Secret(secret),
    counterForTimestamp(normalizedOptions.timestamp, normalizedOptions.period),
    normalizedOptions.algorithm,
    normalizedOptions.digits
  );
}

function calculateNextTotp(secret, options = {}) {
  const normalizedOptions = normalizeTotpOptions(options);
  const counter = counterForTimestamp(normalizedOptions.timestamp, normalizedOptions.period);
  if (counter === MAX_COUNTER) throw totpError('TOTP_INVALID_COUNTER', 'Authenticator counter is invalid.');
  return calculateHotpFromDecodedSecret(
    decodeBase32Secret(secret),
    counter + 1n,
    normalizedOptions.algorithm,
    normalizedOptions.digits
  );
}

function timeRemaining(options = {}) {
  const optionsRecord = normalizeOptions(options, new Set(['period', 'timestamp']));
  const period = normalizePeriod(optionsRecord.period);
  const timestamp = normalizeTimestamp(optionsRecord.timestamp);
  const periodMilliseconds = period * 1000;
  const elapsed = timestamp % periodMilliseconds;
  return Math.max(1, Math.ceil((periodMilliseconds - elapsed) / 1000));
}

function totpSnapshot(secret, options = {}) {
  const normalizedOptions = normalizeTotpOptions(options);
  const decodedSecret = decodeBase32Secret(secret);
  const counter = counterForTimestamp(normalizedOptions.timestamp, normalizedOptions.period);
  if (counter === MAX_COUNTER) throw totpError('TOTP_INVALID_COUNTER', 'Authenticator counter is invalid.');
  return Object.freeze({
    algorithm: normalizedOptions.algorithm,
    digits: normalizedOptions.digits,
    period: normalizedOptions.period,
    timestamp: normalizedOptions.timestamp,
    counter: counter.toString(),
    code: calculateHotpFromDecodedSecret(decodedSecret, counter, normalizedOptions.algorithm, normalizedOptions.digits),
    nextCode: calculateHotpFromDecodedSecret(decodedSecret, counter + 1n, normalizedOptions.algorithm, normalizedOptions.digits),
    secondsRemaining: timeRemaining({ period: normalizedOptions.period, timestamp: normalizedOptions.timestamp })
  });
}

function timingSafeCodeEquals(expected, candidate) {
  if (typeof expected !== 'string' || typeof candidate !== 'string' || expected.length > 8 || candidate.length > 8) {
    return false;
  }
  const expectedBytes = Buffer.from(expected, 'ascii');
  const candidateBytes = Buffer.from(candidate, 'ascii');
  return expectedBytes.length === candidateBytes.length && crypto.timingSafeEqual(expectedBytes, candidateBytes);
}

function validCandidateCode(value, digits) {
  return typeof value === 'string' && new RegExp(`^[0-9]{${digits}}$`).test(value);
}

function validateTotp(secret, candidate, options = {}) {
  const normalizedOptions = normalizeValidationOptions(options);
  if (!validCandidateCode(candidate, normalizedOptions.digits)) return false;

  const decodedSecret = decodeBase32Secret(secret);
  const counter = counterForTimestamp(normalizedOptions.timestamp, normalizedOptions.period);
  let matched = 0;
  for (let offset = -normalizedOptions.window; offset <= normalizedOptions.window; offset += 1) {
    const candidateCounter = counter + BigInt(offset);
    if (candidateCounter < 0n || candidateCounter > MAX_COUNTER) continue;
    const expected = calculateHotpFromDecodedSecret(decodedSecret, candidateCounter, normalizedOptions.algorithm, normalizedOptions.digits);
    matched |= timingSafeCodeEquals(expected, candidate) ? 1 : 0;
  }
  return matched === 1;
}

module.exports = Object.freeze({
  ALGORITHMS: Object.freeze([...Object.keys(ALGORITHMS)]),
  DEFAULT_ALGORITHM,
  DEFAULT_DIGITS,
  DEFAULT_PERIOD_SECONDS,
  LIMITS,
  calculateHotp,
  calculateNextTotp,
  calculateTotp,
  decodeBase32Secret,
  isValidBase32Secret,
  normalizeAlgorithm,
  normalizeBase32Secret,
  normalizeCounter,
  normalizeDigits,
  normalizePeriod,
  normalizeTimestamp,
  timeRemaining,
  timingSafeCodeEquals,
  totpSnapshot,
  validateTotp
});
