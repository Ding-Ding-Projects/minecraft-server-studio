'use strict';

/**
 * Bounded, local-only safety helpers for Minecraft server.properties updates and
 * locally selected plugin JARs. This module does not download a plugin, start a
 * process, execute plugin code, or mutate a player-list JSON file.
 */

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { TextDecoder } = require('node:util');
const zlib = require('node:zlib');
const {
  parseGeneratedConfig,
  updateGeneratedConfig
} = require('./buildtools-adapter.cjs');

const MAX_SERVER_PROPERTIES_BYTES = 1024 * 1024;
const MAX_PLUGIN_JAR_BYTES = 512 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 4096;
const MAX_CENTRAL_DIRECTORY_BYTES = 2 * 1024 * 1024;
const MAX_DESCRIPTOR_BYTES = 256 * 1024;
const MAX_MANIFEST_BYTES = 256 * 1024;
const HASH_CHUNK_BYTES = 256 * 1024;
const MIN_GAME_RULE_VERSION = Object.freeze([1, 21, 9]);

const MANAGED_GAME_RULES = Object.freeze({
  pvp: Object.freeze({ label: 'Player-versus-player combat', minimumVersion: '1.21.9', defaultValue: true }),
  allowEnteringNetherUsingPortals: Object.freeze({ label: 'Nether portal travel', minimumVersion: '1.21.9', defaultValue: true }),
  spawnMonsters: Object.freeze({ label: 'Natural monster spawning', minimumVersion: '1.21.9', defaultValue: true }),
  commandBlocksEnabled: Object.freeze({ label: 'Command blocks', minimumVersion: '1.21.9', defaultValue: true }),
  spawnerBlocksEnabled: Object.freeze({ label: 'Spawner blocks', minimumVersion: '1.21.9', defaultValue: true })
});

function fail(message) {
  throw new Error(message);
}

function text(value, fallback = '') {
  return value === undefined || value === null ? fallback : String(value);
}

function hasControlBytes(value) {
  return /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(text(value));
}

function isSafePropertyKey(value) {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(text(value));
}

function isSafePluginName(value) {
  const candidate = text(value).trim();
  return candidate.length > 0 && candidate.length <= 128 && !hasControlBytes(candidate) && !/[\\/]/.test(candidate);
}

function normalizePluginName(value) {
  const candidate = text(value).trim();
  return isSafePluginName(candidate) ? candidate.toLocaleLowerCase('en-US') : null;
}

function validBoolean(value, fallback = false) {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return fallback;
}

function parseNumericVersion(value) {
  const candidate = text(value).trim();
  if (!/^\d+\.\d+(?:\.\d+)?$/.test(candidate)) return null;
  const pieces = candidate.split('.').map(Number);
  if (pieces.some((piece) => !Number.isSafeInteger(piece) || piece < 0)) return null;
  return pieces;
}

function compareVersions(left, right) {
  const leftParts = Array.isArray(left) ? left : parseNumericVersion(left);
  const rightParts = Array.isArray(right) ? right : parseNumericVersion(right);
  if (!leftParts || !rightParts) return null;
  const count = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < count; index += 1) {
    const difference = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (difference !== 0) return difference > 0 ? 1 : -1;
  }
  return 0;
}

function gameRuleCompatibility(minecraftVersion, ruleName) {
  const definition = MANAGED_GAME_RULES[ruleName];
  if (!definition) {
    return Object.freeze({ state: 'unmanaged', supported: false, minimumVersion: null, selectedVersion: text(minecraftVersion).trim() || null });
  }
  const selected = parseNumericVersion(minecraftVersion);
  if (!selected) {
    return Object.freeze({
      state: 'unknown-version',
      supported: false,
      minimumVersion: definition.minimumVersion,
      selectedVersion: text(minecraftVersion).trim() || null,
      reason: 'The selected Minecraft version is not numeric, so this game rule cannot be sent safely.'
    });
  }
  const supported = compareVersions(selected, MIN_GAME_RULE_VERSION) >= 0;
  return Object.freeze({
    state: supported ? 'supported' : 'requires-newer-version',
    supported,
    minimumVersion: definition.minimumVersion,
    selectedVersion: text(minecraftVersion).trim(),
    reason: supported
      ? `Available for Minecraft ${text(minecraftVersion).trim()}.`
      : `Requires Minecraft ${definition.minimumVersion} or later; the selected target is ${text(minecraftVersion).trim()}.`
  });
}

function normalizeManagedGameRules(input = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const result = {};
  for (const [name, definition] of Object.entries(MANAGED_GAME_RULES)) {
    result[name] = validBoolean(source[name], definition.defaultValue);
  }
  for (const [name, value] of Object.entries(source)) {
    if (Object.prototype.hasOwnProperty.call(result, name)) continue;
    if (/^[A-Za-z][A-Za-z0-9_]{0,127}$/.test(name)) {
      result[name] = typeof value === 'boolean' || typeof value === 'number'
        ? value
        : text(value).slice(0, 512);
    }
  }
  return result;
}

function selectedManagedGameRuleValues(input = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const result = {};
  for (const [name, definition] of Object.entries(MANAGED_GAME_RULES)) {
    if (Object.prototype.hasOwnProperty.call(source, name)) {
      result[name] = validBoolean(source[name], definition.defaultValue);
    }
  }
  return result;
}

