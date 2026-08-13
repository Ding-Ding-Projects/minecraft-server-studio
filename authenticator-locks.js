/*
 * Browser-local authenticator and toy-lock surface.
 *
 * This module deliberately has no network, logging, telemetry, export, or
 * history integration for credential-shaped values. It stores its bounded
 * state in one origin-scoped localStorage record because a static site has no
 * operating-system credential vault. That is a local convenience boundary,
 * not a security boundary.
 */

const STORAGE_KEY = "minecraft-server-studio.site.authenticator-locks.v1";
const STATE_VERSION = 1;
const ENTRY_LIMIT = 100;
const LOCK_LIMIT = 100;
const TICKET_LIMIT = 50;
const QR_VERSION = 10;
const QR_SIZE = QR_VERSION * 4 + 17;
const QR_MAX_UTF8_BYTES = 271;
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const ALGORITHMS = new Set(["SHA-1", "SHA-256", "SHA-512"]);
const DIGITS = new Set([6, 7, 8]);
const PERIODS = new Set([15, 30, 45, 60, 90]);
const TARGETS = Object.freeze([
  { id: "authenticator-tab", type: "tab", label: "Authenticator tab" },
  { id: "authenticator-entry-list", type: "element", label: "Authenticator entry list" },
  { id: "authenticator-pairing", type: "element", label: "Authenticator pairing reveal" }
]);

let activeApp = null;

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value, limit, fallback = "") {
  if (typeof value !== "string") return fallback;
  const normalized = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return normalized.length <= limit ? normalized : fallback;
}

function id(value, prefix) {
  const candidate = text(value, 96, "");
  if (/^[a-z0-9][a-z0-9_-]{2,95}$/i.test(candidate)) return candidate;
  const bytes = new Uint8Array(10);
  if (globalThis.crypto && typeof globalThis.crypto.getRandomValues === "function") globalThis.crypto.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  return `${prefix}-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function isoNow() {
  return new Date().toISOString();
}

function defaultState() {
  return { version: STATE_VERSION, entries: [], locks: [], tickets: [] };
}

function normalizeBase32(value) {
  if (typeof value !== "string") throw new Error("Enter a Base32 secret.");
  const source = value.toUpperCase().replace(/[\s-]/g, "");
  const match = /^([A-Z2-7]+)(=*)$/.exec(source);
  if (!match || match[1].length < 8 || match[1].length > 128) throw new Error("Enter a bounded Base32 secret using A–Z and 2–7.");
  const body = match[1];
  const remainder = body.length % 8;
  if (remainder === 1 || remainder === 3 || remainder === 6) throw new Error("The Base32 secret is incomplete.");
  const expectedPadding = ({ 0: 0, 2: 6, 4: 4, 5: 3, 7: 1 })[remainder];
  if (match[2].length && match[2].length !== expectedPadding) throw new Error("The Base32 padding is not valid.");
  const finalValue = BASE32.indexOf(body[body.length - 1]);
  const unusedBits = ({ 0: 0, 2: 2, 4: 4, 5: 1, 7: 3 })[remainder];
  if (unusedBits && (finalValue & ((1 << unusedBits) - 1))) throw new Error("The Base32 secret has invalid trailing bits.");
  return body + (expectedPadding ? "=".repeat(expectedPadding) : "");
}

function decodeBase32(value) {
  const normalized = normalizeBase32(value);
  const source = normalized.replace(/=+$/, "");
  const result = [];
  let accumulator = 0;
  let bits = 0;
  for (const character of source) {
    accumulator = (accumulator << 5) | BASE32.indexOf(character);
    bits += 5;
    while (bits >= 8) {
      bits -= 8;
      result.push((accumulator >>> bits) & 0xff);
    }
  }
  if (!result.length) throw new Error("The Base32 secret did not decode to bytes.");
  return new Uint8Array(result);
}

function bytesToBase64(bytes) {
  let output = "";
  for (const byte of bytes) output += String.fromCharCode(byte);
  return btoa(output);
}

function base64ToBytes(value, maxBytes) {
  if (typeof value !== "string" || value.length > maxBytes * 3) return null;
  try {
    const decoded = atob(value);
    if (!decoded.length || decoded.length > maxBytes) return null;
    return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
  } catch (_) {
    return null;
  }
}

function normalizeAlgorithm(value) {
  const upper = String(value || "SHA-1").toUpperCase().replace(/^SHA(\d+)/, "SHA-$1");
  if (!ALGORITHMS.has(upper)) throw new Error("Choose SHA-1, SHA-256, or SHA-512.");
  return upper;
}

function normalizeDigits(value) {
  const parsed = Number(value);
  if (!DIGITS.has(parsed)) throw new Error("Choose six, seven, or eight digits.");
  return parsed;
}

function normalizePeriod(value) {
  const parsed = Number(value);
  if (!PERIODS.has(parsed)) throw new Error("Choose a supported code period.");
  return parsed;
}

function sanitizeEntry(raw) {
  if (!isRecord(raw)) return null;
  try {
    const issuer = text(raw.issuer, 48, "");
    const account = text(raw.account, 64, "");
    const label = text(raw.label, 116, "") || [issuer, account].filter(Boolean).join(" · ");
    if (!issuer || !account || !label) return null;
    return {
      id: id(raw.id, "entry"),
      issuer,
      account,
      label,
      secret: normalizeBase32(raw.secret),
      algorithm: normalizeAlgorithm(raw.algorithm),
      digits: normalizeDigits(raw.digits),
      period: normalizePeriod(raw.period),
      enrolled: raw.enrolled === true,
      createdAt: text(raw.createdAt, 40, isoNow()),
      updatedAt: text(raw.updatedAt, 40, isoNow())
    };
  } catch (_) {
    return null;
  }
}

function sanitizeLock(raw) {
  if (!isRecord(raw)) return null;
  const target = TARGETS.find((candidate) => candidate.id === raw.target);
  if (!target || (raw.method !== "password" && raw.method !== "totp")) return null;
  const duration = Number(raw.durationMinutes);
  if (!Number.isInteger(duration) || duration < 0 || duration > 1440) return null;
  let credential = null;
  if (raw.method === "password" && isRecord(raw.credential)) {
    const salt = base64ToBytes(raw.credential.salt, 32);
    const verifier = base64ToBytes(raw.credential.verifier, 64);
    if (!salt || salt.length !== 16 || !verifier || verifier.length !== 32) return null;
    credential = { salt: raw.credential.salt, verifier: raw.credential.verifier };
  }
  if (raw.method === "totp" && isRecord(raw.credential)) {
    try { credential = { secret: normalizeBase32(raw.credential.secret) }; } catch (_) { return null; }
  }
  if (!credential) return null;
  return {
    id: id(raw.id, "lock"),
    target: target.id,
    targetType: target.type,
    label: target.label,
    method: raw.method,
    durationMinutes: duration,
    credential,
    createdAt: text(raw.createdAt, 40, isoNow()),
    updatedAt: text(raw.updatedAt, 40, isoNow())
  };
}

function sanitizeTicket(raw) {
  if (!isRecord(raw)) return null;
  const category = text(raw.category, 72, "");
  const number = text(raw.number, 32, "");
  if (!category || !number) return null;
  return {
    id: id(raw.id, "ticket"),
    number,
    category,
    status: "Local recovery instructions ready",
    createdAt: text(raw.createdAt, 40, isoNow())
  };
}

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return defaultState();
    if (saved.length > 196608) return defaultState();
    const raw = JSON.parse(saved);
    if (!isRecord(raw) || raw.version !== STATE_VERSION) return defaultState();
    const entries = [];
    const entryIds = new Set();
    for (const value of Array.isArray(raw.entries) ? raw.entries : []) {
      const entry = sanitizeEntry(value);
      if (entry && !entryIds.has(entry.id) && entries.length < ENTRY_LIMIT) {
        entries.push(entry);
        entryIds.add(entry.id);
      }
    }
    const locks = [];
    const lockIds = new Set();
    const targets = new Set();
    for (const value of Array.isArray(raw.locks) ? raw.locks : []) {
      const lock = sanitizeLock(value);
      if (lock && !lockIds.has(lock.id) && !targets.has(lock.target) && locks.length < LOCK_LIMIT) {
        locks.push(lock);
        lockIds.add(lock.id);
        targets.add(lock.target);
      }
    }
    const tickets = [];
    const ticketIds = new Set();
    for (const value of Array.isArray(raw.tickets) ? raw.tickets : []) {
      const ticket = sanitizeTicket(value);
      if (ticket && !ticketIds.has(ticket.id) && tickets.length < TICKET_LIMIT) {
        tickets.push(ticket);
        ticketIds.add(ticket.id);
      }
    }
    return { version: STATE_VERSION, entries, locks, tickets };
  } catch (_) {
    return defaultState();
  }
}

function saveState(state) {
  try {
    const encoded = JSON.stringify(state);
    if (encoded.length > 196608) throw new Error("The browser-local record reached its bounded limit.");
    localStorage.setItem(STORAGE_KEY, encoded);
    return { ok: true };
  } catch (_) {
    return { ok: false, error: "This browser could not save the local authenticator and toy-lock record." };
  }
}

function removeState() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    return true;
  } catch (_) {
    return false;
  }
}

function canonicalUri(entry) {
  const label = encodeURIComponent(`${entry.issuer}:${entry.account}`);
  const params = new URLSearchParams();
  params.set("secret", entry.secret.replace(/=+$/, ""));
  params.set("issuer", entry.issuer);
  params.set("algorithm", entry.algorithm.replace("SHA-", "SHA"));
  params.set("digits", String(entry.digits));
  params.set("period", String(entry.period));
  return `otpauth://totp/${label}?${params.toString()}`;
}

