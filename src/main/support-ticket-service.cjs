'use strict';

// Local-only Support Tickets metadata. Ticket descriptions deliberately reject
// credential-shaped input and no ticket record contains a password, PIN, TOTP
// value, authenticator URI, token, or protected-vault material.

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const SUPPORT_TICKET_SCHEMA_VERSION = 1;
const LIMITS = Object.freeze({
  dataDirectoryChars: 4096,
  recoveryDirectoryChars: 4096,
  tickets: 1024,
  descriptionChars: 1600,
  metadataBytes: 1024 * 1024,
  responseChars: 320
});

const CATEGORIES = new Set(['toy-lock-recovery', 'authenticator-entry', 'local-data-recovery', 'other']);
const SEVERITIES = new Set(['low', 'normal', 'urgent']);
const STATUSES = new Set(['opened', 'acknowledged', 'resolved']);
const IDENTIFIER_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TICKET_NUMBER_PATTERN = /^MSS-\d{8}-[A-F0-9]{6}$/;

const STATUS_RESPONSES = Object.freeze({
  opened: 'This local ticket is waiting for its on-device recovery instructions.',
  acknowledged: 'Local first response: nothing was sent and nobody will read this ticket. Use the recovery-folder action yourself.',
  resolved: 'The recovery folder was opened on this computer. No data was deleted; only you decide what to remove.'
});

function ticketError(code, message) {
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
  if (!isPlainRecord(value)) throw ticketError('SUPPORT_TICKET_INVALID_INPUT', message);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw ticketError('SUPPORT_TICKET_INVALID_INPUT', message);
  }
}

function assertExactKeys(value, keys, message) {
  if (!isPlainRecord(value)) throw ticketError('SUPPORT_TICKET_INVALID_RECORD', message);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw ticketError('SUPPORT_TICKET_INVALID_RECORD', message);
  }
}

function normalizeDirectory(value, maximum, message) {
  if (typeof value !== 'string' || !value || value.length > maximum || /[\u0000-\u001f]/.test(value)) {
    throw ticketError('SUPPORT_TICKET_INVALID_DIRECTORY', message);
  }
  const resolved = path.resolve(value);
  if (resolved === path.parse(resolved).root) throw ticketError('SUPPORT_TICKET_INVALID_DIRECTORY', message);
  return resolved;
}

function normalizeText(value, maximum, label) {
  if (typeof value !== 'string') throw ticketError('SUPPORT_TICKET_INVALID_INPUT', `${label} must be text.`);
  const normalized = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!normalized || normalized.length > maximum) throw ticketError('SUPPORT_TICKET_INVALID_INPUT', `${label} is invalid.`);
  return normalized;
}

function containsSecretLikeText(value) {
  return [
    /otpauth:\/\/\S+/iu,
    /\b(?:password|passcode|pin|totp|otp|one[-\s]?time\s+code|secret|credential|token|api[-\s_]?key|private\s+key)\b\s*(?:is|=|:)\s*\S+/iu,
    /\b[A-Z2-7]{16,}\b/iu,
    /\b\d{6,8}\b/u
  ].some((pattern) => pattern.test(value));
}

function normalizeCategory(value) {
  if (typeof value !== 'string' || !CATEGORIES.has(value)) {
    throw ticketError('SUPPORT_TICKET_INVALID_INPUT', 'Choose a supported local ticket category.');
  }
  return value;
}

function normalizeSeverity(value) {
  if (typeof value !== 'string' || !SEVERITIES.has(value)) {
    throw ticketError('SUPPORT_TICKET_INVALID_INPUT', 'Choose a supported local ticket severity.');
  }
  return value;
}

function normalizeStatus(value) {
  if (typeof value !== 'string' || !STATUSES.has(value)) {
    throw ticketError('SUPPORT_TICKET_INVALID_RECORD', 'Support ticket metadata is invalid.');
  }
  return value;
}

function normalizeDescription(value) {
  const description = normalizeText(value, LIMITS.descriptionChars, 'Ticket description');
  if (containsSecretLikeText(description)) {
    throw ticketError('SUPPORT_TICKET_SENSITIVE_TEXT', 'Do not include a password, PIN, code, authenticator URI, token, or secret in a local support ticket.');
  }
  return description;
}

function normalizeIdentifier(value) {
  if (typeof value !== 'string' || !IDENTIFIER_PATTERN.test(value)) {
    throw ticketError('SUPPORT_TICKET_INVALID_RECORD', 'Support ticket metadata is invalid.');
  }
  return value.toLowerCase();
}

function normalizeTicketNumber(value) {
  if (typeof value !== 'string' || !TICKET_NUMBER_PATTERN.test(value)) {
    throw ticketError('SUPPORT_TICKET_INVALID_RECORD', 'Support ticket metadata is invalid.');
  }
  return value;
}

function normalizeTimestamp(value) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw ticketError('SUPPORT_TICKET_INVALID_RECORD', 'Support ticket metadata is invalid.');
  }
  return new Date(value).toISOString();
}