async function pathExists(candidate) {
  try {
    await fs.access(candidate);
    return true;
  } catch {
    return false;
  }
}

async function writeAtomically(target, contents) {
  const directory = path.dirname(target);
  await fs.mkdir(directory, { recursive: true });
  const temporary = path.join(directory, `.${path.basename(target)}.${crypto.randomUUID()}.tmp`);
  try {
    await fs.writeFile(temporary, contents, 'utf8');
    await fs.rename(temporary, target);
  } catch (error) {
    await fs.rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}

function normalizePropertyUpdates(updates, knownKeys) {
  const allowed = new Set(Array.isArray(knownKeys) ? knownKeys : []);
  const source = updates && typeof updates === 'object' && !Array.isArray(updates) ? updates : {};
  const result = {};
  for (const [key, value] of Object.entries(source)) {
    if (!allowed.has(key)) continue;
    const normalized = text(value);
    if (/\r|\n/.test(normalized) || hasControlBytes(normalized) || Buffer.byteLength(normalized, 'utf8') > 8192) {
      fail(`The value for server property ${key} is not safe single-line text.`);
    }
    result[key] = normalized;
  }
  return result;
}

async function updateServerPropertiesFile(input = {}) {
  const serverPath = path.resolve(text(input.serverPath).trim());
  if (!path.isAbsolute(serverPath) || !text(input.serverPath).trim()) fail('A server folder is required before writing server.properties.');
  const knownKeys = Array.isArray(input.knownKeys) ? input.knownKeys.filter(isSafePropertyKey) : [];
  if (!knownKeys.length) fail('A non-empty managed server.properties key list is required.');
  const updates = normalizePropertyUpdates(input.updates, knownKeys);
  const target = path.join(serverPath, 'server.properties');
  const exists = await pathExists(target);
  const original = exists ? await fs.readFile(target) : Buffer.alloc(0);
  if (original.length > MAX_SERVER_PROPERTIES_BYTES) fail('server.properties exceeds the local safety limit and was left unchanged.');
  const model = parseGeneratedConfig(original, { knownKeys, maximumBytes: MAX_SERVER_PROPERTIES_BYTES });
  const updated = updateGeneratedConfig(model, updates, { knownKeys });
  const rendered = !exists && updated.text && !updated.text.endsWith(model.defaultEol)
    ? updated.text + model.defaultEol
    : updated.text;
  const nextBytes = Buffer.from(rendered, 'utf8');
  const changed = !exists || !nextBytes.equals(original);
  if (changed) await writeAtomically(target, rendered);
  return Object.freeze({
    path: target,
    changed,
    changedKeys: Object.freeze([...new Set(updated.changedKeys)]),
    preservedUnknownKeys: Object.freeze(updated.preservedUnknownKeys),
    lineEnding: model.defaultEol === '\r\n' ? 'CRLF' : 'LF',
    created: !exists
  });
}

async function lstatRegularFile(filePath, label) {
  const resolvedPath = path.resolve(text(filePath).trim());
  if (!path.isAbsolute(resolvedPath) || !text(filePath).trim()) fail(`${label || 'File'} must be an absolute path.`);
  const stats = await fs.lstat(resolvedPath);
  if (stats.isSymbolicLink() || !stats.isFile()) fail(`${label || 'File'} must be a regular local file, not a link or directory.`);
  if (stats.size < 22 || stats.size > MAX_PLUGIN_JAR_BYTES) fail(`${label || 'Plugin JAR'} is empty, truncated, or exceeds the ${MAX_PLUGIN_JAR_BYTES / 1024 / 1024} MB inspection limit.`);
  return { resolvedPath, stats };
}

async function assertNoLinkedDirectoryPath(directoryPath, label) {
  const raw = text(directoryPath).trim();
  if (!raw) fail(`${label || 'Directory'} must be an absolute path.`);
  const resolvedPath = path.resolve(raw);
  if (!path.isAbsolute(resolvedPath)) fail(`${label || 'Directory'} must be an absolute path.`);
  const root = path.parse(resolvedPath).root;
  const parts = resolvedPath.slice(root.length).split(/[\\/]+/).filter(Boolean);
  let cursor = root;
  for (const part of parts) {
    cursor = path.join(cursor, part);
    try {
      const stats = await fs.lstat(cursor);
      if (stats.isSymbolicLink()) fail(`${label || 'Directory'} cannot include a symbolic-link or reparse-point component.`);
      if (!stats.isDirectory()) fail(`${label || 'Directory'} has a non-directory path component.`);
    } catch (error) {
      if (error?.code === 'ENOENT') break;
      throw error;
    }
  }
  return resolvedPath;
}

async function hashFileSha256(filePath, expectedSize) {
  const handle = await fs.open(filePath, 'r');
  try {
    const hash = crypto.createHash('sha256');
    const buffer = Buffer.alloc(HASH_CHUNK_BYTES);
    let offset = 0;
    while (true) {
      const read = await handle.read(buffer, 0, buffer.length, offset);
      if (!read.bytesRead) break;
      hash.update(buffer.subarray(0, read.bytesRead));
      offset += read.bytesRead;
      if (offset > MAX_PLUGIN_JAR_BYTES) fail('Plugin JAR exceeded the inspection size limit while hashing.');
    }
    if (expectedSize !== undefined && offset !== expectedSize) fail('Plugin JAR changed while its SHA-256 was being calculated.');
    return hash.digest('hex');
  } finally {
    await handle.close();
  }
}

function decodeUtf8(bytes, label) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    fail(`${label || 'Text'} is not valid UTF-8.`);
  }
}