function parseOtpUri(value) {
  if (typeof value !== "string" || value.length < 16 || value.length > 2048) throw new Error("Enter a bounded standard otpauth URI.");
  let url;
  try { url = new URL(value); } catch (_) { throw new Error("The authenticator URI is not valid."); }
  if (url.protocol !== "otpauth:" || url.hostname.toLowerCase() !== "totp" || url.username || url.password || url.port || url.hash) {
    throw new Error("Only standard otpauth://totp/ URIs are accepted.");
  }
  const permitted = new Set(["secret", "issuer", "algorithm", "digits", "period"]);
  const seen = new Set();
  for (const key of url.searchParams.keys()) {
    if (!permitted.has(key) || seen.has(key)) throw new Error("The authenticator URI contains an unsupported or repeated field.");
    seen.add(key);
  }
  let decodedLabel;
  try { decodedLabel = decodeURIComponent(url.pathname.replace(/^\/+/, "")); } catch (_) { throw new Error("The authenticator URI label is not valid."); }
  const labelParts = decodedLabel.split(":");
  const labelIssuer = labelParts.length > 1 ? labelParts.shift() : "";
  const labelAccount = labelParts.join(":");
  const issuer = text(url.searchParams.get("issuer") || labelIssuer, 48, "");
  const account = text(labelAccount || decodedLabel, 64, "");
  if (!issuer || !account) throw new Error("The authenticator URI needs both an issuer and an account label.");
  if (labelIssuer && url.searchParams.get("issuer") && text(labelIssuer, 48, "") !== issuer) throw new Error("The authenticator URI issuer does not match its label.");
  return {
    issuer,
    account,
    label: `${issuer} · ${account}`,
    secret: normalizeBase32(url.searchParams.get("secret") || ""),
    algorithm: normalizeAlgorithm(url.searchParams.get("algorithm") || "SHA-1"),
    digits: normalizeDigits(url.searchParams.get("digits") || 6),
    period: normalizePeriod(url.searchParams.get("period") || 30)
  };
}

async function hmac(secret, algorithm, counter) {
  if (!globalThis.crypto || !globalThis.crypto.subtle) throw new Error("This browser does not provide the local cryptography needed for TOTP.");
  const decoded = decodeBase32(secret);
  const key = await globalThis.crypto.subtle.importKey("raw", decoded, { name: "HMAC", hash: { name: algorithm } }, false, ["sign"]);
  const bytes = new Uint8Array(8);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, Math.floor(counter / 0x100000000));
  view.setUint32(4, counter >>> 0);
  return new Uint8Array(await globalThis.crypto.subtle.sign("HMAC", key, bytes));
}

async function hotp(secret, algorithm, digits, counter) {
  const digest = await hmac(secret, algorithm, counter);
  const offset = digest[digest.length - 1] & 0x0f;
  const value = ((digest[offset] & 0x7f) << 24) | (digest[offset + 1] << 16) | (digest[offset + 2] << 8) | digest[offset + 3];
  return String(value % (10 ** digits)).padStart(digits, "0");
}

async function snapshot(entry, timestamp = Date.now()) {
  const unixSeconds = Math.floor(timestamp / 1000);
  const counter = Math.floor(unixSeconds / entry.period);
  const elapsed = unixSeconds % entry.period;
  return {
    current: await hotp(entry.secret, entry.algorithm, entry.digits, counter),
    next: await hotp(entry.secret, entry.algorithm, entry.digits, counter + 1),
    remaining: elapsed === 0 ? entry.period : entry.period - elapsed
  };
}

async function derivePasswordVerifier(password, salt) {
  if (!globalThis.crypto || !globalThis.crypto.subtle) throw new Error("This browser does not provide the local cryptography needed for a toy lock.");
  const key = await globalThis.crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const derived = await globalThis.crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 150000, hash: "SHA-256" }, key, 256);
  return new Uint8Array(derived);
}

