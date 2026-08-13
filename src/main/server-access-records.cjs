/*
 * Narrow local access-record boundary for a server already registered by
 * ServerManager. This module only reads and atomically replaces four fixed
 * Minecraft access-list files below that server's canonical local root:
 *
 *   ops.json, whitelist.json, banned-players.json, banned-ips.json
 *
 * Public API:
 *   new ServerAccessRecordsService({ serverManager })
 *   service.snapshot(serverId)
 *   service.add(serverId, input)
 *   service.removalPreview(serverId, { kind, recordId })
 *   service.remove(serverId, { kind, recordId, confirmation })
 *
 * The module deliberately has no shell, network, process, RCON, credential,
 * arbitrary-path, or command capability. The confirmation token is an
 * accidental-action safeguard, not an authorization or security boundary.
 */

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const net = require('node:net');
const path = require('node:path');

const MAX_LIST_BYTES = 512 * 1024;
const MAX_LIST_RECORDS = 2_048;
const MAX_JSON_DEPTH = 32;
const MAX_REASON_LENGTH = 512;
const MAX_EXPIRES_LENGTH = 64;
const MAX_CREATED_LENGTH = 96;
const MAX_SOURCE_LENGTH = 128;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PLAYER_NAME_PATTERN = /^[A-Za-z0-9_]{1,16}$/;
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

const ACCESS_LISTS = Object.freeze({
  ops: Object.freeze({
    kind: 'ops',
    fileName: 'ops.json',
    label: 'operator list',
    removalAction: 'remove'
  }),
  whitelist: Object.freeze({
    kind: 'whitelist',
    fileName: 'whitelist.json',
    label: 'whitelist',
    removalAction: 'remove'
  }),
  bannedPlayers: Object.freeze({
    kind: 'bannedPlayers',
    fileName: 'banned-players.json',
    label: 'player ban list',
    removalAction: 'unban'
  }),
  bannedIps: Object.freeze({
    kind: 'bannedIps',
    fileName: 'banned-ips.json',
    label: 'IP ban list',
    removalAction: 'unban'
  })
});

function accessError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isPlainRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  return Object.keys(value).every((key) => !UNSAFE_KEYS.has(key));
}

function assertPlainRecord(value, code, message) {
  if (!isPlainRecord(value)) throw accessError(code, message);
  return value;
}

function assertExactKeys(value, keys, code, message) {
  assertPlainRecord(value, code, message);
  const allowed = new Set(keys);
  if (Object.keys(value).some((key) => !allowed.has(key))) throw accessError(code, message);
}

function text(value) {
  return typeof value === 'string' ? value : null;
}

function boundedText(value, maximum, field, { allowEmpty = true } = {}) {
  const candidate = text(value);
  if (candidate === null || candidate.length > maximum || /[\u0000-\u001f\u007f]/.test(candidate)) {
    throw accessError('ACCESS_RECORD_INVALID', `${field} must be a bounded plain-text value.`);
  }
  if (!allowEmpty && !candidate.trim()) throw accessError('ACCESS_RECORD_INVALID', `${field} is required.`);
  return candidate;
}

function requiredUuid(value) {
  const candidate = text(value);
  if (!candidate || !UUID_PATTERN.test(candidate)) {
    throw accessError('ACCESS_RECORD_INVALID', 'Provide a complete UUID for the player record.');
  }
  return candidate.toLowerCase();
}

function requiredPlayerName(value) {
  const candidate = text(value);
  if (!candidate || !PLAYER_NAME_PATTERN.test(candidate)) {
    throw accessError('ACCESS_RECORD_INVALID', 'Provide a 1–16-character Minecraft player name using letters, numbers, or underscores.');
  }
  return candidate;
}

function requiredIpLiteral(value) {
  const candidate = text(value);
  if (!candidate || candidate.length > 64 || net.isIP(candidate) === 0) {
    throw accessError('ACCESS_RECORD_INVALID', 'Provide an explicit IPv4 or IPv6 literal; host names are not accepted.');
  }
  return candidate.toLowerCase();
}