function findZipEndOfCentralDirectory(tail, archiveSize) {
  for (let offset = tail.length - 22; offset >= 0; offset -= 1) {
    if (tail.readUInt32LE(offset) !== 0x06054B50) continue;
    const commentLength = tail.readUInt16LE(offset + 20);
    if (offset + 22 + commentLength !== tail.length) continue;
    const diskNumber = tail.readUInt16LE(offset + 4);
    const centralDirectoryDisk = tail.readUInt16LE(offset + 6);
    const entryCount = tail.readUInt16LE(offset + 10);
    const centralSize = tail.readUInt32LE(offset + 12);
    const centralOffset = tail.readUInt32LE(offset + 16);
    if (diskNumber !== 0 || centralDirectoryDisk !== 0) fail('Multi-disk plugin archives are not supported.');
    if (entryCount === 0xFFFF || centralSize === 0xFFFFFFFF || centralOffset === 0xFFFFFFFF) fail('ZIP64 plugin archives are not supported.');
    if (!entryCount || entryCount > MAX_ZIP_ENTRIES || centralSize > MAX_CENTRAL_DIRECTORY_BYTES || centralOffset + centralSize > archiveSize) {
      fail('Plugin archive central-directory metadata exceeds the local safety limits.');
    }
    return { entryCount, centralOffset, centralSize };
  }
  fail('Plugin JAR does not contain a complete ZIP end-of-central-directory record.');
}

function safeArchiveEntryName(value) {
  if (!value || value.length > 1024 || hasControlBytes(value) || value.includes('\\') || value.startsWith('/') || value.split('/').includes('..')) {
    return null;
  }
  return value;
}

function parseZipCentralDirectory(bytes, expectedEntries) {
  const entries = [];
  let offset = 0;
  while (offset < bytes.length) {
    if (offset + 46 > bytes.length || bytes.readUInt32LE(offset) !== 0x02014B50) fail('Plugin JAR central-directory entry is malformed.');
    const flags = bytes.readUInt16LE(offset + 8);
    const method = bytes.readUInt16LE(offset + 10);
    const compressedSize = bytes.readUInt32LE(offset + 20);
    const uncompressedSize = bytes.readUInt32LE(offset + 24);
    const nameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    const diskStart = bytes.readUInt16LE(offset + 34);
    const localHeaderOffset = bytes.readUInt32LE(offset + 42);
    const end = offset + 46 + nameLength + extraLength + commentLength;
    if (end > bytes.length || diskStart !== 0 || flags & 0x1) fail('Plugin JAR has an unsupported encrypted or malformed entry.');
    const name = safeArchiveEntryName(decodeUtf8(bytes.subarray(offset + 46, offset + 46 + nameLength), 'Plugin JAR entry name'));
    if (!name) fail('Plugin JAR contains an unsafe entry name.');
    entries.push({ name, flags, method, compressedSize, uncompressedSize, localHeaderOffset });
    if (entries.length > MAX_ZIP_ENTRIES) fail('Plugin JAR contains too many archive entries.');
    offset = end;
  }
  if (entries.length !== expectedEntries) fail('Plugin JAR central-directory entry count did not match its end record.');
  return entries;
}

async function readArchiveEntry(handle, archiveSize, entry, maximumBytes) {
  if (!entry || entry.uncompressedSize > maximumBytes || entry.compressedSize > maximumBytes || ![0, 8].includes(entry.method)) {
    fail('Plugin JAR descriptor or manifest exceeds the local inspection bounds or uses an unsupported compression method.');
  }
  const header = Buffer.alloc(30);
  const headerRead = await handle.read(header, 0, header.length, entry.localHeaderOffset);
  if (headerRead.bytesRead !== header.length || header.readUInt32LE(0) !== 0x04034B50) fail('Plugin JAR local file header is malformed.');
  const nameLength = header.readUInt16LE(26);
  const extraLength = header.readUInt16LE(28);
  const payloadOffset = entry.localHeaderOffset + 30 + nameLength + extraLength;
  if (payloadOffset < 0 || payloadOffset + entry.compressedSize > archiveSize) fail('Plugin JAR descriptor or manifest points outside the archive.');
  const compressed = Buffer.alloc(entry.compressedSize);
  const read = await handle.read(compressed, 0, compressed.length, payloadOffset);
  if (read.bytesRead !== compressed.length) fail('Plugin JAR descriptor or manifest is truncated.');
  const result = entry.method === 0
    ? compressed
    : zlib.inflateRawSync(compressed, { maxOutputLength: maximumBytes });
  if (result.length !== entry.uncompressedSize || result.length > maximumBytes) fail('Plugin JAR descriptor or manifest did not match its declared bounded size.');
  return result;
}

function stripYamlComment(value) {
  let quote = null;
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === '\\') {
      escaped = true;
      continue;
    }
    if ((character === '"' || character === "'") && !quote) {
      quote = character;
      continue;
    }
    if (character === quote) {
      quote = null;
      continue;
    }
    if (character === '#' && !quote && (index === 0 || /\s/.test(value[index - 1]))) return value.slice(0, index).trimEnd();
  }
  return value.trimEnd();
}