function normalizeOptionalTimestamp(value) {
  if (value === null) return null;
  return normalizeTimestamp(value);
}

function responseFor(status) {
  return STATUS_RESPONSES[status];
}

function normalizePersistedTicket(value) {
  assertExactKeys(value, ['id', 'number', 'category', 'severity', 'description', 'status', 'response', 'createdAt', 'updatedAt', 'acknowledgedAt', 'resolvedAt'], 'Support ticket metadata is invalid.');
  const status = normalizeStatus(value.status);
  const acknowledgedAt = normalizeOptionalTimestamp(value.acknowledgedAt);
  const resolvedAt = normalizeOptionalTimestamp(value.resolvedAt);
  if ((status === 'opened' && (acknowledgedAt || resolvedAt)) || (status === 'acknowledged' && (!acknowledgedAt || resolvedAt)) || (status === 'resolved' && (!acknowledgedAt || !resolvedAt))) {
    throw ticketError('SUPPORT_TICKET_INVALID_RECORD', 'Support ticket metadata is invalid.');
  }
  const response = normalizeText(value.response, LIMITS.responseChars, 'Support ticket response');
  if (response !== responseFor(status)) throw ticketError('SUPPORT_TICKET_INVALID_RECORD', 'Support ticket metadata is invalid.');
  return Object.freeze({
    id: normalizeIdentifier(value.id),
    number: normalizeTicketNumber(value.number),
    category: normalizeCategory(value.category),
    severity: normalizeSeverity(value.severity),
    description: normalizeDescription(value.description),
    status,
    response,
    createdAt: normalizeTimestamp(value.createdAt),
    updatedAt: normalizeTimestamp(value.updatedAt),
    acknowledgedAt,
    resolvedAt
  });
}

function publicTicket(ticket) {
  return Object.freeze({
    id: ticket.id,
    number: ticket.number,
    category: ticket.category,
    severity: ticket.severity,
    description: ticket.description,
    status: ticket.status,
    response: ticket.response,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    acknowledgedAt: ticket.acknowledgedAt,
    resolvedAt: ticket.resolvedAt
  });
}

function sortTickets(tickets) {
  return tickets.slice().sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || right.number.localeCompare(left.number));
}

class SupportTicketService {
  constructor(options = {}) {
    assertKnownKeys(options, new Set(['dataDir', 'recoveryDirectory', 'onChange']), 'Support ticket service options are invalid.');
    this.dataDir = normalizeDirectory(options.dataDir, LIMITS.dataDirectoryChars, 'Support ticket storage requires an application-private data directory.');
    this.recoveryDirectory = normalizeDirectory(options.recoveryDirectory, LIMITS.recoveryDirectoryChars, 'Support ticket recovery requires an application-private data directory.');
    this.ticketsPath = path.join(this.dataDir, 'support-tickets.json');
    this.onChange = typeof options.onChange === 'function' ? options.onChange : null;
    this.tickets = [];
    this.initialized = false;
    this.metadataError = '';
  }

  initialize() {
    this.initialized = true;
    this.metadataError = '';
    this.tickets = [];
    try {
      this._ensureDirectory();
      if (!fs.existsSync(this.ticketsPath)) return this.getStatus();
      const stat = fs.statSync(this.ticketsPath);
      if (!stat.isFile() || stat.size <= 0 || stat.size > LIMITS.metadataBytes) throw new Error('invalid');
      const parsed = JSON.parse(fs.readFileSync(this.ticketsPath, 'utf8'));
      assertExactKeys(parsed, ['version', 'tickets'], 'Support ticket metadata is invalid.');
      if (parsed.version !== SUPPORT_TICKET_SCHEMA_VERSION || !Array.isArray(parsed.tickets) || parsed.tickets.length > LIMITS.tickets) throw new Error('invalid');
      const ids = new Set();
      const numbers = new Set();
      this.tickets = sortTickets(parsed.tickets.map((ticket) => {
        const normalized = normalizePersistedTicket(ticket);
        if (ids.has(normalized.id) || numbers.has(normalized.number)) throw new Error('duplicate');
        ids.add(normalized.id);
        numbers.add(normalized.number);
        return normalized;
      }));
    } catch {
      this.tickets = [];
      this.metadataError = 'Support ticket metadata is unavailable. Existing local records were not overwritten.';
    }
    return this.getStatus();
  }

  getStatus() {
    return Object.freeze({
      state: this.metadataError ? 'metadata-unavailable' : 'ready',
      ticketCount: this.tickets.length,
      detail: this.metadataError || 'Local tickets stay on this computer and contain only bounded, non-secret recovery notes.',
      recoveryDirectory: this.recoveryDirectory,
      disclosure: 'Nothing is sent anywhere. No ticket exists outside this computer. No network request is made. Nobody is reading it.'
    });
  }

  listTickets() {
    this._assertMetadataReady();
    return Object.freeze({ status: this.getStatus(), tickets: this.tickets.map(publicTicket) });
  }