function optionalReason(value, present) {
  if (!present) return '';
  return boundedText(value, MAX_REASON_LENGTH, 'Reason');
}

function normalizeExpiryForAdd(value, present) {
  if (!present) return 'forever';
  const candidate = boundedText(value, MAX_EXPIRES_LENGTH, 'Expiry', { allowEmpty: false }).trim();
  if (candidate.toLowerCase() === 'forever') return 'forever';
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(candidate)) {
    throw accessError('ACCESS_RECORD_INVALID', 'Expiry must be "forever" or a UTC ISO-8601 timestamp.');
  }
  const instant = new Date(candidate);
  if (Number.isNaN(instant.getTime())) throw accessError('ACCESS_RECORD_INVALID', 'Expiry must be a valid UTC ISO-8601 timestamp.');
  return instant.toISOString();
}

function loadedExpiry(value) {
  return boundedText(value, MAX_EXPIRES_LENGTH, 'Stored expiry', { allowEmpty: false });
}

function loadedCreated(value) {
  return boundedText(value, MAX_CREATED_LENGTH, 'Stored creation time', { allowEmpty: false });
}

function loadedSource(value) {
  return boundedText(value, MAX_SOURCE_LENGTH, 'Stored source', { allowEmpty: false });
}

function requiredOperatorLevel(value) {
  if (!Number.isInteger(value) || value < 1 || value > 4) {
    throw accessError('ACCESS_RECORD_INVALID', 'Operator level must be a whole number from 1 through 4.');
  }
  return value;
}

function optionalOperatorLevel(value, present) {
  return present ? requiredOperatorLevel(value) : 4;
}

function requiredBoolean(value, field) {
  if (typeof value !== 'boolean') throw accessError('ACCESS_RECORD_INVALID', `${field} must be true or false.`);
  return value;
}

function optionalBoolean(value, present, fallback) {
  return present ? requiredBoolean(value, 'Bypasses player limit') : fallback;
}

function listSpec(kind) {
  if (typeof kind !== 'string' || !hasOwn(ACCESS_LISTS, kind)) {
    throw accessError('ACCESS_RECORD_KIND', 'Choose one supported local access-list type.');
  }
  const spec = ACCESS_LISTS[kind];
  return spec;
}

function recordIdentity(kind, raw) {
  if (kind === 'bannedIps') return `ip:${raw.ip.toLowerCase()}`;
  return `uuid:${raw.uuid.toLowerCase()}`;
}

function stableRecordId(kind, raw) {
  const identity = recordIdentity(kind, raw);
  const digest = crypto.createHash('sha256').update(`${kind}\u0000${identity}`, 'utf8').digest('hex');
  return `access:${kind}:${digest}`;
}

function recordProjection(kind, raw) {
  const common = {
    id: stableRecordId(kind, raw),
    kind,
    label: kind === 'bannedIps' ? raw.ip : raw.name
  };
  if (kind === 'ops') {
    return Object.freeze({
      ...common,
      uuid: raw.uuid,
      name: raw.name,
      level: raw.level,
      bypassesPlayerLimit: raw.bypassesPlayerLimit
    });
  }
  if (kind === 'whitelist') {
    return Object.freeze({ ...common, uuid: raw.uuid, name: raw.name });
  }
  if (kind === 'bannedPlayers') {
    return Object.freeze({
      ...common,
      uuid: raw.uuid,
      name: raw.name,
      reason: raw.reason,
      expires: raw.expires
    });
  }
  return Object.freeze({ ...common, ip: raw.ip, reason: raw.reason, expires: raw.expires });
}