function sameBytes(left, right) {
  if (!left || !right || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

async function createPasswordCredential(password) {
  if (typeof password !== "string" || password.length < 8 || password.length > 128) throw new Error("Enter a toy-lock password from 8 to 128 characters.");
  if (!globalThis.crypto || typeof globalThis.crypto.getRandomValues !== "function") throw new Error("This browser cannot create a local toy-lock salt.");
  const salt = new Uint8Array(16);
  globalThis.crypto.getRandomValues(salt);
  const verifier = await derivePasswordVerifier(password, salt);
  return { salt: bytesToBase64(salt), verifier: bytesToBase64(verifier) };
}

async function verifyPasswordCredential(credential, candidate) {
  const salt = base64ToBytes(credential && credential.salt, 32);
  const verifier = base64ToBytes(credential && credential.verifier, 64);
  if (!salt || !verifier || typeof candidate !== "string") return false;
  const actual = await derivePasswordVerifier(candidate, salt);
  return sameBytes(actual, verifier);
}

function makeGaloisTables() {
  const exponent = new Uint8Array(512);
  const logarithm = new Uint8Array(256);
  let value = 1;
  for (let index = 0; index < 255; index += 1) {
    exponent[index] = value;
    logarithm[value] = index;
    value <<= 1;
    if (value & 0x100) value ^= 0x11d;
  }
  for (let index = 255; index < exponent.length; index += 1) exponent[index] = exponent[index - 255];
  return { exponent, logarithm };
}

const GF = makeGaloisTables();

function gfMultiply(left, right) {
  if (left === 0 || right === 0) return 0;
  return GF.exponent[GF.logarithm[left] + GF.logarithm[right]];
}

function polynomialMultiply(left, right) {
  const result = new Uint8Array(left.length + right.length - 1);
  for (let a = 0; a < left.length; a += 1) {
    for (let b = 0; b < right.length; b += 1) result[a + b] ^= gfMultiply(left[a], right[b]);
  }
  return result;
}

function errorCorrection(data, degree) {
  let generator = new Uint8Array([1]);
  for (let index = 0; index < degree; index += 1) generator = polynomialMultiply(generator, new Uint8Array([1, GF.exponent[index]]));
  const remainder = new Uint8Array(degree);
  for (const byte of data) {
    const factor = byte ^ remainder[0];
    remainder.copyWithin(0, 1);
    remainder[degree - 1] = 0;
    for (let index = 0; index < degree; index += 1) remainder[index] ^= gfMultiply(generator[index + 1], factor);
  }
  return remainder;
}

function qrCodewords(payload) {
  const bytes = new TextEncoder().encode(payload);
  if (bytes.length > QR_MAX_UTF8_BYTES) throw new Error("This pairing URI is too long for the bundled local QR encoder. Use the manual secret instead.");
  const bits = [];
  const append = (value, count) => {
    for (let offset = count - 1; offset >= 0; offset -= 1) bits.push((value >>> offset) & 1);
  };
  append(0b0100, 4);
  // Version 10 is the first QR version whose byte-mode character-count field
  // is 16 bits. Keeping that width is essential: an 8-bit field makes a
  // scanner consume the first payload byte as count data and decode nonsense.
  append(bytes.length, 16);
  for (const byte of bytes) append(byte, 8);
  const capacity = 274 * 8;
  for (let index = 0; index < Math.min(4, capacity - bits.length); index += 1) bits.push(0);
  while (bits.length % 8) bits.push(0);
  const data = [];
  for (let offset = 0; offset < bits.length; offset += 8) data.push(bits.slice(offset, offset + 8).reduce((value, bit) => (value << 1) | bit, 0));
  let pad = 0;
  while (data.length < 274) {
    data.push(pad % 2 === 0 ? 0xec : 0x11);
    pad += 1;
  }
  const blocks = [68, 68, 69, 69].map((size, index) => new Uint8Array(data.slice(index < 2 ? index * 68 : 136 + (index - 2) * 69, index < 2 ? (index + 1) * 68 : 136 + (index - 1) * 69)));
  const corrections = blocks.map((block) => errorCorrection(block, 18));
  const output = [];
  const largestData = Math.max(...blocks.map((block) => block.length));
  for (let offset = 0; offset < largestData; offset += 1) for (const block of blocks) if (offset < block.length) output.push(block[offset]);
  for (let offset = 0; offset < 18; offset += 1) for (const correction of corrections) output.push(correction[offset]);
  return output;
}

function createMatrix() {
  return Array.from({ length: QR_SIZE }, () => Array(QR_SIZE).fill(null));
}

function placeFinder(matrix, row, column) {
  for (let y = -1; y <= 7; y += 1) {
    for (let x = -1; x <= 7; x += 1) {
      const targetRow = row + y;
      const targetColumn = column + x;
      if (targetRow < 0 || targetRow >= QR_SIZE || targetColumn < 0 || targetColumn >= QR_SIZE) continue;
      matrix[targetRow][targetColumn] = y >= 0 && y <= 6 && x >= 0 && x <= 6 && (y === 0 || y === 6 || x === 0 || x === 6 || (y >= 2 && y <= 4 && x >= 2 && x <= 4));
    }
  }
}

function placeAlignment(matrix) {
  const positions = [6, 28, 50];
  for (const row of positions) {
    for (const column of positions) {
      if (matrix[row][column] !== null) continue;
      for (let y = -2; y <= 2; y += 1) {
        for (let x = -2; x <= 2; x += 1) matrix[row + y][column + x] = Math.abs(x) === 2 || Math.abs(y) === 2 || (x === 0 && y === 0);
      }
    }
  }
}

function bchDigit(value) {
  let count = 0;
  while (value !== 0) { count += 1; value >>>= 1; }
  return count;
}

function bchTypeInfo(value) {
  let result = value << 10;
  while (bchDigit(result) - bchDigit(0x537) >= 0) result ^= 0x537 << (bchDigit(result) - bchDigit(0x537));
  return ((value << 10) | result) ^ 0x5412;
}

function bchTypeNumber(value) {
  let result = value << 12;
  while (bchDigit(result) - bchDigit(0x1f25) >= 0) result ^= 0x1f25 << (bchDigit(result) - bchDigit(0x1f25));
  return (value << 12) | result;
}

function placeFormatAndVersion(matrix, mask) {
  const format = bchTypeInfo((1 << 3) | mask);
  for (let index = 0; index < 15; index += 1) {
    const dark = ((format >>> index) & 1) === 1;
    if (index < 6) matrix[index][8] = dark;
    else if (index < 8) matrix[index + 1][8] = dark;
    else matrix[QR_SIZE - 15 + index][8] = dark;
    if (index < 8) matrix[8][QR_SIZE - index - 1] = dark;
    else if (index < 9) matrix[8][15 - index] = dark;
    else matrix[8][15 - index - 1] = dark;
  }
  matrix[QR_SIZE - 8][8] = true;
  const version = bchTypeNumber(QR_VERSION);
  for (let index = 0; index < 18; index += 1) {
    const dark = ((version >>> index) & 1) === 1;
    matrix[Math.floor(index / 3)][(index % 3) + QR_SIZE - 11] = dark;
    matrix[(index % 3) + QR_SIZE - 11][Math.floor(index / 3)] = dark;
  }
}

function maskApplies(mask, row, column) {
  if (mask === 0) return (row + column) % 2 === 0;
  if (mask === 1) return row % 2 === 0;
  if (mask === 2) return column % 3 === 0;
  if (mask === 3) return (row + column) % 3 === 0;
  if (mask === 4) return (Math.floor(row / 2) + Math.floor(column / 3)) % 2 === 0;
  if (mask === 5) return ((row * column) % 2) + ((row * column) % 3) === 0;
  if (mask === 6) return (((row * column) % 2) + ((row * column) % 3)) % 2 === 0;
  return (((row * column) % 3) + ((row + column) % 2)) % 2 === 0;
}

function placeData(matrix, codewords, mask) {
  let row = QR_SIZE - 1;
  let direction = -1;
  let byte = 0;
  let bit = 7;
  for (let column = QR_SIZE - 1; column > 0; column -= 2) {
    if (column === 6) column -= 1;
    while (true) {
      for (let offset = 0; offset < 2; offset += 1) {
        const target = column - offset;
        if (matrix[row][target] !== null) continue;
        let dark = byte < codewords.length && ((codewords[byte] >>> bit) & 1) === 1;
        if (maskApplies(mask, row, target)) dark = !dark;
        matrix[row][target] = dark;
        bit -= 1;
        if (bit < 0) { byte += 1; bit = 7; }
      }
      row += direction;
      if (row < 0 || row >= QR_SIZE) { row -= direction; direction = -direction; break; }
    }
  }
}

function lostPoints(matrix) {
  let score = 0;
  for (let row = 0; row < QR_SIZE; row += 1) {
    let run = 1;
    for (let column = 1; column < QR_SIZE; column += 1) {
      if (matrix[row][column] === matrix[row][column - 1]) run += 1;
      else { if (run >= 5) score += 3 + run - 5; run = 1; }
    }
    if (run >= 5) score += 3 + run - 5;
  }
  for (let column = 0; column < QR_SIZE; column += 1) {
    let run = 1;
    for (let row = 1; row < QR_SIZE; row += 1) {
      if (matrix[row][column] === matrix[row - 1][column]) run += 1;
      else { if (run >= 5) score += 3 + run - 5; run = 1; }
    }
    if (run >= 5) score += 3 + run - 5;
  }
  let dark = 0;
  for (let row = 0; row < QR_SIZE; row += 1) {
    for (let column = 0; column < QR_SIZE; column += 1) {
      if (matrix[row][column]) dark += 1;
      if (row + 1 < QR_SIZE && column + 1 < QR_SIZE && matrix[row][column] === matrix[row + 1][column] && matrix[row][column] === matrix[row][column + 1] && matrix[row][column] === matrix[row + 1][column + 1]) score += 3;
    }
  }
  score += Math.floor(Math.abs((dark * 100 / (QR_SIZE * QR_SIZE)) - 50) / 5) * 10;
  return score;
}

function qrMatrix(payload) {
  const codewords = qrCodewords(payload);
  const base = createMatrix();
  placeFinder(base, 0, 0);
  placeFinder(base, QR_SIZE - 7, 0);
  placeFinder(base, 0, QR_SIZE - 7);
  for (let index = 8; index < QR_SIZE - 8; index += 1) {
    if (base[index][6] === null) base[index][6] = index % 2 === 0;
    if (base[6][index] === null) base[6][index] = index % 2 === 0;
  }
  placeAlignment(base);
  let winner = null;
  let score = Number.POSITIVE_INFINITY;
  for (let mask = 0; mask < 8; mask += 1) {
    const candidate = base.map((row) => row.slice());
    placeFormatAndVersion(candidate, mask);
    placeData(candidate, codewords, mask);
    const candidateScore = lostPoints(candidate);
    if (candidateScore < score) { winner = candidate; score = candidateScore; }
  }
  return winner;
}

function drawQr(canvas, payload) {
  const matrix = qrMatrix(payload);
  const module = 5;
  const quiet = 4;
  const size = (matrix.length + quiet * 2) * module;
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d", { alpha: false });
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, size, size);
  context.fillStyle = "#000000";
  matrix.forEach((row, rowIndex) => row.forEach((dark, columnIndex) => {
    if (dark) context.fillRect((columnIndex + quiet) * module, (rowIndex + quiet) * module, module, module);
  }));
}

function create(tag, attributes = {}, children = []) {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (name === "class") element.className = value;
    else if (name === "text") element.textContent = value;
    else if (name === "htmlFor") element.htmlFor = value;
    else if (name === "checked") element.checked = Boolean(value);
    else if (name === "hidden") element.hidden = Boolean(value);
    else element.setAttribute(name, value);
  }
  for (const child of children) element.append(child);
  return element;
}