  createTicket(input) {
    this._assertMetadataReady();
    if (this.tickets.length >= LIMITS.tickets) throw ticketError('SUPPORT_TICKET_LIMIT', 'The local support ticket limit has been reached.');
    assertKnownKeys(input || {}, new Set(['category', 'severity', 'description']), 'Support ticket input is invalid.');
    const source = input || {};
    const now = new Date().toISOString();
    const ticket = Object.freeze({
      id: crypto.randomUUID(),
      number: this._nextTicketNumber(now),
      category: normalizeCategory(source.category),
      severity: normalizeSeverity(source.severity),
      description: normalizeDescription(source.description),
      status: 'opened',
      response: responseFor('opened'),
      createdAt: now,
      updatedAt: now,
      acknowledgedAt: null,
      resolvedAt: null
    });
    this.tickets = sortTickets([...this.tickets, ticket]);
    this._writeTickets();
    this._notify();
    return publicTicket(ticket);
  }

  acknowledgeTicket(id) {
    this._assertMetadataReady();
    const ticket = this._findTicket(id);
    if (ticket.status !== 'opened') return publicTicket(ticket);
    const now = new Date().toISOString();
    return this._replaceTicket(ticket.id, Object.freeze({
      ...ticket,
      status: 'acknowledged',
      response: responseFor('acknowledged'),
      updatedAt: now,
      acknowledgedAt: now
    }));
  }

  recordRecoveryFolderOpened(id) {
    this._assertMetadataReady();
    const ticket = this._findTicket(id);
    if (ticket.status === 'resolved') return publicTicket(ticket);
    const now = new Date().toISOString();
    return this._replaceTicket(ticket.id, Object.freeze({
      ...ticket,
      status: 'resolved',
      response: responseFor('resolved'),
      updatedAt: now,
      acknowledgedAt: ticket.acknowledgedAt || now,
      resolvedAt: now
    }));
  }

  _assertMetadataReady() {
    if (!this.initialized) throw ticketError('SUPPORT_TICKET_NOT_READY', 'Local support ticket storage is still starting.');
    if (this.metadataError) throw ticketError('SUPPORT_TICKET_METADATA_UNAVAILABLE', this.metadataError);
  }

  _findTicket(id) {
    const normalized = normalizeIdentifier(id);
    const ticket = this.tickets.find((candidate) => candidate.id === normalized);
    if (!ticket) throw ticketError('SUPPORT_TICKET_NOT_FOUND', 'The requested local support ticket no longer exists.');
    return ticket;
  }

  _nextTicketNumber(isoTimestamp) {
    const day = isoTimestamp.slice(0, 10).replace(/-/g, '');
    for (let attempt = 0; attempt < 32; attempt += 1) {
      const suffix = crypto.randomBytes(4).toString('hex').slice(0, 6).toUpperCase();
      const number = `MSS-${day}-${suffix}`;
      if (!this.tickets.some((ticket) => ticket.number === number)) return number;
    }
    throw ticketError('SUPPORT_TICKET_IDENTIFIER_UNAVAILABLE', 'A local support ticket number could not be reserved.');
  }

  _replaceTicket(id, replacement) {
    this.tickets = sortTickets(this.tickets.map((ticket) => ticket.id === id ? replacement : ticket));
    this._writeTickets();
    this._notify();
    return publicTicket(replacement);
  }

  _ensureDirectory() {
    try {
      fs.mkdirSync(this.dataDir, { recursive: true, mode: 0o700 });
    } catch {
      throw ticketError('SUPPORT_TICKET_DIRECTORY_UNAVAILABLE', 'Local support ticket storage is unavailable.');
    }
  }

  _writeTickets() {
    this._ensureDirectory();
    const payload = JSON.stringify({ version: SUPPORT_TICKET_SCHEMA_VERSION, tickets: this.tickets });
    const temporary = `${this.ticketsPath}.${process.pid}.${crypto.randomBytes(8).toString('hex')}.tmp`;
    try {
      const descriptor = fs.openSync(temporary, 'wx', 0o600);
      try {
        fs.writeFileSync(descriptor, payload, 'utf8');
        fs.fsyncSync(descriptor);
      } finally {
        fs.closeSync(descriptor);
      }
      fs.renameSync(temporary, this.ticketsPath);
    } catch {
      try { if (fs.existsSync(temporary)) fs.rmSync(temporary, { force: true }); } catch { /* Best-effort cleanup only. */ }
      throw ticketError('SUPPORT_TICKET_WRITE_FAILED', 'Local support ticket metadata could not be saved.');
    }
  }

  _notify() {
    try { this.onChange?.(); } catch { /* Renderer notification failures do not change local storage state. */ }
  }
}

module.exports = Object.freeze({
  CATEGORIES,
  LIMITS,
  SEVERITIES,
  SUPPORT_TICKET_SCHEMA_VERSION,
  SupportTicketService
});