function yamlScalar(value) {
  const trimmed = stripYamlComment(text(value)).trim();
  if (!trimmed) return '';
  if (/^[!&*]|^(<<:|\||>)/.test(trimmed)) return null;
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    const inner = trimmed.slice(1, -1);
    return hasControlBytes(inner) ? null : inner;
  }
  return hasControlBytes(trimmed) ? null : trimmed;
}

function yamlList(value) {
  const scalar = yamlScalar(value);
  if (scalar === null) return { values: [], unsupported: true };
  if (!scalar) return { values: [], unsupported: false };
  const body = scalar.startsWith('[') && scalar.endsWith(']') ? scalar.slice(1, -1) : scalar;
  const values = [];
  for (const part of body.split(',')) {
    const candidate = yamlScalar(part);
    if (candidate === null) return { values, unsupported: true };
    if (candidate && isSafePluginName(candidate)) values.push(candidate);
  }
  return { values: [...new Set(values)], unsupported: false };
}

function parseLegacyPluginDescriptor(textValue, source) {
  const textBody = text(textValue);
  if (Buffer.byteLength(textBody, 'utf8') > MAX_DESCRIPTOR_BYTES || hasControlBytes(textBody)) fail(`${source} exceeds the descriptor text safety bound.`);
  const fields = Object.create(null);
  const lists = { depend: [], softdepend: [], loadbefore: [], provides: [] };
  const warnings = [];
  let ambiguousIdentity = false;
  let activeList = null;
  for (const rawLine of textBody.split(/\r\n|\n|\r/)) {
    if (!rawLine.trim() || /^\s*#/.test(rawLine)) continue;
    const listItem = rawLine.match(/^\s+-\s+(.+)$/);
    if (activeList && listItem) {
      const parsed = yamlList(listItem[1]);
      if (parsed.unsupported) warnings.push(`Unsupported ${activeList} list syntax was not interpreted.`);
      lists[activeList].push(...parsed.values);
      continue;
    }
    activeList = null;
    const match = rawLine.match(/^([A-Za-z][A-Za-z0-9_-]{0,63}):(?:\s*(.*))?$/);
    if (!match) continue;
    const key = match[1].toLocaleLowerCase('en-US');
    const value = match[2] || '';
    if (Object.prototype.hasOwnProperty.call(lists, key)) {
      if (!value.trim()) {
        activeList = key;
      } else {
        const parsed = yamlList(value);
        if (parsed.unsupported) warnings.push(`Unsupported ${key} list syntax was not interpreted.`);
        lists[key].push(...parsed.values);
      }
      continue;
    }
    if (['name', 'version', 'main', 'api-version'].includes(key)) {
      const scalar = yamlScalar(value);
      if (scalar === null) warnings.push(`Unsupported scalar syntax for ${key} was not interpreted.`);
      else {
        if (Object.prototype.hasOwnProperty.call(fields, key)) {
          warnings.push(`Duplicate ${key} field makes the plugin descriptor ambiguous.`);
          if (key === 'name' || key === 'version') ambiguousIdentity = true;
        }
        fields[key] = scalar;
      }
    }
  }
  return {
    source,
    kind: source === 'paper-plugin.yml' ? 'paper' : 'bukkit',
    name: isSafePluginName(fields.name) ? fields.name : null,
    version: fields.version && fields.version.length <= 128 && !hasControlBytes(fields.version) ? fields.version : null,
    main: fields.main && fields.main.length <= 256 && !hasControlBytes(fields.main) ? fields.main : null,
    apiVersion: fields['api-version'] && fields['api-version'].length <= 64 && !hasControlBytes(fields['api-version']) ? fields['api-version'] : null,
    hardDependencies: [...new Set(lists.depend)],
    softDependencies: [...new Set(lists.softdepend)],
    loadBefore: [...new Set(lists.loadbefore)],
    provides: [...new Set(lists.provides)],
    warnings,
    ambiguousIdentity
  };
}

function indentation(value) {
  const match = /^\s*/.exec(value);
  return match ? match[0].replace(/\t/g, '  ').length : 0;
}

function parsePaperDependencyBlocks(textValue) {
  const result = { hardDependencies: [], softDependencies: [], loadBefore: [], warnings: [] };
  const lines = text(textValue).split(/\r\n|\n|\r/);
  let inDependencies = false;
  let section = null;
  let active = null;
  const commitActive = () => {
    if (!active) return;
    if (active.required) result.hardDependencies.push(active.name);
    else result.softDependencies.push(active.name);
    if (active.load === 'AFTER') result.loadBefore.push(active.name);
    active = null;
  };
  for (const rawLine of lines) {
    const withoutComment = stripYamlComment(rawLine);
    if (!withoutComment.trim()) continue;
    const indent = indentation(withoutComment);
    const trimmed = withoutComment.trim();
    if (indent === 0) {
      commitActive();
      inDependencies = trimmed === 'dependencies:';
      section = null;
      active = null;
      continue;
    }
    if (!inDependencies) continue;
    if (indent === 2 && /^(bootstrap|server):$/.test(trimmed)) {
      commitActive();
      section = trimmed.slice(0, -1);
      active = null;
      continue;
    }
    if (!section) continue;
    if (indent === 4 && /^([^:#][^:]{0,127}):$/.test(trimmed)) {
      commitActive();
      const name = trimmed.slice(0, -1).trim();
      if (!isSafePluginName(name)) {
        result.warnings.push('A Paper dependency name was not safe to interpret.');
        active = null;
      } else {
        active = { name, required: true, load: 'OMIT' };
      }
      continue;
    }
    if (!active || indent < 6) continue;
    const match = trimmed.match(/^(required|load):\s*(.+)$/i);
    if (!match) continue;
    const key = match[1].toLocaleLowerCase('en-US');
    const scalar = yamlScalar(match[2]);
    if (scalar === null) {
      result.warnings.push(`A Paper dependency ${key} value was not safe to interpret.`);
      continue;
    }
    if (key === 'required') active.required = validBoolean(scalar, true);
    if (key === 'load') active.load = ['BEFORE', 'AFTER', 'OMIT'].includes(scalar.toUpperCase()) ? scalar.toUpperCase() : 'OMIT';
  }
  commitActive();
  return {
    hardDependencies: [...new Set(result.hardDependencies)],
    softDependencies: [...new Set(result.softDependencies)],
    loadBefore: [...new Set(result.loadBefore)],
    warnings: result.warnings
  };
}

function parseManifest(textValue) {
  const source = text(textValue);
  if (Buffer.byteLength(source, 'utf8') > MAX_MANIFEST_BYTES || hasControlBytes(source)) fail('JAR manifest exceeds the bounded text limit.');
  const unfolded = [];
  for (const line of source.split(/\r\n|\n|\r/)) {
    if (line.startsWith(' ') && unfolded.length) unfolded[unfolded.length - 1] += line.slice(1);
    else unfolded.push(line);
  }
  const allowed = new Set(['manifest-version', 'implementation-title', 'implementation-version', 'automatic-module-name', 'main-class']);
  const values = Object.create(null);
  for (const line of unfolded) {
    const separator = line.indexOf(':');
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim().toLocaleLowerCase('en-US');
    const value = line.slice(separator + 1).trim();
    if (allowed.has(key) && value && value.length <= 512 && !hasControlBytes(value)) values[key] = value;
  }
  return Object.freeze({
    present: source.length > 0,
    manifestVersion: values['manifest-version'] || null,
    implementationTitle: values['implementation-title'] || null,
    implementationVersion: values['implementation-version'] || null,
    automaticModuleName: values['automatic-module-name'] || null,
    mainClass: values['main-class'] || null
  });
}

function combinePluginDescriptors(legacy, paper) {
  const descriptors = [legacy, paper].filter(Boolean);
  const warnings = descriptors.flatMap((descriptor) => descriptor.warnings || []);
  const identityNames = [...new Set(descriptors.map((descriptor) => descriptor.name).filter(Boolean))];
  const identityVersions = [...new Set(descriptors.map((descriptor) => descriptor.version).filter(Boolean))];
  const identityMains = [...new Set(descriptors.map((descriptor) => descriptor.main).filter(Boolean))];
  const ambiguousIdentity = descriptors.some((descriptor) => descriptor.ambiguousIdentity === true);
  if (identityNames.length > 1) warnings.push('plugin.yml and paper-plugin.yml declare different plugin names.');
  if (identityVersions.length > 1) warnings.push('plugin.yml and paper-plugin.yml declare different plugin versions.');
  const paperDependencies = paper ? parsePaperDependencyBlocks(paper.rawText || '') : { hardDependencies: [], softDependencies: [], loadBefore: [], warnings: [] };
  warnings.push(...paperDependencies.warnings);
  const primary = paper || legacy;
  return Object.freeze({
    kind: legacy && paper ? 'hybrid' : primary?.kind || 'unknown',
    descriptorFiles: Object.freeze(descriptors.map((descriptor) => descriptor.source)),
    name: identityNames[0] || null,
    version: identityVersions[0] || null,
    main: identityMains[0] || null,
    apiVersion: paper?.apiVersion || legacy?.apiVersion || null,
    hardDependencies: Object.freeze([...new Set([...descriptors.flatMap((descriptor) => descriptor.hardDependencies || []), ...paperDependencies.hardDependencies])]),
    softDependencies: Object.freeze([...new Set([...descriptors.flatMap((descriptor) => descriptor.softDependencies || []), ...paperDependencies.softDependencies])]),
    loadBefore: Object.freeze([...new Set([...descriptors.flatMap((descriptor) => descriptor.loadBefore || []), ...paperDependencies.loadBefore])]),
    provides: Object.freeze([...new Set(descriptors.flatMap((descriptor) => descriptor.provides || []))]),
    warnings: Object.freeze(warnings),
    valid: !ambiguousIdentity && identityNames.length === 1 && identityVersions.length <= 1 && Boolean(identityNames[0]) && Boolean(identityVersions[0])
  });
}

function publicPluginDescriptor(descriptor) {
  if (!descriptor) return null;
  return Object.freeze({
    kind: descriptor.kind,
    descriptorFiles: Object.freeze([...(descriptor.descriptorFiles || [])]),
    name: descriptor.name || null,
    version: descriptor.version || null,
    main: descriptor.main || null,
    apiVersion: descriptor.apiVersion || null,
    hardDependencies: Object.freeze([...(descriptor.hardDependencies || [])]),
    softDependencies: Object.freeze([...(descriptor.softDependencies || [])]),
    loadBefore: Object.freeze([...(descriptor.loadBefore || [])]),
    provides: Object.freeze([...(descriptor.provides || [])]),
    warnings: Object.freeze([...(descriptor.warnings || [])]),
    valid: descriptor.valid === true
  });
}

async function inspectPluginJar(filePath) {
  const { resolvedPath, stats: initialStats } = await lstatRegularFile(filePath, 'Plugin JAR');
  const sha256 = await hashFileSha256(resolvedPath, initialStats.size);
  const handle = await fs.open(resolvedPath, 'r');
  try {
    const signature = Buffer.alloc(4);
    const signatureRead = await handle.read(signature, 0, signature.length, 0);
    if (signatureRead.bytesRead !== signature.length || !signature.equals(Buffer.from([0x50, 0x4B, 0x03, 0x04]))) fail('Plugin JAR does not start with a standard ZIP/JAR local-file signature.');
    const tailLength = Math.min(initialStats.size, 65557);
    const tail = Buffer.alloc(tailLength);
    const tailRead = await handle.read(tail, 0, tail.length, initialStats.size - tailLength);
    if (tailRead.bytesRead !== tail.length) fail('Plugin JAR is truncated while reading its ZIP directory.');
    const directory = findZipEndOfCentralDirectory(tail, initialStats.size);
    const central = Buffer.alloc(directory.centralSize);
    const centralRead = await handle.read(central, 0, central.length, directory.centralOffset);
    if (centralRead.bytesRead !== central.length) fail('Plugin JAR central directory is truncated.');
    const entries = parseZipCentralDirectory(central, directory.entryCount);
    const descriptorEntryCounts = new Map();
    for (const entry of entries) {
      const lower = entry.name.toLocaleLowerCase('en-US');
      if (['plugin.yml', 'paper-plugin.yml', 'meta-inf/manifest.mf'].includes(lower)) {
        descriptorEntryCounts.set(lower, (descriptorEntryCounts.get(lower) || 0) + 1);
      }
    }
    for (const [name, count] of descriptorEntryCounts) {
      if (count > 1) fail(`Plugin JAR contains ${count} copies of ${name}; the descriptor or manifest is ambiguous.`);
    }
    const byName = new Map();
    for (const entry of entries) byName.set(entry.name.toLocaleLowerCase('en-US'), entry);
    const pluginEntry = byName.get('plugin.yml') || null;
    const paperEntry = byName.get('paper-plugin.yml') || null;
    if (!pluginEntry && !paperEntry) fail('A plugin JAR must contain a root-level plugin.yml or paper-plugin.yml descriptor.');
    const manifestEntry = byName.get('meta-inf/manifest.mf') || null;
    const readDescriptor = async (entry, source) => {
      if (!entry) return null;
      const rawText = decodeUtf8(await readArchiveEntry(handle, initialStats.size, entry, MAX_DESCRIPTOR_BYTES), source);
      return { ...parseLegacyPluginDescriptor(rawText, source), rawText };
    };
    const legacy = await readDescriptor(pluginEntry, 'plugin.yml');
    const paper = await readDescriptor(paperEntry, 'paper-plugin.yml');
    const descriptor = combinePluginDescriptors(legacy, paper);
    const manifest = manifestEntry
      ? parseManifest(decodeUtf8(await readArchiveEntry(handle, initialStats.size, manifestEntry, MAX_MANIFEST_BYTES), 'JAR manifest'))
      : Object.freeze({ present: false, manifestVersion: null, implementationTitle: null, implementationVersion: null, automaticModuleName: null, mainClass: null });
    const current = await fs.lstat(resolvedPath);
    if (current.isSymbolicLink() || !current.isFile() || current.size !== initialStats.size || current.mtimeMs !== initialStats.mtimeMs) {
      fail('Plugin JAR changed while it was being inspected. Select it again to create a fresh plan.');
    }
    return Object.freeze({
      kind: 'plugin-jar-inspection',
      sourcePath: resolvedPath,
      fileName: path.basename(resolvedPath),
      bytes: initialStats.size,
      sha256,
      archive: Object.freeze({ signature: 'PK\\x03\\x04', entryCount: entries.length, centralDirectoryBytes: directory.centralSize }),
      descriptor: publicPluginDescriptor(descriptor),
      manifest
    });
  } finally {
    await handle.close();
  }
}

function aliasesForDescriptor(descriptor) {
  const aliases = new Set();
  for (const candidate of [descriptor?.name, ...(descriptor?.provides || [])]) {
    const normalized = normalizePluginName(candidate);
    if (normalized) aliases.add(normalized);
  }
  return aliases;
}

function addGraphEdge(graph, from, to) {
  const source = normalizePluginName(from);
  const target = normalizePluginName(to);
  if (!source || !target) return;
  if (!graph.has(source)) graph.set(source, new Set());
  graph.get(source).add(target);
}

function detectDependencyCycles(descriptors) {
  const graph = new Map();
  const aliases = new Map();
  for (const descriptor of descriptors) {
    if (!descriptor?.valid || !descriptor.name) continue;
    const identity = normalizePluginName(descriptor.name);
    if (!identity) continue;
    if (!graph.has(identity)) graph.set(identity, new Set());
    for (const alias of aliasesForDescriptor(descriptor)) aliases.set(alias, identity);
  }
  for (const descriptor of descriptors) {
    const source = normalizePluginName(descriptor?.name);
    if (!source || !graph.has(source)) continue;
    for (const dependency of [...(descriptor.hardDependencies || []), ...(descriptor.softDependencies || [])]) {
      addGraphEdge(graph, source, aliases.get(normalizePluginName(dependency)) || dependency);
    }
    for (const target of descriptor.loadBefore || []) {
      addGraphEdge(graph, source, aliases.get(normalizePluginName(target)) || target);
    }
  }
  const cycles = [];
  const visiting = new Set();
  const visited = new Set();
  const stack = [];
  const visit = (node) => {
    if (visiting.has(node)) {
      const index = stack.indexOf(node);
      cycles.push([...stack.slice(index), node]);
      return;
    }
    if (visited.has(node)) return;
    visiting.add(node);
    stack.push(node);
    for (const target of graph.get(node) || []) {
      if (graph.has(target)) visit(target);
    }
    stack.pop();
    visiting.delete(node);
    visited.add(node);
  };
  for (const node of graph.keys()) visit(node);
  return cycles.map((cycle) => cycle.map((entry) => entry));
}

function assessApiCompatibility(descriptor, server) {
  if (descriptor.kind === 'paper' && text(server.software).toLowerCase() !== 'paper') {
    return Object.freeze({ state: 'incompatible-server-software', blocking: true, reason: 'A paper-plugin.yml-only plugin requires a Paper server target.' });
  }
  const api = parseNumericVersion(descriptor.apiVersion);
  const selected = parseNumericVersion(server.minecraftVersion);
  if (!descriptor.apiVersion) return Object.freeze({ state: 'not-declared', blocking: false, reason: 'The plugin does not declare api-version; compatibility remains unverified.' });
  if (!api || !selected) return Object.freeze({ state: 'unverified', blocking: false, reason: 'The plugin API version or selected Minecraft version cannot be compared safely.' });
  if (api[0] !== selected[0]) {
    return Object.freeze({ state: 'unverified-version-scheme', blocking: false, reason: `The plugin declares api-version ${descriptor.apiVersion}, which uses a different numeric scheme from selected target ${server.minecraftVersion}; compatibility remains unverified.` });
  }
  if (api[0] === 1 && selected[0] === 1 && compareVersions(api, selected) > 0) {
    return Object.freeze({ state: 'target-older-than-api', blocking: true, reason: `The plugin declares api-version ${descriptor.apiVersion}, newer than the selected server target ${server.minecraftVersion}.` });
  }
  return Object.freeze({ state: 'declared-api-not-newer', blocking: false, reason: `The plugin declares api-version ${descriptor.apiVersion}; runtime compatibility still requires the plugin author's support statement.` });
}

function safeJarFileName(sourcePath, descriptor) {
  const sourceName = path.basename(text(sourcePath));
  if (/^[A-Za-z0-9][A-Za-z0-9._ -]{0,180}\.jar$/i.test(sourceName)) return sourceName;
  const name = text(descriptor?.name || 'plugin').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'plugin';
  const version = text(descriptor?.version || 'local').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'local';
  return `${name}-${version}.jar`;
}

function createPluginInstallationPlan(input = {}) {
  const server = input.server || {};
  const source = input.source;
  if (!source?.descriptor) fail('A bounded plugin JAR inspection is required before planning installation.');
  const descriptor = source.descriptor;
  const installed = Array.isArray(input.installed) ? input.installed : [];
  const installedDescriptors = installed.map((item) => item?.descriptor).filter(Boolean);
  const blockers = [];
  const warnings = [...(descriptor.warnings || [])];
  if (!descriptor.valid) blockers.push('The selected JAR does not provide one unambiguous plugin identity and version.');
  if (installed.some((item) => item?.inspectionError || !item?.descriptor)) {
    blockers.push('An existing plugin JAR could not be inspected, so a complete dependency and cycle plan cannot be established.');
  }
  const pluginDirectory = text(server.pluginDirectory).trim() || path.join(text(server.serverPath), 'plugins');
  const destinationFileName = safeJarFileName(source.sourcePath, descriptor);
  const destination = path.join(pluginDirectory, destinationFileName);
  const normalizedDestinationFileName = destinationFileName.toLocaleLowerCase('en-US');
  if (installed.some((item) => text(item?.fileName).toLocaleLowerCase('en-US') === normalizedDestinationFileName)) {
    blockers.push(`A plugin JAR already uses the destination file name ${destinationFileName}.`);
  }
  const pendingFileNames = Array.isArray(input.pendingFileNames) ? input.pendingFileNames : [];
  if (pendingFileNames.some((item) => text(item).toLocaleLowerCase('en-US') === normalizedDestinationFileName)) {
    blockers.push(`A staged plugin JAR already uses the destination file name ${destinationFileName}.`);
  }
  const aliases = new Map();
  for (const installedDescriptor of installedDescriptors) {
    if (!installedDescriptor.valid) {
      blockers.push('An existing plugin JAR has an incomplete descriptor, so a complete dependency and cycle plan cannot be established.');
      continue;
    }
    for (const alias of aliasesForDescriptor(installedDescriptor)) aliases.set(alias, installedDescriptor);
  }
  const identity = normalizePluginName(descriptor.name);
  if (identity && aliases.has(identity)) blockers.push(`A plugin named ${descriptor.name} or one of its declared aliases is already installed.`);
  for (const provided of descriptor.provides || []) {
    const alias = normalizePluginName(provided);
    if (alias && aliases.has(alias)) blockers.push(`The selected plugin provides ${provided}, which is already provided by an installed plugin.`);
  }
  const missingDependencies = [];
  for (const dependency of descriptor.hardDependencies || []) {
    const normalized = normalizePluginName(dependency);
    if (!normalized || !aliases.has(normalized)) missingDependencies.push(dependency);
  }
  if (missingDependencies.length) blockers.push(`Required plugin dependency is not installed: ${missingDependencies.join(', ')}.`);
  const compatibility = assessApiCompatibility(descriptor, server);
  if (compatibility.blocking) blockers.push(compatibility.reason);
  const cycles = detectDependencyCycles([...installedDescriptors, descriptor]);
  if (cycles.length) blockers.push(`Plugin dependency/load-order cycle detected: ${cycles.map((cycle) => cycle.join(' -> ')).join('; ')}.`);
  const state = blockers.length ? 'blocked' : input.serverRunning ? 'ready-to-stage' : 'ready-to-promote';
  return Object.freeze({
    kind: 'plugin-installation-plan',
    state,
    source: Object.freeze({ fileName: source.fileName, bytes: source.bytes, sha256: source.sha256 }),
    descriptor: publicPluginDescriptor(descriptor),
    manifest: source.manifest,
    destination: Object.freeze({ fileName: destinationFileName, path: destination }),
    compatibility,
    missingDependencies: Object.freeze(missingDependencies),
    cycles: Object.freeze(cycles.map((cycle) => Object.freeze(cycle))),
    blockers: Object.freeze(blockers),
    warnings: Object.freeze(warnings),
    serverRunning: input.serverRunning === true,
    staging: input.serverRunning === true
      ? Object.freeze({ state: 'separate-staging-required', location: path.join(text(server.serverPath), '.minecraft-server-studio', 'plugin-staging') })
      : Object.freeze({ state: 'same-filesystem-atomic-promotion', location: pluginDirectory })
  });
}

async function stageAndVerifyPluginJar(input = {}) {
  const rawSourcePath = text(input.sourcePath).trim();
  const rawDestinationDirectory = text(input.destinationDirectory).trim();
  if (!rawSourcePath || !rawDestinationDirectory) fail('A local plugin source and app-managed destination directory are required before staging.');
  const sourcePath = path.resolve(rawSourcePath);
  const destinationDirectory = await assertNoLinkedDirectoryPath(rawDestinationDirectory, 'Plugin staging directory');
  const fileName = text(input.fileName).trim();
  const expectedSha256 = text(input.expectedSha256).trim().toLowerCase();
  if (!/^[A-Za-z0-9][A-Za-z0-9._ -]{0,180}\.jar$/i.test(fileName)) fail('The generated plugin destination file name is unsafe.');
  if (!expectedSha256 || !/^[a-f0-9]{64}$/.test(expectedSha256)) fail('A verified SHA-256 is required before plugin staging.');
  await fs.mkdir(destinationDirectory, { recursive: true });
  await assertNoLinkedDirectoryPath(destinationDirectory, 'Plugin staging directory');
  const finalPath = path.join(destinationDirectory, fileName);
  if (await pathExists(finalPath)) fail(`Refusing to overwrite an existing plugin file: ${fileName}.`);
  const temporary = path.join(destinationDirectory, `.${fileName}.${crypto.randomUUID()}.partial`);
  try {
    await fs.copyFile(sourcePath, temporary);
    const inspected = await inspectPluginJar(temporary);
    if (inspected.sha256 !== expectedSha256) fail('The staged plugin JAR did not match the reviewed source SHA-256.');
    await fs.rename(temporary, finalPath);
    return Object.freeze({ path: finalPath, inspection: inspected });
  } catch (error) {
    await fs.rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}

async function promoteVerifiedPluginJar(input = {}) {
  const rawStagedPath = text(input.stagedPath).trim();
  const rawDestinationPath = text(input.destinationPath).trim();
  if (!rawStagedPath || !rawDestinationPath) fail('A staged plugin source and final destination are required before promotion.');
  const stagedPath = path.resolve(rawStagedPath);
  const destinationPath = path.resolve(rawDestinationPath);
  const expectedSha256 = text(input.expectedSha256).trim().toLowerCase();
  if (!expectedSha256 || !/^[a-f0-9]{64}$/.test(expectedSha256)) fail('A verified SHA-256 is required before plugin promotion.');
  if (await pathExists(destinationPath)) fail(`Refusing to overwrite an existing plugin file: ${path.basename(destinationPath)}.`);
  const inspected = await inspectPluginJar(stagedPath);
  if (inspected.sha256 !== expectedSha256) fail('The staged plugin JAR no longer matches its recorded SHA-256.');
  const destinationDirectory = await assertNoLinkedDirectoryPath(path.dirname(destinationPath), 'Plugin destination directory');
  await fs.mkdir(destinationDirectory, { recursive: true });
  await assertNoLinkedDirectoryPath(destinationDirectory, 'Plugin destination directory');
  await fs.rename(stagedPath, destinationPath);
  return Object.freeze({ path: destinationPath, inspection: inspected });
}

module.exports = Object.freeze({
  MANAGED_GAME_RULES,
  gameRuleCompatibility,
  normalizeManagedGameRules,
  selectedManagedGameRuleValues,
  updateServerPropertiesFile,
  inspectPluginJar,
  createPluginInstallationPlan,
  stageAndVerifyPluginJar,
  promoteVerifiedPluginJar,
  publicPluginDescriptor
});