function normalizeStoredRecord(kind, candidate) {
  if (kind === 'ops') {
    assertExactKeys(candidate, ['uuid', 'name', 'level', 'bypassesPlayerLimit'], 'ACCESS_RECORD_INVALID', 'The stored operator list has an unsupported record shape.');
    return Object.freeze({
      uuid: requiredUuid(candidate.uuid),
      name: requiredPlayerName(candidate.name),
      level: requiredOperatorLevel(candidate.level),
      bypassesPlayerLimit: requiredBoolean(candidate.bypassesPlayerLimit, 'Stored operator bypass flag')
    });
  }
  if (kind === 'whitelist') {
    assertExactKeys(candidate, ['uuid', 'name'], 'ACCESS_RECORD_INVALID', 'The stored whitelist has an unsupported record shape.');
    return Object.freeze({ uuid: requiredUuid(candidate.uuid), name: requiredPlayerName(candidate.name) });
  }
  if (kind === 'bannedPlayers') {
    assertExactKeys(candidate, ['uuid', 'name', 'created', 'source', 'expires', 'reason'], 'ACCESS_RECORD_INVALID', 'The stored player ban list has an unsupported record shape.');
    return Object.freeze({
      uuid: requiredUuid(candidate.uuid),
      name: requiredPlayerName(candidate.name),
      created: loadedCreated(candidate.created),
      source: loadedSource(candidate.source),
      expires: loadedExpiry(candidate.expires),
      reason: boundedText(candidate.reason, MAX_REASON_LENGTH, 'Stored ban reason')
    });
  }
  assertExactKeys(candidate, ['ip', 'created', 'source', 'expires', 'reason'], 'ACCESS_RECORD_INVALID', 'The stored IP ban list has an unsupported record shape.');
  return Object.freeze({
    ip: requiredIpLiteral(candidate.ip),
    created: loadedCreated(candidate.created),
    source: loadedSource(candidate.source),
    expires: loadedExpiry(candidate.expires),
    reason: boundedText(candidate.reason, MAX_REASON_LENGTH, 'Stored ban reason')
  });
}

function normalizeAddInput(input) {
  assertPlainRecord(input, 'ACCESS_RECORD_INPUT', 'Access-record input must be a plain object.');
  const kind = text(input.kind);
  const spec = listSpec(kind);
  const baseKeys = ['kind', 'name', 'uuid', 'level', 'bypassesPlayerLimit', 'ip', 'reason', 'expires'];
  assertExactKeys(input, baseKeys, 'ACCESS_RECORD_INPUT', 'Access-record input contains an unsupported field.');
  const has = (key) => hasOwn(input, key);

  if (kind === 'ops') {
    if (has('ip') || has('reason') || has('expires')) throw accessError('ACCESS_RECORD_INPUT', 'Operator records do not accept an IP address, ban reason, or expiry.');
    return {
      spec,
      raw: Object.freeze({
        uuid: requiredUuid(input.uuid),
        name: requiredPlayerName(input.name),
        level: optionalOperatorLevel(input.level, has('level')),
        bypassesPlayerLimit: optionalBoolean(input.bypassesPlayerLimit, has('bypassesPlayerLimit'), false)
      })
    };
  }
  if (kind === 'whitelist') {
    if (has('ip') || has('level') || has('bypassesPlayerLimit') || has('reason') || has('expires')) {
      throw accessError('ACCESS_RECORD_INPUT', 'Whitelist records only accept an explicit UUID and player name.');
    }
    return { spec, raw: Object.freeze({ uuid: requiredUuid(input.uuid), name: requiredPlayerName(input.name) }) };
  }
  if (kind === 'bannedPlayers') {
    if (has('ip') || has('level') || has('bypassesPlayerLimit')) {
      throw accessError('ACCESS_RECORD_INPUT', 'Player-ban records only accept an explicit UUID, player name, optional reason, and optional expiry.');
    }
    return {
      spec,
      raw: Object.freeze({
        uuid: requiredUuid(input.uuid),
        name: requiredPlayerName(input.name),
        created: new Date().toISOString(),
        source: 'Minecraft Server Studio',
        expires: normalizeExpiryForAdd(input.expires, has('expires')),
        reason: optionalReason(input.reason, has('reason'))
      })
    };
  }
  if (has('name') || has('uuid') || has('level') || has('bypassesPlayerLimit')) {
    throw accessError('ACCESS_RECORD_INPUT', 'IP-ban records only accept an explicit IP literal, optional reason, and optional expiry.');
  }
  return {
    spec,
    raw: Object.freeze({
      ip: requiredIpLiteral(input.ip),
      created: new Date().toISOString(),
      source: 'Minecraft Server Studio',
      expires: normalizeExpiryForAdd(input.expires, has('expires')),
      reason: optionalReason(input.reason, has('reason'))
    })
  };
}