function button(label, handler, attributes = {}) {
  const control = create("button", Object.assign({ type: "button", text: label }, attributes));
  control.addEventListener("click", handler);
  return control;
}

function field(label, input, hint) {
  const wrapper = create("label", { class: "auth-field" });
  wrapper.append(create("span", { text: label }), input);
  if (hint) wrapper.append(create("small", { text: hint }));
  return wrapper;
}

function select(values, initial) {
  const control = create("select");
  for (const value of values) {
    const option = create("option", { value: value.value, text: value.label });
    option.selected = String(value.value) === String(initial);
    control.append(option);
  }
  return control;
}

function groupedCode(value) {
  const groups = String(value || "").match(/.{1,3}/g);
  return groups ? groups.join(" ") : "—";
}

export function initializeAuthenticatorAndToyLocks(options = {}) {
  const surface = options.surface || document.querySelector('[data-contract-surface="authenticator"]');
  const host = surface && surface.querySelector("[data-authenticator-local-app]");
  if (!surface || !host) return null;
  if (activeApp && activeApp.host === host) return activeApp.api;

  const app = {
    host,
    surface,
    state: loadState(),
    unlocked: new Map(),
    pairing: null,
    codeTimer: null,
    options,
    status: null,
    entriesHost: null,
    locksHost: null,
    ticketsHost: null,
    pairingHost: null,
    supportDesk: null,
    tabGate: null,
    entryGate: null,
    workspaceCore: null,
    entriesProtected: null
  };
  activeApp = app;

  const message = (kind, value) => {
    if (app.status) app.status.textContent = value;
    if (typeof app.options.notify === "function") app.options.notify(kind, value);
  };
  const record = (action, detail) => {
    if (typeof app.options.addHistory === "function") app.options.addHistory(action, detail);
    const contract = app.options.contract || window.MinecraftServerStudioContract;
    if (contract && typeof contract.recordAudit === "function") {
      try { contract.recordAudit(action, "browser-local-authenticator", detail); } catch (_) { /* contract is optional */ }
    }
  };
  const persist = () => {
    const outcome = saveState(app.state);
    if (!outcome.ok) message("warning", outcome.error);
    return outcome.ok;
  };
  const lockFor = (target) => app.state.locks.find((lock) => lock.target === target) || null;
  const isUnlocked = (lock) => {
    const until = app.unlocked.get(lock.id);
    return until === Number.POSITIVE_INFINITY || (Number.isFinite(until) && until > Date.now());
  };
  const guard = (target) => {
    const lock = lockFor(target);
    if (!lock || isUnlocked(lock)) return true;
    message("warning", `${lock.label} is behind its local toy lock. Unlock that record before continuing.`);
    renderLocks();
    return false;
  };
  const clearPairing = () => {
    const active = app.pairing || {};
    if (active.timer) window.clearTimeout(active.timer);
    const pairingHost = active.host || app.pairingHost;
    const canvas = active.canvas || (pairingHost && pairingHost.querySelector("canvas"));
    const secret = active.secret || (pairingHost && pairingHost.querySelector("[data-auth-manual-secret]"));
    const parameters = active.parameters || (pairingHost && pairingHost.querySelector("[data-auth-pairing-parameters]"));
    if (canvas) { canvas.width = 1; canvas.height = 1; }
    if (secret) secret.textContent = "";
    if (parameters) parameters.textContent = "";
    if (pairingHost) pairingHost.hidden = true;
    app.pairing = null;
  };
  const clearAllLocalData = () => {
    if (!removeState()) {
      message("warning", "This browser could not remove the local authenticator and toy-lock record.");
      return;
    }
    clearPairing();
    app.state = defaultState();
    app.unlocked.clear();
    renderEntries();
    renderLocks();
    renderTickets();
    renderLockGates();
    message("info", "The browser-local authenticator, toy-lock, and local support-ticket record was removed from this origin.");
  };
  const openSupportTickets = () => {
    if (!app.supportDesk) return;
    app.supportDesk.scrollIntoView({ behavior: "smooth", block: "start" });
    app.supportDesk.setAttribute("tabindex", "-1");
    app.supportDesk.focus({ preventScroll: true });
  };

  async function credentialMatches(lock, candidate) {
    if (lock.method === "password") return verifyPasswordCredential(lock.credential, candidate);
    const normalized = String(candidate || "").replace(/\s+/g, "");
    if (!/^\d{6}$/.test(normalized)) return false;
    const counter = Math.floor(Date.now() / 1000 / 30);
    for (const offset of [-1, 0, 1]) {
      const current = await hotp(lock.credential.secret, "SHA-1", 6, counter + offset);
      if (current === normalized) return true;
    }
    return false;
  }

  function unlockPanel(lock, compact = false) {
    const form = create("form", { class: compact ? "auth-unlock-form auth-unlock-form--gate" : "auth-unlock-form" });
    const credential = create("input", {
      type: lock.method === "totp" ? "text" : "password",
      maxlength: lock.method === "totp" ? "8" : "128",
      autocomplete: lock.method === "totp" ? "one-time-code" : "current-password",
      inputmode: lock.method === "totp" ? "numeric" : "text"
    });
    const status = create("output", { "aria-live": "polite", text: "Verify this lock locally or use the local recovery route." });
    form.append(
      field(lock.method === "totp" ? "Current TOTP code" : "Toy-lock password", credential),
      create("button", { type: "submit", text: "Verify locally" }),
      button("Forgotten your credential? Open Support Tickets", openSupportTickets),
      status
    );
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        const accepted = await credentialMatches(lock, credential.value);
        credential.value = "";
        if (!accepted) {
          status.textContent = "The local credential did not match. Browser storage can be cleared as the recovery route.";
          return;
        }
        app.unlocked.set(lock.id, lock.durationMinutes ? Date.now() + lock.durationMinutes * 60000 : Number.POSITIVE_INFINITY);
        status.textContent = "Unlocked locally.";
        renderLocks();
        renderLockGates();
        message("success", "The selected toy lock was unlocked locally.");
      } catch (_) {
        credential.value = "";
        status.textContent = "The local credential could not be verified.";
      }
    });
    return form;
  }

  function renderLockGates() {
    const tabLock = lockFor("authenticator-tab");
    const tabLocked = Boolean(tabLock && !isUnlocked(tabLock));
    if (app.workspaceCore) app.workspaceCore.hidden = tabLocked;
    if (app.tabGate) {
      app.tabGate.hidden = !tabLocked;
      app.tabGate.replaceChildren();
      if (tabLocked) {
        app.tabGate.append(
          create("h3", { text: "Authenticator tab locked" }),
          create("p", { text: "This browser-local tab is behind its own toy lock. The lock is a self-imposed speed bump, not security protection." }),
          unlockPanel(tabLock, true)
        );
      }
    }
    const entryLock = lockFor("authenticator-entry-list");
    const entriesLocked = Boolean(entryLock && !isUnlocked(entryLock));
    if (app.entriesProtected) app.entriesProtected.hidden = entriesLocked;
    if (app.entryGate) {
      app.entryGate.hidden = !entriesLocked;
      app.entryGate.replaceChildren();
      if (entriesLocked) {
        app.entryGate.append(
          create("h4", { text: "Authenticator entry list locked" }),
          create("p", { text: "The local code list and pairing controls are hidden until this target's independent toy lock is verified." }),
          unlockPanel(entryLock, true)
        );
      }
    }
  }

  function addConfirmation(hostElement, affected, execute) {
    const confirmation = create("section", { class: "auth-destructive-confirmation" });
    const keyOne = create("input", { type: "checkbox" });
    const keyTwo = create("input", { type: "checkbox" });
    const slider = create("input", { type: "range", min: "0", max: "100", value: "0", disabled: "disabled" });
    const confirm = create("button", { type: "button", text: "Confirm removal", disabled: "disabled" });
    const status = create("output", { "aria-live": "polite", text: "Use both confirmation keys, then move the slider to 100." });
    const refresh = () => {
      slider.disabled = !(keyOne.checked && keyTwo.checked);
      if (slider.disabled) slider.value = "0";
      confirm.disabled = slider.value !== "100";
      status.textContent = confirm.disabled ? "Use both confirmation keys, then move the slider to 100." : "Removal is ready to confirm.";
    };
    keyOne.addEventListener("change", refresh);
    keyTwo.addEventListener("change", refresh);
    slider.addEventListener("input", refresh);
    confirm.addEventListener("click", () => { execute(); confirmation.remove(); });
    confirmation.append(
      create("strong", { text: `Remove ${affected}` }),
      create("p", { text: "This deletes browser-local data for this site only. It cannot be undone from this page." }),
      field("First confirmation key", keyOne, "Confirm that this is the intended local record."),
      field("Second confirmation key", keyTwo, "Confirm that the affected browser-local data will be removed."),
      field("Full-range confirmation slider", slider, "Move to 100 after both confirmation keys are selected."),
      confirm,
      button("Emergency exit", () => confirmation.remove()),
      status
    );
    hostElement.append(confirmation);
  }

  function entrySearchControls() {
    const controls = create("div", { class: "auth-search-controls" });
    const search = create("input", { type: "search", placeholder: "Search issuer or account", "aria-label": "Search authenticator entries", "data-mss-regex-ready": "true" });
    const regexButton = button("Regex builder", () => {
      builder.hidden = !builder.hidden;
      regexButton.setAttribute("aria-expanded", String(!builder.hidden));
      if (!builder.hidden) pattern.focus();
    }, { "aria-expanded": "false" });
    const regex = create("input", { type: "checkbox" });
    const pattern = create("input", { type: "text", maxlength: "256", placeholder: "Pattern", disabled: "disabled" });
    const flags = create("input", { type: "text", maxlength: "8", value: "i", placeholder: "Flags", disabled: "disabled" });
    const regexStatus = create("output", { "aria-live": "polite" });
    const builder = create("section", { class: "auth-regex-builder", hidden: true }, [
      field("Use regular expression mode", regex, "Plain text remains the default."),
      field("Pattern", pattern, "This local search bounds patterns to 256 characters."),
      field("Flags", flags, "Supported flags: i, m, s, u."),
      regexStatus
    ]);
    const validMatcher = () => {
      if (!regex.checked) return { mode: "text", value: search.value.trim().toLocaleLowerCase() };
      const suppliedFlags = flags.value || "";
      if (!/^[imsu]*$/.test(suppliedFlags) || new Set(suppliedFlags).size !== suppliedFlags.length) return { error: "Use each supported regular-expression flag no more than once." };
      if (pattern.value.length > 256) return { error: "Patterns are limited to 256 characters." };
      try { return { mode: "regex", value: new RegExp(pattern.value, suppliedFlags) }; } catch (error) { return { error: error.message || "The regular expression is invalid." }; }
    };
    const refresh = () => {
      const matcher = validMatcher();
      regexStatus.textContent = matcher.error || "";
      renderEntries(matcher);
    };
    regex.addEventListener("change", () => { pattern.disabled = !regex.checked; flags.disabled = !regex.checked; refresh(); });
    [search, pattern, flags].forEach((control) => control.addEventListener("input", refresh));
    controls.append(field("Find an entry", search), regexButton, builder);
    return { controls, matcher: validMatcher };
  }

  function renderEntries(matcher) {
    if (!app.entriesHost) return;
    clearPairing();
    const list = app.entriesHost.querySelector("[data-auth-entry-list]") || create("div", { "data-auth-entry-list": "true", class: "auth-entry-list" });
    list.replaceChildren();
    const activeMatcher = matcher || { mode: "text", value: "" };
    if (activeMatcher.error) {
      list.append(create("p", { class: "auth-empty-state", text: activeMatcher.error }));
    } else {
      const visible = app.state.entries.filter((entry) => {
        const searchText = `${entry.issuer} ${entry.account} ${entry.label} ${entry.algorithm} ${entry.digits} ${entry.period}`;
        if (activeMatcher.mode === "regex") { activeMatcher.value.lastIndex = 0; return activeMatcher.value.test(searchText); }
        return !activeMatcher.value || searchText.toLocaleLowerCase().includes(activeMatcher.value);
      });
      if (!visible.length) list.append(create("p", { class: "auth-empty-state", text: app.state.entries.length ? "No authenticator entries match the current local search." : "No browser-local authenticator entries have been added." }));
      visible.forEach((entry) => {
        const row = create("article", { class: "auth-entry", "data-auth-entry": entry.id });
        const details = create("div", { class: "auth-entry-details" }, [
          create("strong", { text: entry.label }),
          create("span", { text: `${entry.algorithm} · ${entry.digits} digits · ${entry.period} seconds · ${entry.enrolled ? "pairing confirmed" : "pairing needs confirmation"}` }),
          create("div", { class: "auth-code-grid" }, [
            create("div", {}, [create("span", { text: "Current code" }), create("output", { class: "auth-code", "data-auth-current": entry.id, text: "Calculating locally…" })]),
            create("div", {}, [create("span", { text: "Next code" }), create("output", { class: "auth-code", "data-auth-next": entry.id, text: "Calculating locally…" })]),
            create("div", {}, [create("span", { text: "Time remaining" }), create("output", { "data-auth-countdown": entry.id, text: "—" })])
          ])
        ]);
        const actions = create("div", { class: "auth-entry-actions" });
        actions.append(
          button("Copy current code", async () => {
            try {
              if (!navigator.clipboard || typeof navigator.clipboard.writeText !== "function") throw new Error("Clipboard unavailable");
              const value = (await snapshot(entry)).current;
              await navigator.clipboard.writeText(value);
              message("info", "The current authenticator code was copied locally.");
            } catch (_) {
              message("warning", "The current code could not be copied. Select the visible grouped code instead.");
            }
          }),
          button("Reveal pairing QR", () => revealPairing(entry)),
          button("Remove entry", () => {
            if (!guard("authenticator-entry-list")) return;
            addConfirmation(row, `the ${entry.label} authenticator entry`, () => {
              const previous = app.state.entries;
              app.state.entries = app.state.entries.filter((candidate) => candidate.id !== entry.id);
              if (persist()) {
                record("Authenticator entry removed", "A browser-local authenticator entry was removed without exporting its secret.");
                renderEntries();
                message("info", "The browser-local authenticator entry was removed.");
              } else app.state.entries = previous;
            });
          })
        );
        row.append(details, actions);
        list.append(row);
      });
    }
    if (!list.isConnected) app.entriesHost.append(list);
    refreshCodes();
  }

  async function refreshCodes() {
    const rows = Array.from(app.host.querySelectorAll("[data-auth-entry]"));
    await Promise.all(rows.map(async (row) => {
      const entry = app.state.entries.find((candidate) => candidate.id === row.getAttribute("data-auth-entry"));
      if (!entry) return;
      const current = row.querySelector(`[data-auth-current="${entry.id}"]`);
      const next = row.querySelector(`[data-auth-next="${entry.id}"]`);
      const countdown = row.querySelector(`[data-auth-countdown="${entry.id}"]`);
      try {
        const result = await snapshot(entry);
        if (current) current.textContent = groupedCode(result.current);
        if (next) next.textContent = groupedCode(result.next);
        if (countdown) countdown.textContent = `${result.remaining} seconds`;
      } catch (_) {
        if (current) current.textContent = "Unavailable";
        if (next) next.textContent = "Unavailable";
        if (countdown) countdown.textContent = "Local cryptography unavailable";
      }
    }));
    let expiredLock = false;
    for (const lock of app.state.locks) {
      const until = app.unlocked.get(lock.id);
      if (Number.isFinite(until) && until <= Date.now()) {
        app.unlocked.delete(lock.id);
        expiredLock = true;
      }
    }
    if (expiredLock) {
      renderLocks();
      renderLockGates();
    }
  }

  function revealPairing(entry) {
    if (!guard("authenticator-pairing")) return;
    clearPairing();
    const hostElement = app.pairingHost;
    const canvas = hostElement && hostElement.querySelector("canvas");
    const secret = hostElement && hostElement.querySelector("[data-auth-manual-secret]");
    const parameters = hostElement && hostElement.querySelector("[data-auth-pairing-parameters]");
    const status = hostElement && hostElement.querySelector("output");
    if (!hostElement || !canvas || !secret || !status) return;
    try {
      drawQr(canvas, canonicalUri(entry));
      canvas.setAttribute("aria-label", `QR code for the local ${entry.label} TOTP pairing.`);
      secret.textContent = entry.secret.replace(/=+$/, "").replace(/(.{4})/g, "$1 ").trim();
      if (parameters) parameters.textContent = `${entry.issuer} · ${entry.account} · ${entry.algorithm} · ${entry.digits} digits · ${entry.period} seconds`;
      hostElement.hidden = false;
      status.textContent = "The local QR and manual secret will clear in 60 seconds. Nothing was sent from this page.";
      const copy = hostElement.querySelector("[data-auth-copy-secret]");
      if (copy) copy.onclick = async () => {
        try {
          if (!navigator.clipboard || typeof navigator.clipboard.writeText !== "function") throw new Error("Clipboard unavailable");
          await navigator.clipboard.writeText(entry.secret.replace(/=+$/, ""));
          status.textContent = "The currently revealed manual secret was copied locally. It will still clear in 60 seconds.";
        } catch (_) {
          status.textContent = "Select the currently revealed manual secret to copy it. This page did not send it anywhere.";
        }
      };
      const confirmation = hostElement.querySelector("[data-auth-pairing-confirmation]");
      const confirm = hostElement.querySelector("[data-auth-confirm-pairing]");
      if (confirmation && confirm) {
        confirmation.value = "";
        confirm.onclick = async () => {
          const candidate = confirmation.value.replace(/\s+/g, "");
          try {
            const expected = (await snapshot(entry)).current;
            confirmation.value = "";
            if (candidate !== expected) {
              status.textContent = "That code did not match the current local code. The pairing is not marked confirmed.";
              return;
            }
            const previous = entry.enrolled;
            entry.enrolled = true;
            entry.updatedAt = isoNow();
            if (!persist()) { entry.enrolled = previous; return; }
            record("Authenticator pairing confirmed", "A browser-local TOTP pairing was confirmed without placing a code or secret in ordinary history or export data.");
            clearPairing();
            renderEntries();
            message("success", "The local TOTP pairing was confirmed.");
          } catch (_) {
            confirmation.value = "";
            status.textContent = "The local pairing confirmation could not be checked.";
          }
        };
      }
      app.pairing = { host: hostElement, canvas, secret, parameters, timer: window.setTimeout(clearPairing, 60000) };
      message("info", "A local pairing QR and manual secret are visible for 60 seconds.");
    } catch (error) {
      hostElement.hidden = false;
      secret.textContent = "";
      canvas.width = 1;
      canvas.height = 1;
      status.textContent = error && error.message ? error.message : "The local QR could not be created.";
    }
  }

  function buildEntryForm() {
    const form = create("form", { class: "auth-form" });
    const issuer = create("input", { type: "text", maxlength: "48", autocomplete: "organization" });
    const account = create("input", { type: "text", maxlength: "64", autocomplete: "username" });
    const secret = create("input", { type: "password", maxlength: "140", autocomplete: "new-password", spellcheck: "false" });
    const uri = create("input", { type: "password", maxlength: "2048", autocomplete: "off", spellcheck: "false", placeholder: "otpauth://totp/Issuer:Account?secret=…" });
    const algorithm = select(["SHA-1", "SHA-256", "SHA-512"].map((value) => ({ value, label: value })), "SHA-1");
    const digits = select([6, 7, 8].map((value) => ({ value, label: `${value} digits` })), 6);
    const period = select([15, 30, 45, 60, 90].map((value) => ({ value, label: `${value} seconds` })), 30);
    const submit = create("button", { type: "submit", text: "Save browser-local authenticator entry" });
    const status = create("output", { "aria-live": "polite", text: "Use either manual fields and a Base32 secret, or a standard otpauth URI." });
    form.append(
      field("Issuer", issuer, "Used with the account label to identify this entry."),
      field("Account", account, "This label stays in this browser-local record."),
      field("Manual Base32 secret", secret, "Use this route or the URI route, never both."),
      field("Standard authenticator URI", uri, "Only standard bounded otpauth://totp/ fields are accepted."),
      field("Algorithm", algorithm),
      field("Digits", digits),
      field("Period", period),
      submit,
      status
    );
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!guard("authenticator-tab")) return;
      if (app.state.entries.length >= ENTRY_LIMIT) { status.textContent = "The bounded browser-local authenticator limit has been reached."; return; }
      submit.disabled = true;
      try {
        const source = uri.value.trim() ? parseOtpUri(uri.value) : {
          issuer: text(issuer.value, 48, ""),
          account: text(account.value, 64, ""),
          secret: normalizeBase32(secret.value),
          algorithm: normalizeAlgorithm(algorithm.value),
          digits: normalizeDigits(digits.value),
          period: normalizePeriod(period.value)
        };
        if (!source.issuer || !source.account) throw new Error("Manual registration needs both issuer and account labels.");
        if (app.state.entries.some((existing) => existing.issuer === source.issuer && existing.account === source.account && existing.secret === source.secret && existing.algorithm === source.algorithm && existing.digits === source.digits && existing.period === source.period)) {
          throw new Error("That browser-local authenticator entry already exists.");
        }
        const entry = Object.assign(source, {
          id: id("", "entry"),
          label: `${source.issuer} · ${source.account}`,
          enrolled: false,
          createdAt: isoNow(),
          updatedAt: isoNow()
        });
        app.state.entries.unshift(entry);
        if (!persist()) { app.state.entries.shift(); return; }
        form.reset();
        algorithm.value = "SHA-1";
        digits.value = "6";
        period.value = "30";
        status.textContent = "The authenticator entry was saved only in this browser. Its secret was cleared from this form.";
        record("Authenticator entry saved", "A browser-local authenticator entry was saved without adding a secret to ordinary history or export data.");
        renderEntries();
        message("success", "A browser-local authenticator entry is ready. Its code is calculated locally.");
      } catch (error) {
        status.textContent = error && error.message ? error.message : "The authenticator entry could not be saved.";
      } finally {
        secret.value = "";
        uri.value = "";
        submit.disabled = false;
      }
    });
    return form;
  }

  function renderLocks() {
    if (!app.locksHost) return;
    const list = app.locksHost.querySelector("[data-auth-lock-list]") || create("div", { "data-auth-lock-list": "true", class: "auth-lock-list" });
    list.replaceChildren();
    if (!app.state.locks.length) list.append(create("p", { class: "auth-empty-state", text: "No browser-local toy locks are configured." }));
    app.state.locks.forEach((lock) => {
      const item = create("article", { class: "auth-lock" });
      const active = isUnlocked(lock);
      item.append(create("div", {}, [
        create("strong", { text: lock.label }),
        create("span", { text: `${lock.method === "password" ? "Password" : "TOTP"} · ${lock.durationMinutes ? `${lock.durationMinutes} minute unlock` : "until this page closes"}` }),
        create("output", { "aria-live": "polite", text: active ? "Unlocked for this browser session." : "Locked." })
      ]));
      const controls = create("div", { class: "auth-lock-actions" });
      if (active) {
        controls.append(button("Lock again", () => {
          app.unlocked.delete(lock.id);
          renderLocks();
          renderLockGates();
          message("info", "The toy lock is active again.");
        }));
      } else {
        const unlock = button("Unlock", () => {
          unlockForm.hidden = !unlockForm.hidden;
          if (!unlockForm.hidden) credential.focus();
        });
        const unlockForm = unlockPanel(lock);
        const credential = unlockForm.querySelector("input");
        unlockForm.hidden = true;
      controls.append(unlock, unlockForm);
      }
      controls.append(button("Remove lock", () => addConfirmation(item, `the ${lock.label} toy lock`, () => {
        const previous = app.state.locks;
        app.state.locks = app.state.locks.filter((candidate) => candidate.id !== lock.id);
        const previousUnlock = app.unlocked.get(lock.id);
        app.unlocked.delete(lock.id);
        if (persist()) {
          record("Toy lock removed", "A browser-local toy-lock record was removed without exporting credential material.");
          renderLocks();
          renderLockGates();
          message("info", "The browser-local toy lock was removed.");
        } else {
          app.state.locks = previous;
          if (previousUnlock !== undefined) app.unlocked.set(lock.id, previousUnlock);
        }
      })));
      item.append(controls);
      list.append(item);
    });
    if (!list.isConnected) app.locksHost.append(list);
  }

  function buildLockForm() {
    const form = create("form", { class: "auth-form" });
    const target = select(TARGETS.map((value) => ({ value: value.id, label: value.label })), TARGETS[0].id);
    const method = select([{ value: "password", label: "Password" }, { value: "totp", label: "TOTP" }], "password");
    const password = create("input", { type: "password", maxlength: "128", autocomplete: "new-password" });
    const confirmation = create("input", { type: "password", maxlength: "128", autocomplete: "new-password" });
    const totpSecret = create("input", { type: "password", maxlength: "140", autocomplete: "new-password", spellcheck: "false" });
    const passwordField = field("Toy-lock password", password, "This local toy lock is a user-experience speed bump, not security protection.");
    const confirmationField = field("Confirm toy-lock password", confirmation);
    const totpField = field("Manual Base32 TOTP secret", totpSecret, "This secret stays only in the browser-local toy-lock record and is never exported.");
    const duration = select([{ value: 0, label: "Until this page closes" }, { value: 5, label: "5 minutes" }, { value: 15, label: "15 minutes" }, { value: 60, label: "60 minutes" }], 0);
    const submit = create("button", { type: "submit", text: "Create independent toy lock" });
    const status = create("output", { "aria-live": "polite", text: "Each target receives its own credential. This is a local toy lock, not protection from someone with this browser." });
    const refreshMethod = () => {
      const isTotp = method.value === "totp";
      passwordField.hidden = isTotp;
      confirmationField.hidden = isTotp;
      totpField.hidden = !isTotp;
    };
    method.addEventListener("change", refreshMethod);
    refreshMethod();
    form.append(
      field("Target", target, "Registered tab and element targets are independently lockable."),
      field("Credential method", method),
      passwordField,
      confirmationField,
      totpField,
      field("Unlock duration", duration),
      submit,
      button("Need recovery help? Open Support Tickets", openSupportTickets),
      status
    );
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (app.state.locks.length >= LOCK_LIMIT) { status.textContent = "The bounded browser-local toy-lock limit has been reached."; return; }
      if (lockFor(target.value)) { status.textContent = "This registered target already has its own toy lock. Remove it before creating a replacement."; return; }
      submit.disabled = true;
      try {
        const methodValue = method.value;
        let credential;
        if (methodValue === "password") {
          if (password.value !== confirmation.value) throw new Error("The toy-lock passwords do not match.");
          credential = await createPasswordCredential(password.value);
        } else credential = { secret: normalizeBase32(totpSecret.value) };
        const targetValue = TARGETS.find((candidate) => candidate.id === target.value);
        app.state.locks.push({
          id: id("", "lock"),
          target: targetValue.id,
          targetType: targetValue.type,
          label: targetValue.label,
          method: methodValue,
          durationMinutes: Number(duration.value),
          credential,
          createdAt: isoNow(),
          updatedAt: isoNow()
        });
        if (!persist()) { app.state.locks.pop(); return; }
        form.reset();
        duration.value = "0";
        refreshMethod();
        status.textContent = "The independent browser-local toy lock was saved. Credential fields were cleared.";
        record("Toy lock configured", "An independent browser-local toy-lock record was configured without adding a credential to ordinary history or export data.");
        renderLocks();
        renderLockGates();
        message("success", "An independent browser-local toy lock is active.");
      } catch (error) {
        status.textContent = error && error.message ? error.message : "The browser-local toy lock could not be saved.";
      } finally {
        password.value = "";
        confirmation.value = "";
        totpSecret.value = "";
        submit.disabled = false;
      }
    });
    return form;
  }

  function renderTickets() {
    if (!app.ticketsHost) return;
    const list = app.ticketsHost.querySelector("[data-auth-ticket-list]") || create("div", { "data-auth-ticket-list": "true", class: "auth-ticket-list" });
    list.replaceChildren();
    if (!app.state.tickets.length) list.append(create("p", { class: "auth-empty-state", text: "No local support tickets have been created." }));
    app.state.tickets.forEach((ticket) => list.append(create("article", { class: "auth-ticket" }, [
      create("strong", { text: ticket.number }),
      create("span", { text: `${ticket.category} · ${ticket.status}` }),
      create("small", { text: `Created locally at ${ticket.createdAt}` })
    ])));
    if (!list.isConnected) app.ticketsHost.append(list);
  }

  function buildSupportDesk() {
    const desk = create("section", { class: "auth-support-desk", "data-auth-support-desk": "true" });
    const heading = create("h3", { text: "Support Tickets" });
    const plainBoundary = create("p", { class: "auth-support-boundary", text: "Nothing is sent anywhere, no ticket exists outside this browser, no network request is made, no data is collected, and nobody is reading this." });
    const form = create("form", { class: "auth-form" });
    const category = select([
      { value: "Forgotten toy-lock credential", label: "Forgotten toy-lock credential" },
      { value: "Authenticator entry recovery", label: "Authenticator entry recovery" },
      { value: "Browser-local storage reset", label: "Browser-local storage reset" }
    ], "Forgotten toy-lock credential");
    const note = create("textarea", { rows: "3", maxlength: "240", placeholder: "Optional note — never enter a secret, password, URI, or code." });
    const submit = create("button", { type: "submit", text: "Create local support ticket" });
    const status = create("output", { "aria-live": "polite" });
    form.append(field("Category", category), field("Optional note", note, "This note is discarded before the local ticket is saved so it cannot retain credential data."), submit, status);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (app.state.tickets.length >= TICKET_LIMIT) { status.textContent = "The bounded local ticket list is full."; return; }
      const ticket = { id: id("", "ticket"), number: `LOCAL-${String(Date.now()).slice(-8)}`, category: category.value, status: "Local recovery instructions ready", createdAt: isoNow() };
      app.state.tickets.unshift(ticket);
      note.value = "";
      if (!persist()) { app.state.tickets.shift(); return; }
      status.textContent = `${ticket.number} was created in this browser only. Its resolution is shown below.`;
      record("Local support ticket created", "A browser-local recovery ticket was created without retaining its optional note.");
      renderTickets();
      message("info", "A browser-local recovery ticket is ready. No request was sent.");
    });
    const recovery = create("div", { class: "auth-recovery" }, [
      create("strong", { text: "Recovery resolution" }),
      create("p", { text: "If a credential is forgotten, clear this site's storage in your browser settings. That removes this origin's browser-local authenticator, toy-lock, and support-ticket record; it does not affect the installed desktop app, a server, downloads, or another site." }),
      button("Erase this site's authenticator and toy-lock record", () => addConfirmation(recovery, "this site's authenticator, toy-lock, and local support-ticket record", clearAllLocalData))
    ]);
    app.ticketsHost = create("div", { class: "auth-ticket-host" });
    desk.append(heading, plainBoundary, form, recovery, app.ticketsHost);
    app.supportDesk = desk;
    return desk;
  }

  function buildPairingArea() {
    const canvas = create("canvas", { width: "1", height: "1", role: "img", "aria-label": "A locally generated QR code appears here only after you choose to reveal an authenticator pairing." });
    const secret = create("code", { "data-auth-manual-secret": "true" });
    const area = create("section", { class: "auth-pairing", "data-auth-pairing": "true", hidden: true }, [
      create("h3", { text: "Local pairing reveal" }),
      create("p", { text: "This QR encodes the local standard TOTP pairing URI for the selected entry. The QR and manual secret are shown only after a deliberate reveal and clear after 60 seconds." }),
      create("p", { "data-auth-pairing-parameters": "true" }),
      canvas,
      create("div", { class: "auth-manual-secret" }, [create("strong", { text: "Manual Base32 secret" }), secret, button("Copy currently revealed secret", () => {}, { "data-auth-copy-secret": "true" })]),
      create("div", { class: "auth-pairing-confirmation" }, [
        field("Confirm pairing with the current code", create("input", { type: "text", maxlength: "8", inputmode: "numeric", autocomplete: "one-time-code", "data-auth-pairing-confirmation": "true" }), "Type the current code from the authenticator you paired. Until it matches, this browser labels the pairing unconfirmed."),
        button("Confirm local pairing", () => {}, { "data-auth-confirm-pairing": "true" })
      ]),
      button("Hide pairing details now", clearPairing),
      create("output", { "aria-live": "polite" })
    ]);
    return area;
  }

  function seedCompleteness() {
    const contract = app.options.contract || window.MinecraftServerStudioContract;
    if (!contract || typeof contract.upsertCompletenessSurface !== "function") return;
    try {
      contract.upsertCompletenessSurface({
        id: "authenticator",
        label: "Browser-local authenticator and toy locks",
        route: "#authenticator-preview",
        features: [{
          id: "browser-local-authenticator-and-toy-locks",
          label: "Browser-local TOTP, pairing QR, toy-lock, and Support Tickets foundation",
          state: "in-progress",
          notes: "Implementation is browser-local and intentionally excludes network, ordinary export/history, QR decoding, camera import, every-element lock coverage, and runtime verification.",
          evidence: {
            implementation: { status: "in-progress", reference: "site/authenticator-locks.js and site/index.html", detail: "Actual local RFC 4226/6238 code generation, bounded storage, QR generation, lock verification, and recovery controls are wired." },
            documentation: { status: "in-progress", reference: "docs/features/authenticator-and-toy-locks.md and site/README.md", detail: "The browser-storage boundary and incomplete evidence are documented." },
            localization: { status: "missing", detail: "This new operational surface is English-first in this delivery lane." },
            persistence: { status: "in-progress", reference: "origin-scoped localStorage record", detail: "Bounded browser-local state persists only in this origin and browser profile." },
            test: { status: "missing", detail: "No automated test was run in this fast-delivery lane." },
            interaction: { status: "missing", detail: "No built-site interaction was run in this fast-delivery lane." },
            capture: { status: "missing", detail: "No built-site capture was run in this fast-delivery lane." }
          }
        }]
      });
    } catch (_) { /* completeness is supplementary to the visible surface */ }
  }

  const heading = create("div", { class: "auth-workspace-heading" }, [
    create("div", {}, [create("p", { class: "eyebrow", text: "Browser-local authenticator and toy locks" }), create("h3", { text: "Use local TOTP codes without sending a request." })]),
    create("span", { class: "preview-status", text: "Browser storage only" })
  ]);
  const disclosure = create("p", { class: "auth-disclosure", text: "This static page uses a bounded origin-scoped browser-storage record for entries and toy-lock credentials because it has no operating-system credential vault. It makes no network request, telemetry event, ordinary export, or history record containing a secret, password, URI, or current code. Browser storage is not a security boundary." });
  const entrySection = create("section", { class: "auth-workspace-section" }, [create("h3", { text: "Authenticator entries" }), buildEntryForm()]);
  app.entriesHost = create("div", { class: "auth-entry-host" });
  const controls = entrySearchControls();
  app.pairingHost = buildPairingArea();
  app.entryGate = create("section", { class: "auth-lock-gate", hidden: true });
  app.entriesProtected = create("div", { class: "auth-entry-protected" }, [controls.controls, app.entriesHost, app.pairingHost]);
  entrySection.append(app.entryGate, app.entriesProtected);
  const lockSection = create("section", { class: "auth-workspace-section" }, [create("h3", { text: "Per-target toy locks" }), create("p", { text: "Each listed tab or element target has its own independent password or TOTP credential. These locks are for fun and self-imposed friction only; they do not secure data from someone who can access this browser profile." }), buildLockForm()]);
  app.locksHost = create("div", { class: "auth-lock-host" });
  lockSection.append(app.locksHost);
  const supportDesk = buildSupportDesk();
  const help = create("section", { class: "auth-workspace-section" }, [
    create("h3", { text: "Help and recovery" }),
    create("p", { text: "Use Support Tickets for the local recovery instructions. It does not contact a person or service." }),
    button("Open Support Tickets", openSupportTickets)
  ]);
  app.status = create("output", { class: "auth-global-status", "aria-live": "polite", text: "Ready for browser-local authenticator and toy-lock actions. No connection is active." });
  app.tabGate = create("section", { class: "auth-lock-gate", hidden: true });
  app.workspaceCore = create("div", { class: "auth-workspace-core" }, [heading, disclosure, entrySection, lockSection, help, app.status]);
  host.replaceChildren(app.tabGate, app.workspaceCore, supportDesk);
  renderEntries(controls.matcher());
  renderLocks();
  renderTickets();
  renderLockGates();
  seedCompleteness();
  if (app.codeTimer) window.clearInterval(app.codeTimer);
  app.codeTimer = window.setInterval(refreshCodes, 1000);
  const api = Object.freeze({
    clearLocalState: clearAllLocalData,
    isTargetLocked: (target) => { const lock = lockFor(target); return Boolean(lock && !isUnlocked(lock)); }
  });
  app.api = api;
  return api;
}