function readServerId(value) {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim() || value.length > 128 || /[\\/\u0000-\u001f\u007f]/.test(value)) {
    throw accessError('ACCESS_SERVER_ID', 'Choose a valid registered server.');
  }
  return value;
}

function sameFile(left, right) {
  if (typeof left?.dev !== 'number' || typeof right?.dev !== 'number') return true;
  if (typeof left?.ino !== 'number' || typeof right?.ino !== 'number') return true;
  return left.dev === right.dev && left.ino === right.ino;
}

async function optionalLstat(candidate) {
  try {
    return await fs.lstat(candidate);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function safeListPath(serverRoot, spec) {
  const resolvedRoot = path.resolve(serverRoot);
  const target = path.resolve(resolvedRoot, spec.fileName);
  const relative = path.relative(resolvedRoot, target);
  if (relative !== spec.fileName || path.isAbsolute(relative)) {
    throw accessError('ACCESS_PATH_REJECTED', 'The managed access-list target was rejected.');
  }
  return target;
}

async function readRegularUtf8File(target) {
  const before = await optionalLstat(target);
  if (!before) return { state: 'missing', text: null };
  if (!before.isFile() || before.isSymbolicLink() || before.size > MAX_LIST_BYTES) {
    return { state: before.size > MAX_LIST_BYTES ? 'too-large' : 'invalid', text: null };
  }
  let handle;
  try {
    handle = await fs.open(target, 'r');
    const opened = await handle.stat();
    const after = await fs.lstat(target);
    if (!opened.isFile() || after.isSymbolicLink() || !after.isFile() || !sameFile(opened, after) || opened.size > MAX_LIST_BYTES) {
      return { state: opened.size > MAX_LIST_BYTES ? 'too-large' : 'invalid', text: null };
    }
    const textValue = await handle.readFile({ encoding: 'utf8' });
    if (Buffer.byteLength(textValue, 'utf8') > MAX_LIST_BYTES) return { state: 'too-large', text: null };
    return { state: 'ready', text: textValue };
  } catch {
    return { state: 'unavailable', text: null };
  } finally {
    await handle?.close().catch(() => {});
  }
}

function stateDetail(spec, state) {
  if (state === 'missing') return `No local ${spec.fileName} exists. Adding a validated record will create this explicit managed list.`;
  if (state === 'ready') return `Validated local ${spec.fileName} records are available for this selected server.`;
  if (state === 'too-large') return `The local ${spec.fileName} exceeds the bounded access-record limit and was preserved without changes.`;
  if (state === 'unavailable') return `The local ${spec.fileName} could not be read and was preserved without changes.`;
  return `The local ${spec.fileName} has an unsupported or unsafe shape and was preserved without changes.`;
}

function stateProvenance(state) {
  if (state === 'missing') return 'missing-local-file';
  if (state === 'ready') return 'validated-local-file';
  return 'preserved-unavailable-local-file';
}

function normalizeStoredList(kind, parsed) {
  if (!Array.isArray(parsed) || parsed.length > MAX_LIST_RECORDS) {
    throw accessError('ACCESS_RECORD_INVALID', 'The stored access list is not a bounded JSON array.');
  }
  const records = [];
  const identities = new Set();
  for (const candidate of parsed) {
    const raw = normalizeStoredRecord(kind, candidate);
    const identity = recordIdentity(kind, raw);
    if (identities.has(identity)) throw accessError('ACCESS_RECORD_INVALID', 'The stored access list has duplicate identities and was preserved without changes.');
    identities.add(identity);
    records.push(raw);
  }
  return Object.freeze(records);
}

function assertNoDuplicateJsonObjectKeys(source) {
  let index = 0;
  const stack = [];
  let rootState = 'value';
  const invalid = () => {
    throw accessError('ACCESS_RECORD_INVALID', 'The stored access list has invalid or duplicate JSON object keys and was preserved without changes.');
  };
  const whitespace = (character) => character === ' ' || character === '\t' || character === '\r' || character === '\n';
  const current = () => stack[stack.length - 1] || null;
  const skipWhitespace = () => {
    while (index < source.length && whitespace(source[index])) index += 1;
  };
  const expectValue = () => {
    const parent = current();
    if (!parent) {
      if (rootState !== 'value') invalid();
      return;
    }
    if (parent.type === 'object' && parent.state !== 'value') invalid();
    if (parent.type === 'array' && parent.state !== 'value-or-end') invalid();
  };
  const finishValue = () => {
    const parent = current();
    if (!parent) {
      if (rootState !== 'value') invalid();
      rootState = 'done';
      return;
    }
    if (parent.type === 'object') {
      if (parent.state !== 'value') invalid();
      parent.state = 'comma-or-end';
      return;
    }
    if (parent.state !== 'value-or-end') invalid();
    parent.state = 'comma-or-end';
  };
  const readString = () => {
    const start = index;
    index += 1;
    let escaped = false;
    while (index < source.length) {
      const character = source[index];
      if (character === '"' && !escaped) {
        index += 1;
        try {
          return JSON.parse(source.slice(start, index));
        } catch {
          invalid();
        }
      }
      if (character === '\\' && !escaped) {
        escaped = true;
      } else {
        escaped = false;
      }
      index += 1;
    }
    invalid();
  };

  while (true) {
    skipWhitespace();
    if (index >= source.length) break;
    const character = source[index];
    const parent = current();
    if (character === '{' || character === '[') {
      expectValue();
      if (stack.length >= MAX_JSON_DEPTH) {
        throw accessError('ACCESS_RECORD_INVALID', 'The stored access list exceeds the supported JSON nesting limit and was preserved without changes.');
      }
      stack.push(character === '{'
        ? { type: 'object', state: 'key-or-end', keys: new Set() }
        : { type: 'array', state: 'value-or-end' });
      index += 1;
      continue;
    }
    if (character === '"') {
      const decoded = readString();
      if (parent?.type === 'object' && parent.state === 'key-or-end') {
        if (parent.keys.has(decoded)) invalid();
        parent.keys.add(decoded);
        parent.state = 'colon';
        continue;
      }
      expectValue();
      finishValue();
      continue;
    }
    if (character === ':') {
      if (parent?.type !== 'object' || parent.state !== 'colon') invalid();
      parent.state = 'value';
      index += 1;
      continue;
    }
    if (character === ',') {
      if (!parent || parent.state !== 'comma-or-end') invalid();
      parent.state = parent.type === 'object' ? 'key-or-end' : 'value-or-end';
      index += 1;
      continue;
    }
    if (character === '}' || character === ']') {
      if (!parent || (character === '}' ? parent.type !== 'object' : parent.type !== 'array')) invalid();
      if (parent.state !== 'key-or-end' && parent.state !== 'value-or-end' && parent.state !== 'comma-or-end') invalid();
      stack.pop();
      index += 1;
      finishValue();
      continue;
    }
    expectValue();
    const start = index;
    while (index < source.length && !whitespace(source[index]) && !',]}'.includes(source[index])) index += 1;
    if (start === index) invalid();
    finishValue();
  }
  if (stack.length || rootState !== 'done') invalid();
}

async function readAccessList(serverRoot, spec) {
  const target = safeListPath(serverRoot, spec);
  const read = await readRegularUtf8File(target);
  if (read.state !== 'ready') {
    return Object.freeze({ spec, target, state: read.state, records: Object.freeze([]) });
  }
  try {
    assertNoDuplicateJsonObjectKeys(read.text);
    const parsed = JSON.parse(read.text);
    return Object.freeze({ spec, target, state: 'ready', records: normalizeStoredList(spec.kind, parsed) });
  } catch {
    return Object.freeze({ spec, target, state: 'invalid', records: Object.freeze([]) });
  }
}

async function writeAccessListAtomically(serverRoot, current, nextRecords) {
  if (!Array.isArray(nextRecords) || nextRecords.length > MAX_LIST_RECORDS) {
    throw accessError('ACCESS_RECORD_LIMIT', 'The requested access-list change exceeds the bounded record limit.');
  }
  const target = safeListPath(serverRoot, current.spec);
  const serialized = `${JSON.stringify(nextRecords, null, 2)}\n`;
  if (Buffer.byteLength(serialized, 'utf8') > MAX_LIST_BYTES) {
    throw accessError('ACCESS_RECORD_LIMIT', 'The requested access-list change exceeds the bounded local file-size limit.');
  }
  const existing = await optionalLstat(target);
  if (existing && (!existing.isFile() || existing.isSymbolicLink())) {
    throw accessError('ACCESS_TARGET_UNSAFE', 'The managed local access-list target is not a regular file and was not changed.');
  }
  const temporary = path.join(serverRoot, `.${current.spec.fileName}.${crypto.randomUUID()}.tmp`);
  let handle;
  try {
    handle = await fs.open(temporary, 'wx', 0o600);
    await handle.writeFile(serialized, 'utf8');
    await handle.sync();
    await handle.close();
    handle = null;
    const latest = await optionalLstat(target);
    if (latest && (!latest.isFile() || latest.isSymbolicLink())) {
      throw accessError('ACCESS_TARGET_UNSAFE', 'The managed local access-list target changed shape and was not replaced.');
    }
    await fs.rename(temporary, target);
  } catch (error) {
    await handle?.close().catch(() => {});
    await fs.unlink(temporary).catch(() => {});
    if (error?.code?.startsWith('ACCESS_')) throw error;
    throw accessError('ACCESS_WRITE_FAILED', 'The managed local access-list change could not be written atomically.');
  }
}

function removalDigest(serverId, kind, recordId, records) {
  const material = JSON.stringify({
    schema: 1,
    serverId,
    kind,
    recordId,
    records
  });
  return crypto.createHash('sha256').update(material, 'utf8').digest('hex');
}

function assertRemovalRequest(request) {
  assertExactKeys(request, ['kind', 'recordId'], 'ACCESS_REMOVE_REQUEST', 'Removal preview input contains an unsupported field.');
  const spec = listSpec(text(request.kind));
  const recordId = text(request.recordId);
  if (!recordId || recordId !== recordId.trim() || recordId !== `access:${spec.kind}:${recordId.slice(`access:${spec.kind}:`.length)}` || !new RegExp(`^access:${spec.kind}:[a-f0-9]{64}$`).test(recordId)) {
    throw accessError('ACCESS_REMOVE_REQUEST', 'Choose a valid access record from the selected list.');
  }
  return { spec, recordId };
}

function assertConfirmation(value, expectedDigest) {
  assertExactKeys(value, ['authorityDigest', 'firstAcknowledged', 'secondAcknowledged', 'sliderValue'], 'ACCESS_CONFIRMATION', 'Removal confirmation contains an unsupported field.');
  if (typeof value.authorityDigest !== 'string' || !/^[a-f0-9]{64}$/.test(value.authorityDigest)) {
    throw accessError('ACCESS_CONFIRMATION', 'The removal authority is missing or invalid. Review the removal preview again.');
  }
  const supplied = Buffer.from(value.authorityDigest, 'hex');
  const expected = Buffer.from(expectedDigest, 'hex');
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
    throw accessError('ACCESS_CONFIRMATION_STALE', 'The access list changed or the confirmation is stale. Review the removal preview again.');
  }
  if (value.firstAcknowledged !== true || value.secondAcknowledged !== true || value.sliderValue !== 100) {
    throw accessError('ACCESS_CONFIRMATION', 'Confirm both acknowledgements and move the confirmation slider fully before removing this access record.');
  }
}

function consequenceFor(spec, record) {
  const action = spec.removalAction === 'unban' ? 'unban' : 'remove';
  const identity = record.label;
  return action === 'unban'
    ? `Unban ${identity} from the selected server's local ${spec.label}. No server command is sent.`
    : `Remove ${identity} from the selected server's local ${spec.label}. No server command is sent.`;
}

class ServerAccessRecordsService {
  constructor(options = {}) {
    assertExactKeys(options, ['serverManager'], 'ACCESS_SERVICE_OPTIONS', 'Access-record service options contain an unsupported field.');
    if (!options.serverManager || typeof options.serverManager.getServer !== 'function') {
      throw accessError('ACCESS_SERVICE_OPTIONS', 'The access-record service requires the existing controlled server manager.');
    }
    this.serverManager = options.serverManager;
  }

  async _serverContext(serverId) {
    const requestedId = readServerId(serverId);
    let server;
    try {
      server = await this.serverManager.getServer(requestedId);
    } catch {
      throw accessError('ACCESS_SERVER_UNAVAILABLE', 'The selected server is not available from the controlled local server registry.');
    }
    if (!server || typeof server !== 'object' || server.id !== requestedId || typeof server.serverPath !== 'string' || !server.serverPath || /\u0000/.test(server.serverPath)) {
      throw accessError('ACCESS_SERVER_UNAVAILABLE', 'The selected server has no valid controlled local root.');
    }
    let configuredRoot;
    try {
      configuredRoot = path.resolve(server.serverPath);
    } catch {
      throw accessError('ACCESS_SERVER_UNAVAILABLE', 'The selected server has no valid controlled local root.');
    }
    if (!path.isAbsolute(configuredRoot)) throw accessError('ACCESS_SERVER_UNAVAILABLE', 'The selected server has no valid controlled local root.');
    let rootInfo;
    try {
      rootInfo = await fs.lstat(configuredRoot);
      if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) throw new Error('unsafe-root');
      const canonicalRoot = await fs.realpath(configuredRoot);
      const canonicalInfo = await fs.stat(canonicalRoot);
      if (!canonicalInfo.isDirectory()) throw new Error('not-directory');
      return Object.freeze({
        serverId: requestedId,
        serverRoot: canonicalRoot,
        serverState: typeof this.serverManager.isServerRunning === 'function' && this.serverManager.isServerRunning(requestedId) ? 'running' : 'stopped'
      });
    } catch {
      throw accessError('ACCESS_SERVER_UNAVAILABLE', 'The selected server root is unavailable or not a controlled regular directory.');
    }
  }

  async _listFor(context, spec) {
    return readAccessList(context.serverRoot, spec);
  }

  _snapshotFromLists(context, lists) {
    return Object.freeze({
      serverId: context.serverId,
      serverState: context.serverState,
      consequence: 'Access-list changes stay in the selected server’s managed local root. A running server may need its own reload or restart before it recognizes a saved list; this service sends no command.',
      lists: Object.freeze(lists.map((list) => Object.freeze({
        kind: list.spec.kind,
        fileName: list.spec.fileName,
        state: list.state,
        provenance: stateProvenance(list.state),
        detail: stateDetail(list.spec, list.state),
        records: Object.freeze(list.records.map((record) => recordProjection(list.spec.kind, record)))
      })))
    });
  }

  async snapshot(serverId) {
    const context = await this._serverContext(serverId);
    const lists = await Promise.all(Object.values(ACCESS_LISTS).map((spec) => this._listFor(context, spec)));
    return this._snapshotFromLists(context, lists);
  }

  async add(serverId, input) {
    const context = await this._serverContext(serverId);
    const addition = normalizeAddInput(input);
    const current = await this._listFor(context, addition.spec);
    if (!['missing', 'ready'].includes(current.state)) {
      throw accessError('ACCESS_LIST_UNAVAILABLE', `The selected local ${addition.spec.fileName} is not safe to edit and was preserved without changes.`);
    }
    const identity = recordIdentity(addition.spec.kind, addition.raw);
    if (current.records.some((record) => recordIdentity(addition.spec.kind, record) === identity)) {
      throw accessError('ACCESS_RECORD_EXISTS', 'That explicit player UUID or IP literal already exists in the selected local access list.');
    }
    const nextRecords = [...current.records, addition.raw];
    await writeAccessListAtomically(context.serverRoot, current, nextRecords);
    const next = await this._listFor(context, addition.spec);
    if (next.state !== 'ready') throw accessError('ACCESS_WRITE_FAILED', 'The local access-list change could not be verified after its atomic write.');
    const added = next.records.find((record) => recordIdentity(addition.spec.kind, record) === identity);
    if (!added) throw accessError('ACCESS_WRITE_FAILED', 'The requested local access-list record was not present after its atomic write.');
    return Object.freeze({
      operation: 'add',
      recordKind: addition.spec.kind,
      record: recordProjection(addition.spec.kind, added),
      snapshot: await this.snapshot(context.serverId)
    });
  }

  async removalPreview(serverId, request) {
    const context = await this._serverContext(serverId);
    const removal = assertRemovalRequest(request);
    const current = await this._listFor(context, removal.spec);
    if (current.state !== 'ready') {
      throw accessError('ACCESS_LIST_UNAVAILABLE', `The selected local ${removal.spec.fileName} is not safe to edit and was preserved without changes.`);
    }
    const record = current.records.find((candidate) => stableRecordId(removal.spec.kind, candidate) === removal.recordId);
    if (!record) throw accessError('ACCESS_RECORD_MISSING', 'The selected access record is no longer present in the local list.');
    return Object.freeze({
      state: 'ready',
      count: 1,
      recordKind: removal.spec.kind,
      consequence: consequenceFor(removal.spec, record),
      authority: Object.freeze({
        digest: removalDigest(context.serverId, removal.spec.kind, removal.recordId, current.records),
        purpose: consequenceFor(removal.spec, record)
      })
    });
  }

  async remove(serverId, request) {
    assertExactKeys(request, ['kind', 'recordId', 'confirmation'], 'ACCESS_REMOVE_REQUEST', 'Removal input contains an unsupported field.');
    const context = await this._serverContext(serverId);
    const removal = assertRemovalRequest({ kind: request.kind, recordId: request.recordId });
    const current = await this._listFor(context, removal.spec);
    if (current.state !== 'ready') {
      throw accessError('ACCESS_LIST_UNAVAILABLE', `The selected local ${removal.spec.fileName} is not safe to edit and was preserved without changes.`);
    }
    const index = current.records.findIndex((candidate) => stableRecordId(removal.spec.kind, candidate) === removal.recordId);
    if (index < 0) throw accessError('ACCESS_RECORD_MISSING', 'The selected access record is no longer present in the local list.');
    const digest = removalDigest(context.serverId, removal.spec.kind, removal.recordId, current.records);
    assertConfirmation(request.confirmation, digest);
    const removed = current.records[index];
    const nextRecords = current.records.filter((_, candidateIndex) => candidateIndex !== index);
    await writeAccessListAtomically(context.serverRoot, current, nextRecords);
    const next = await this._listFor(context, removal.spec);
    if (next.state !== 'ready' || next.records.some((candidate) => stableRecordId(removal.spec.kind, candidate) === removal.recordId)) {
      throw accessError('ACCESS_WRITE_FAILED', 'The local access-list removal could not be verified after its atomic write.');
    }
    return Object.freeze({
      operation: removal.spec.removalAction,
      recordKind: removal.spec.kind,
      record: recordProjection(removal.spec.kind, removed),
      snapshot: await this.snapshot(context.serverId)
    });
  }
}

module.exports = {
  ACCESS_LISTS,
  ServerAccessRecordsService
};
