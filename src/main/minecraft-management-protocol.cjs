'use strict';

const crypto = require('node:crypto');
const { TextDecoder } = require('node:util');

const PROTOCOL_LIMITS = Object.freeze({
  endpointUrlChars: 2048,
  endpointPathChars: 1024,
  methodNameChars: 160,
  requestBytes: 128 * 1024,
  responseBytes: 512 * 1024,
  timeoutMs: 15_000,
  minTimeoutMs: 1_000,
  maxTimeoutMs: 60_000,
  jsonDepth: 16,
  jsonNodes: 4_000,
  jsonObjectKeys: 256,
  jsonArrayItems: 1_024,
  jsonKeyChars: 256,
  jsonStringChars: 16_384,
  discoverMethods: 512,
  discoverCapabilities: 256,
  requiredCapabilities: 64,
  ignoredWebSocketMessages: 32,
  discoverySnapshotTtlMs: 15 * 60 * 1000,
  discoveryClockSkewMs: 60 * 1000
});

const DISCOVERY_SNAPSHOT_VERSION = 1;

const UNSAFE_JSON_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const METHOD_COLLECTION_FIELDS = Object.freeze([
  'methods',
  'rpcMethods',
  'availableMethods',
  'supportedMethods',
  'operations',
  'commands'
]);
const DISCOVERY_CONTAINER_FIELDS = Object.freeze([
  'rpc',
  'protocol',
  'management',
  'server',
  'services',
  'capabilities',
  'features',
  'interfaces'
]);

// These labels only classify explicitly discovered methods. They do not invent a Paper API.
const OPERATION_HINT_DEFINITIONS = Object.freeze([
  {
    key: 'players.live',
    label: 'Live players',
    domains: ['player', 'players'],
    actions: ['list', 'get', 'read', 'status', 'online', 'live', 'query']
  },
  {
    key: 'players.kick',
    label: 'Remove a player',
    domains: ['player', 'players'],
    actions: ['kick', 'disconnect', 'remove']
  },
  {
    key: 'allowlist.list',
    label: 'Allowlist entries',
    domains: ['allowlist', 'whitelist'],
    actions: ['list', 'get', 'read', 'status']
  },
  {
    key: 'allowlist.add',
    label: 'Add allowlist entry',
    domains: ['allowlist', 'whitelist'],
    actions: ['add', 'grant', 'include']
  },
  {
    key: 'allowlist.remove',
    label: 'Remove allowlist entry',
    domains: ['allowlist', 'whitelist'],
    actions: ['remove', 'delete', 'revoke', 'exclude']
  },
  {
    key: 'allowlist.enabled',
    label: 'Allowlist enforcement',
    domains: ['allowlist', 'whitelist'],
    actions: ['enable', 'disable', 'set', 'update']
  },
  {
    key: 'operators.list',
    label: 'Operators',
    domains: ['operator', 'operators', 'op', 'ops'],
    actions: ['list', 'get', 'read', 'status']
  },
  {
    key: 'operators.add',
    label: 'Add operator',
    domains: ['operator', 'operators', 'op', 'ops'],
    actions: ['add', 'grant', 'promote']
  },
  {
    key: 'operators.remove',
    label: 'Remove operator',
    domains: ['operator', 'operators', 'op', 'ops'],
    actions: ['remove', 'delete', 'revoke', 'demote']
  },
  {
    key: 'settings.get',
    label: 'Read settings',
    domains: ['setting', 'settings', 'config', 'configuration', 'property', 'properties'],
    actions: ['get', 'read', 'list', 'status']
  },
  {
    key: 'settings.set',
    label: 'Change settings',
    domains: ['setting', 'settings', 'config', 'configuration', 'property', 'properties'],
    actions: ['set', 'update', 'patch', 'write']
  },
  {
    key: 'gamerules.get',
    label: 'Read gamerules',
    domains: ['gamerule', 'gamerules'],
    actions: ['get', 'read', 'list', 'status']
  },
  {
    key: 'gamerules.set',
    label: 'Change gamerules',
    domains: ['gamerule', 'gamerules'],
    actions: ['set', 'update', 'patch', 'write']
  },
  {
    key: 'world.save',
    label: 'Save world data',
    domains: ['save', 'snapshot', 'flush'],
    actions: []
  },
  {
    key: 'server.stop',
    label: 'Stop server',
    domains: ['stop', 'shutdown', 'terminate'],
    actions: []
  },
  {
    key: 'notifications.subscribe',
    label: 'Subscribe to notifications',
    domains: ['notification', 'notifications', 'event', 'events', 'subscribe'],
    actions: ['subscribe', 'watch', 'listen']
  },
  {
    key: 'notifications.unsubscribe',
    label: 'Stop notification subscription',
    domains: ['notification', 'notifications', 'event', 'events', 'unsubscribe'],
    actions: ['unsubscribe', 'unwatch', 'unlisten']
  }
]);

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isPlainRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function boundedInteger(value, fallback, minimum, maximum, label) {
  if (value === undefined || value === null) return fallback;
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(label + ' is outside this protocol client\'s supported safety bounds.');
  }
  return value;
}

function normalizeIdentifier(value, maximum = PROTOCOL_LIMITS.methodNameChars) {
  if (typeof value !== 'string') return null;
  const candidate = value.trim();
  if (!candidate || candidate.length > maximum || !/^[A-Za-z][A-Za-z0-9._:/-]*$/.test(candidate)) return null;
  return candidate;
}

function normalizeProtocolVersion(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const version = String(value).trim();
  if (!version || version.length > 128 || !/^[A-Za-z0-9.+_-]+$/.test(version)) return null;
  return version;
}

function parseNumericVersion(value) {
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)(?:\.(0|[1-9]\d*)){0,3}$/.test(value)) return null;
  return value.split('.').map(Number);
}

function compareNumericVersions(left, right) {
  const leftParts = parseNumericVersion(left);
  const rightParts = parseNumericVersion(right);
  if (!leftParts || !rightParts) return null;
  const count = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < count; index += 1) {
    const difference = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (difference !== 0) return difference > 0 ? 1 : -1;
  }
  return 0;
}

function isLoopbackDevelopmentHost(hostname) {
  if (typeof hostname !== 'string') return false;
  const normalized = hostname.trim().replace(/^\[|\]$/g, '').toLowerCase();
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1';
}

function validateManagementEndpoint(value, options = {}) {
  if (typeof value !== 'string' || !value.trim() || value.length > PROTOCOL_LIMITS.endpointUrlChars) {
    throw new Error('A bounded secure Minecraft Server Management Protocol endpoint is required.');
  }
  if (/[\u0000-\u001f\s]/.test(value)) {
    throw new Error('The Minecraft Server Management Protocol endpoint contains unsupported control or whitespace characters.');
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('The Minecraft Server Management Protocol endpoint URL is invalid.');
  }

  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('Minecraft Server Management Protocol endpoints cannot include credentials, query values, or fragments.');
  }
  if (parsed.pathname.length > PROTOCOL_LIMITS.endpointPathChars) {
    throw new Error('The Minecraft Server Management Protocol endpoint path exceeds the supported safety bound.');
  }
  if (parsed.port && (!Number.isInteger(Number(parsed.port)) || Number(parsed.port) < 1 || Number(parsed.port) > 65535)) {
    throw new Error('The Minecraft Server Management Protocol endpoint port is invalid.');
  }

  const allowInsecureLoopback = options?.allowInsecureLoopback === true;
  const isSecureInput = parsed.protocol === 'https:' || parsed.protocol === 'wss:';
  const isInsecureInput = parsed.protocol === 'http:' || parsed.protocol === 'ws:';
  const isLoopback = isLoopbackDevelopmentHost(parsed.hostname);
  if (!isSecureInput && !(isInsecureInput && allowInsecureLoopback && isLoopback)) {
    throw new Error('TLS is required unless explicit loopback development transport is enabled.');
  }

  const wireUrl = new URL(parsed.toString());
  wireUrl.protocol = isSecureInput ? 'wss:' : 'ws:';
  return Object.freeze({
    url: wireUrl.toString(),
    protocol: isSecureInput ? 'wss' : 'ws',
    hostname: wireUrl.hostname,
    isLoopback,
    tls: isSecureInput
  });
}

function validateMethodName(value) {
  const methodName = normalizeIdentifier(value);
  if (!methodName) throw new Error('The protocol method name is invalid or exceeds the supported safety bound.');
  return methodName;
}

function normalizeJsonValue(value, options = {}) {
  const safeOptions = isPlainRecord(options) ? options : {};
  const limits = {
    maxDepth: boundedInteger(safeOptions.maxDepth, PROTOCOL_LIMITS.jsonDepth, 1, PROTOCOL_LIMITS.jsonDepth, 'JSON depth'),
    maxNodes: boundedInteger(safeOptions.maxNodes, PROTOCOL_LIMITS.jsonNodes, 1, PROTOCOL_LIMITS.jsonNodes, 'JSON node count'),
    maxObjectKeys: boundedInteger(safeOptions.maxObjectKeys, PROTOCOL_LIMITS.jsonObjectKeys, 1, PROTOCOL_LIMITS.jsonObjectKeys, 'JSON object key count'),
    maxArrayItems: boundedInteger(safeOptions.maxArrayItems, PROTOCOL_LIMITS.jsonArrayItems, 1, PROTOCOL_LIMITS.jsonArrayItems, 'JSON array item count'),
    maxKeyChars: boundedInteger(safeOptions.maxKeyChars, PROTOCOL_LIMITS.jsonKeyChars, 1, PROTOCOL_LIMITS.jsonKeyChars, 'JSON key length'),
    maxStringChars: boundedInteger(safeOptions.maxStringChars, PROTOCOL_LIMITS.jsonStringChars, 1, PROTOCOL_LIMITS.jsonStringChars, 'JSON string length')
  };
  const state = { nodes: 0, ancestors: new WeakSet() };
  return cloneJsonNode(value, 0, state, limits);
}

function cloneJsonNode(value, depth, state, limits) {
  if (depth > limits.maxDepth) throw new Error('JSON nesting exceeds the supported safety bound.');
  state.nodes += 1;
  if (state.nodes > limits.maxNodes) throw new Error('JSON shape exceeds the supported safety bound.');

  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value.length > limits.maxStringChars) throw new Error('JSON string exceeds the supported safety bound.');
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('JSON numeric values must be finite.');
    return value;
  }
  if (typeof value !== 'object') throw new Error('JSON values cannot contain unsupported types.');
  if (state.ancestors.has(value)) throw new Error('JSON values cannot contain circular references.');
  if (Object.getOwnPropertySymbols(value).length > 0) throw new Error('JSON values cannot contain symbol properties.');

  state.ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      if (value.length > limits.maxArrayItems) throw new Error('JSON array exceeds the supported safety bound.');
      const names = Object.getOwnPropertyNames(value);
      for (const name of names) {
        if (name === 'length') continue;
        if (!/^(0|[1-9]\d*)$/.test(name)) throw new Error('JSON arrays cannot contain named properties.');
      }
      const copy = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor || !hasOwn(descriptor, 'value')) throw new Error('JSON arrays cannot contain sparse or accessor entries.');
        copy.push(cloneJsonNode(descriptor.value, depth + 1, state, limits));
      }
      return copy;
    }

    if (!isPlainRecord(value)) throw new Error('JSON objects must use plain object shapes.');
    const keys = Object.keys(value);
    if (keys.length > limits.maxObjectKeys) throw new Error('JSON object exceeds the supported safety bound.');
    const copy = {};
    for (const key of keys) {
      if (!key || key.length > limits.maxKeyChars || UNSAFE_JSON_KEYS.has(key)) {
        throw new Error('JSON object contains an unsafe key.');
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !hasOwn(descriptor, 'value')) throw new Error('JSON objects cannot contain accessor entries.');
      copy[key] = cloneJsonNode(descriptor.value, depth + 1, state, limits);
    }
    return copy;
  } finally {
    state.ancestors.delete(value);
  }
}

function normalizeJsonParams(value) {
  if (value === undefined) return {};
  if (!Array.isArray(value) && !isPlainRecord(value)) {
    throw new Error('JSON-RPC params must be an object or array.');
  }
  return normalizeJsonValue(value);
}

function cloneMethodDescriptor(descriptor) {
  const copy = { name: descriptor.name };
  if (descriptor.description) copy.description = descriptor.description;
  return copy;
}

function optionalDescription(value) {
  if (typeof value !== 'string') return null;
  const description = value.trim();
  return description && description.length <= 1024 ? description : null;
}

function normalizeMethodDescriptor(candidate, fallbackName) {
  let name = fallbackName;
  let description = null;
  if (typeof candidate === 'string') {
    name = candidate;
  } else if (isPlainRecord(candidate)) {
    name = candidate.name ?? candidate.method ?? candidate.rpcMethod ?? candidate.id ?? fallbackName;
    description = optionalDescription(candidate.description ?? candidate.summary ?? candidate.title);
  }
  if (typeof name !== 'string') return null;

  let normalizedName;
  try {
    normalizedName = validateMethodName(name);
  } catch {
    return null;
  }

  const descriptor = { name: normalizedName };
  if (description) descriptor.description = description;
  return descriptor;
}

function normalizeDiscoverResult(value) {
  const normalizedValue = value === undefined ? {} : normalizeJsonValue(value);
  let root = normalizedValue;
  if (isPlainRecord(root) && root.jsonrpc === '2.0' && hasOwn(root, 'result')) root = root.result;
  if (Array.isArray(root)) root = { methods: root };
  if (!isPlainRecord(root)) root = {};

  const methods = [];
  const seenMethods = new Set();
  const addMethod = (candidate, fallbackName) => {
    if (methods.length >= PROTOCOL_LIMITS.discoverMethods) return;
    const descriptor = normalizeMethodDescriptor(candidate, fallbackName);
    if (!descriptor || seenMethods.has(descriptor.name)) return;
    seenMethods.add(descriptor.name);
    methods.push(descriptor);
  };

  const consumeMethodCollection = (collection) => {
    if (typeof collection === 'string') {
      addMethod(collection);
      return;
    }
    if (Array.isArray(collection)) {
      for (const candidate of collection) addMethod(candidate);
      return;
    }
    if (!isPlainRecord(collection)) return;

    const directDescriptor = normalizeMethodDescriptor(collection);
    if (directDescriptor) {
      addMethod(collection);
      return;
    }
    for (const [methodName, descriptor] of Object.entries(collection)) {
      addMethod(descriptor, methodName);
    }
  };

  const visitDiscoveryContainer = (container, depth = 0) => {
    if (depth > 3) return;
    if (Array.isArray(container)) {
      for (const entry of container) visitDiscoveryContainer(entry, depth + 1);
      return;
    }
    if (!isPlainRecord(container)) return;
    for (const field of METHOD_COLLECTION_FIELDS) {
      if (hasOwn(container, field)) consumeMethodCollection(container[field]);
    }
    for (const field of DISCOVERY_CONTAINER_FIELDS) {
      if (hasOwn(container, field)) visitDiscoveryContainer(container[field], depth + 1);
    }
  };
  visitDiscoveryContainer(root);

  const capabilities = [];
  const seenCapabilities = new Set();
  const addCapability = (candidate) => {
    if (capabilities.length >= PROTOCOL_LIMITS.discoverCapabilities || typeof candidate !== 'string') return;
    const capability = normalizeIdentifier(candidate);
    if (!capability || seenCapabilities.has(capability)) return;
    seenCapabilities.add(capability);
    capabilities.push(capability);
  };
  const capabilitySource = root.capabilities ?? root.features ?? root.extensions;
  if (Array.isArray(capabilitySource)) {
    for (const candidate of capabilitySource) {
      if (typeof candidate === 'string') addCapability(candidate);
      else if (isPlainRecord(candidate)) addCapability(candidate.name ?? candidate.id ?? candidate.capability);
    }
  } else if (isPlainRecord(capabilitySource)) {
    for (const [name, descriptor] of Object.entries(capabilitySource)) {
      if (descriptor === true || descriptor === false || descriptor === null) addCapability(name);
      else if (isPlainRecord(descriptor)) addCapability(descriptor.name ?? descriptor.id ?? name);
    }
  }

  const protocol = normalizeIdentifier(root.protocolName ?? root.protocol ?? root.name, 128);
  const version = normalizeProtocolVersion(root.protocolVersion ?? root.version ?? root.apiVersion);
  return {
    protocol: protocol || null,
    version,
    methods,
    capabilities
  };
}

function endpointFingerprint(endpoint, options = {}) {
  const descriptor = typeof endpoint === 'string'
    ? validateManagementEndpoint(endpoint, { allowInsecureLoopback: options.allowInsecureLoopback === true })
    : endpoint;
  if (!isPlainRecord(descriptor) || typeof descriptor.url !== 'string' || !descriptor.url) {
    throw new Error('A validated Minecraft Server Management Protocol endpoint is required for discovery state.');
  }
  return crypto.createHash('sha256').update(descriptor.url, 'utf8').digest('hex');
}

function normalizeSnapshotTimestamp(value, label) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 64) {
    throw new Error(label + ' is invalid.');
  }
  const epochMs = Date.parse(value);
  if (!Number.isFinite(epochMs)) throw new Error(label + ' is invalid.');
  return { epochMs, value: new Date(epochMs).toISOString() };
}

function normalizeStoredMethodDescriptors(value) {
  if (!Array.isArray(value) || value.length > PROTOCOL_LIMITS.discoverMethods) {
    throw new Error('Saved Minecraft Server Management Protocol method metadata is outside supported safety bounds.');
  }
  const methods = [];
  const seen = new Set();
  for (const candidate of value) {
    if (!isPlainRecord(candidate)) throw new Error('Saved Minecraft Server Management Protocol method metadata is invalid.');
    const keys = Object.keys(candidate).sort();
    const allowed = candidate.description === undefined ? ['name'] : ['description', 'name'];
    if (keys.length !== allowed.length || keys.some((key, index) => key !== allowed[index])) {
      throw new Error('Saved Minecraft Server Management Protocol method metadata has an unsupported shape.');
    }
    const name = validateMethodName(candidate.name);
    if (seen.has(name)) throw new Error('Saved Minecraft Server Management Protocol method metadata contains duplicates.');
    const method = { name };
    if (candidate.description !== undefined) {
      const description = optionalDescription(candidate.description);
      if (!description) throw new Error('Saved Minecraft Server Management Protocol method metadata has an invalid description.');
      method.description = description;
    }
    seen.add(name);
    methods.push(method);
  }
  return methods;
}

function normalizeStoredCapabilities(value) {
  if (!Array.isArray(value) || value.length > PROTOCOL_LIMITS.discoverCapabilities) {
    throw new Error('Saved Minecraft Server Management Protocol capability metadata is outside supported safety bounds.');
  }
  const capabilities = [];
  const seen = new Set();
  for (const candidate of value) {
    const capability = validateMethodName(candidate);
    if (seen.has(capability)) throw new Error('Saved Minecraft Server Management Protocol capability metadata contains duplicates.');
    seen.add(capability);
    capabilities.push(capability);
  }
  return capabilities;
}

function normalizeDiscoverySnapshot(value) {
  if (!isPlainRecord(value)) throw new Error('Saved Minecraft Server Management Protocol discovery metadata is invalid.');
  const expectedKeys = [
    'schemaVersion',
    'endpointFingerprint',
    'discoveredAt',
    'expiresAt',
    'protocol',
    'version',
    'methods',
    'capabilities'
  ];
  const receivedKeys = Object.keys(value).sort();
  const sortedExpected = [...expectedKeys].sort();
  if (receivedKeys.length !== sortedExpected.length || receivedKeys.some((key, index) => key !== sortedExpected[index])) {
    throw new Error('Saved Minecraft Server Management Protocol discovery metadata has an unsupported shape.');
  }
  if (value.schemaVersion !== DISCOVERY_SNAPSHOT_VERSION) {
    throw new Error('Saved Minecraft Server Management Protocol discovery metadata uses an unsupported schema version.');
  }
  if (typeof value.endpointFingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(value.endpointFingerprint)) {
    throw new Error('Saved Minecraft Server Management Protocol discovery metadata is not bound to a valid endpoint.');
  }
  const methods = normalizeStoredMethodDescriptors(value.methods);
  const capabilities = normalizeStoredCapabilities(value.capabilities);

  const discoveredAt = normalizeSnapshotTimestamp(value.discoveredAt, 'The discovery timestamp');
  const expiresAt = normalizeSnapshotTimestamp(value.expiresAt, 'The discovery expiry timestamp');
  const lifetime = expiresAt.epochMs - discoveredAt.epochMs;
  if (lifetime <= 0 || lifetime > PROTOCOL_LIMITS.discoverySnapshotTtlMs) {
    throw new Error('Saved Minecraft Server Management Protocol discovery metadata has an unsafe lifetime.');
  }

  const discovery = normalizeDiscoverResult({
    protocolName: value.protocol,
    protocolVersion: value.version,
    methods,
    capabilities
  });
  if (discovery.methods.length !== methods.length || discovery.capabilities.length !== capabilities.length) {
    throw new Error('Saved Minecraft Server Management Protocol discovery metadata is not canonical.');
  }
  return Object.freeze({
    schemaVersion: DISCOVERY_SNAPSHOT_VERSION,
    endpointFingerprint: value.endpointFingerprint,
    discoveredAt: discoveredAt.value,
    expiresAt: expiresAt.value,
    protocol: discovery.protocol,
    version: discovery.version,
    methods: discovery.methods.map(cloneMethodDescriptor),
    capabilities: [...discovery.capabilities]
  });
}

function createDiscoverySnapshot(endpoint, discovery, now = Date.now()) {
  if (!Number.isFinite(now)) throw new Error('The discovery clock is invalid.');
  const normalizedDiscovery = normalizeDiscoverResult(discovery);
  const discoveredAt = new Date(now);
  const expiresAt = new Date(now + PROTOCOL_LIMITS.discoverySnapshotTtlMs);
  if (Number.isNaN(discoveredAt.getTime()) || Number.isNaN(expiresAt.getTime())) {
    throw new Error('The discovery clock is outside the supported range.');
  }
  return Object.freeze({
    schemaVersion: DISCOVERY_SNAPSHOT_VERSION,
    endpointFingerprint: endpointFingerprint(endpoint),
    discoveredAt: discoveredAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    protocol: normalizedDiscovery.protocol,
    version: normalizedDiscovery.version,
    methods: normalizedDiscovery.methods.map(cloneMethodDescriptor),
    capabilities: [...normalizedDiscovery.capabilities]
  });
}

function discoverySnapshotStatus(value, endpoint, options = {}) {
  if (value === null || value === undefined) return { state: 'missing', snapshot: null };
  const now = options.now === undefined ? Date.now() : options.now;
  if (!Number.isFinite(now)) return { state: 'invalid', snapshot: null };

  let snapshot;
  let expectedFingerprint;
  try {
    snapshot = normalizeDiscoverySnapshot(value);
    expectedFingerprint = endpointFingerprint(endpoint, { allowInsecureLoopback: options.allowInsecureLoopback === true });
  } catch {
    return { state: 'invalid', snapshot: null };
  }
  if (snapshot.endpointFingerprint !== expectedFingerprint) return { state: 'endpoint-mismatch', snapshot: null };

  const discoveredAt = Date.parse(snapshot.discoveredAt);
  const expiresAt = Date.parse(snapshot.expiresAt);
  if (now + PROTOCOL_LIMITS.discoveryClockSkewMs < discoveredAt) return { state: 'invalid', snapshot: null };
  if (now > expiresAt) {
    return {
      state: 'expired',
      snapshot: Object.freeze({
        ...snapshot,
        methods: snapshot.methods.map(cloneMethodDescriptor),
        capabilities: [...snapshot.capabilities]
      })
    };
  }
  return {
    state: 'ready',
    snapshot: Object.freeze({
      ...snapshot,
      methods: snapshot.methods.map(cloneMethodDescriptor),
      capabilities: [...snapshot.capabilities]
    })
  };
}

function discoverySnapshotError(status) {
  if (status === 'expired') {
    return 'Saved Minecraft Server Management Protocol discovery expired. Run rpc.discover again before invoking a method.';
  }
  if (status === 'endpoint-mismatch') {
    return 'Saved Minecraft Server Management Protocol discovery belongs to a different endpoint. Run rpc.discover again.';
  }
  if (status === 'missing') {
    return 'Call discover() before invoking Minecraft Server Management Protocol methods.';
  }
  return 'Saved Minecraft Server Management Protocol discovery metadata is invalid. Run rpc.discover again.';
}

function discoveryFromSnapshot(snapshot) {
  return normalizeDiscoverResult({
    protocolName: snapshot.protocol,
    protocolVersion: snapshot.version,
    methods: snapshot.methods,
    capabilities: snapshot.capabilities
  });
}

function tokenizeMethodName(methodName) {
  return methodName
    .replace(/([a-z0-9])([A-Z])/g, '$1.$2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function methodMatchesOperation(methodName, definition) {
  const tokens = new Set(tokenizeMethodName(methodName));
  const hasDomain = definition.domains.some((domain) => tokens.has(domain));
  if (!hasDomain) return false;
  return definition.actions.length === 0 || definition.actions.some((action) => tokens.has(action));
}

function buildOperationHints(discovery) {
  const normalized = normalizeDiscoverResult(discovery);
  const hints = {};
  for (const definition of OPERATION_HINT_DEFINITIONS) {
    const methods = normalized.methods
      .filter((method) => methodMatchesOperation(method.name, definition))
      .map(cloneMethodDescriptor);
    hints[definition.key] = {
      label: definition.label,
      available: methods.length > 0,
      selectionRequired: methods.length > 1,
      recommendedMethod: methods.length === 1 ? methods[0].name : null,
      methods
    };
  }
  return hints;
}

function normalizeRequiredCapabilities(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > PROTOCOL_LIMITS.requiredCapabilities) {
    throw new Error('Required capabilities are outside this protocol client\'s supported safety bounds.');
  }
  const capabilities = [];
  const seen = new Set();
  for (const candidate of value) {
    const capability = normalizeIdentifier(candidate);
    if (!capability) throw new Error('A required capability is invalid.');
    if (!seen.has(capability)) {
      seen.add(capability);
      capabilities.push(capability);
    }
  }
  return capabilities;
}

function normalizeCompatibilityRequirements(options = {}) {
  if (!isPlainRecord(options)) throw new Error('Compatibility requirements must be a plain object.');
  const allowed = new Set(['minimumProtocolVersion', 'requiredCapabilities']);
  for (const key of Object.keys(options)) {
    if (!allowed.has(key)) throw new Error('Compatibility requirements contain an unsupported field.');
  }
  const minimumProtocolVersion = options.minimumProtocolVersion === undefined || options.minimumProtocolVersion === null
    ? null
    : normalizeProtocolVersion(options.minimumProtocolVersion);
  if (options.minimumProtocolVersion !== undefined && options.minimumProtocolVersion !== null && !parseNumericVersion(minimumProtocolVersion)) {
    throw new Error('The minimum protocol version must be a bounded numeric dotted version.');
  }
  return {
    minimumProtocolVersion,
    requiredCapabilities: normalizeRequiredCapabilities(options.requiredCapabilities)
  };
}

function mergeCompatibilityRequirements(left, right) {
  const primary = normalizeCompatibilityRequirements(left);
  const secondary = normalizeCompatibilityRequirements(right);
  let minimumProtocolVersion = primary.minimumProtocolVersion;
  if (secondary.minimumProtocolVersion) {
    if (!minimumProtocolVersion || compareNumericVersions(secondary.minimumProtocolVersion, minimumProtocolVersion) > 0) {
      minimumProtocolVersion = secondary.minimumProtocolVersion;
    }
  }
  return {
    minimumProtocolVersion,
    requiredCapabilities: [...new Set([...primary.requiredCapabilities, ...secondary.requiredCapabilities])]
  };
}

function evaluateProtocolCompatibility(discovery, requirements = {}) {
  const normalizedRequirements = normalizeCompatibilityRequirements(requirements);
  const normalizedDiscovery = discovery ? normalizeDiscoverResult(discovery) : null;
  if (!normalizedDiscovery) {
    return {
      discovered: false,
      compatible: false,
      versionSatisfied: false,
      missingCapabilities: [...normalizedRequirements.requiredCapabilities]
    };
  }

  const versionComparison = normalizedRequirements.minimumProtocolVersion
    ? compareNumericVersions(normalizedDiscovery.version || '', normalizedRequirements.minimumProtocolVersion)
    : 0;
  const versionSatisfied = normalizedRequirements.minimumProtocolVersion ? versionComparison !== null && versionComparison >= 0 : true;
  const knownCapabilities = new Set(normalizedDiscovery.capabilities);
  const missingCapabilities = normalizedRequirements.requiredCapabilities.filter((capability) => !knownCapabilities.has(capability));
  return {
    discovered: true,
    compatible: versionSatisfied && missingCapabilities.length === 0,
    versionSatisfied,
    missingCapabilities
  };
}

function parseJsonRpcPayload(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Minecraft Server Management Protocol response was not valid JSON.');
  }
  try {
    return normalizeJsonValue(parsed);
  } catch {
    throw new Error('Minecraft Server Management Protocol response exceeded JSON safety bounds.');
  }
}

function unwrapJsonRpcResult(payload, requestId) {
  if (!isPlainRecord(payload) || payload.jsonrpc !== '2.0') {
    throw new Error('Minecraft Server Management Protocol response was not a valid JSON-RPC 2.0 envelope.');
  }
  if (payload.id !== requestId) {
    throw new Error('Minecraft Server Management Protocol response did not match the active request.');
  }

  const hasResult = hasOwn(payload, 'result');
  const hasError = hasOwn(payload, 'error');
  if (hasResult === hasError) {
    throw new Error('Minecraft Server Management Protocol response did not contain exactly one result or error.');
  }
  if (hasError) {
    const code = isPlainRecord(payload.error) && Number.isInteger(payload.error.code) ? payload.error.code : null;
    if (code === null) throw new Error('Minecraft Server Management Protocol returned an RPC error.');
    throw new Error('Minecraft Server Management Protocol returned an RPC error with code ' + code + '.');
  }
  return payload.result;
}

function defaultWebSocketFactory(url) {
  if (typeof globalThis.WebSocket !== 'function') {
    throw new Error('This Electron main-process runtime does not provide a secure WebSocket implementation.');
  }
  return new globalThis.WebSocket(url);
}

function closeSocket(socket) {
  try {
    socket?.close?.(1000);
  } catch {
    // Closing an already-closed socket is harmless.
  }
}

function attachSocketListener(socket, eventName, listener) {
  if (typeof socket?.addEventListener === 'function') {
    socket.addEventListener(eventName, listener);
    return () => socket.removeEventListener?.(eventName, listener);
  }
  if (typeof socket?.on === 'function') {
    socket.on(eventName, listener);
    return () => {
      if (typeof socket.off === 'function') socket.off(eventName, listener);
      else socket.removeListener?.(eventName, listener);
    };
  }
  throw new Error('The WebSocket implementation does not expose event listeners.');
}

function socketEventData(event) {
  return event && typeof event === 'object' && 'data' in event ? event.data : event;
}

async function socketMessageToText(value, maximumBytes) {
  if (typeof value === 'string') {
    if (Buffer.byteLength(value, 'utf8') > maximumBytes) {
      throw new Error('Minecraft Server Management Protocol response exceeded the configured size limit.');
    }
    return value;
  }

  let bytes = null;
  if (value instanceof Uint8Array) bytes = Buffer.from(value);
  else if (value instanceof ArrayBuffer) bytes = Buffer.from(value);
  else if (typeof Blob !== 'undefined' && value instanceof Blob) {
    if (value.size > maximumBytes) throw new Error('Minecraft Server Management Protocol response exceeded the configured size limit.');
    bytes = Buffer.from(await value.arrayBuffer());
  }
  if (!bytes) throw new Error('Minecraft Server Management Protocol response used an unsupported WebSocket message shape.');
  if (bytes.byteLength > maximumBytes) {
    throw new Error('Minecraft Server Management Protocol response exceeded the configured size limit.');
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error('Minecraft Server Management Protocol response was not valid UTF-8 JSON.');
  }
}

function createSocket(factory, endpointUrl) {
  try {
    const socket = factory(endpointUrl);
    if (!socket || typeof socket.send !== 'function') {
      throw new Error('invalid socket');
    }
    return socket;
  } catch {
    throw new Error('Minecraft Server Management Protocol WebSocket could not be opened.');
  }
}

function requestOverWebSocket(socket, requestBody, requestId, timeoutMs, maxResponseBytes) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let opened = false;
    let ignoredMessages = 0;
    let timer = null;
    const cleanups = [];
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      for (const cleanup of cleanups) cleanup();
      closeSocket(socket);
      callback(value);
    };
    const fail = (message) => finish(reject, message instanceof Error ? message : new Error(message));
    const succeed = (result) => finish(resolve, result);
    const send = () => {
      if (opened || settled) return;
      opened = true;
      try {
        socket.send(requestBody);
      } catch {
        fail('Minecraft Server Management Protocol WebSocket request could not be sent.');
      }
    };
    const onMessage = (event) => {
      Promise.resolve()
        .then(async () => {
          const text = await socketMessageToText(socketEventData(event), maxResponseBytes);
          const payload = parseJsonRpcPayload(text);
          if (!isPlainRecord(payload) || payload.jsonrpc !== '2.0' || payload.id !== requestId) {
            ignoredMessages += 1;
            if (ignoredMessages > PROTOCOL_LIMITS.ignoredWebSocketMessages) {
              fail('Minecraft Server Management Protocol WebSocket sent too many unrelated messages.');
            }
            return;
          }
          succeed(unwrapJsonRpcResult(payload, requestId));
        })
        .catch(() => fail('Minecraft Server Management Protocol WebSocket returned an invalid response.'));
    };
    const onError = () => fail('Minecraft Server Management Protocol WebSocket request could not be completed.');
    const onClose = () => fail('Minecraft Server Management Protocol WebSocket closed before the request completed.');

    try {
      cleanups.push(attachSocketListener(socket, 'message', onMessage));
      cleanups.push(attachSocketListener(socket, 'error', onError));
      cleanups.push(attachSocketListener(socket, 'close', onClose));
      cleanups.push(attachSocketListener(socket, 'open', send));
    } catch (error) {
      fail(error);
      return;
    }

    if (settled) return;
    timer = setTimeout(() => {
      fail('Minecraft Server Management Protocol WebSocket request timed out.');
    }, timeoutMs);
    if (socket.readyState === 1) send();
    else if (socket.readyState !== undefined && socket.readyState !== 0) {
      fail('Minecraft Server Management Protocol WebSocket was not in a connectable state.');
    }
  });
}

class MinecraftManagementProtocolClient {
  constructor(options = {}) {
    if (!isPlainRecord(options)) throw new Error('Minecraft Server Management Protocol client options must be a plain object.');
    this.endpoint = validateManagementEndpoint(options.endpoint, {
      allowInsecureLoopback: options.allowInsecureLoopback === true
    });
    this.webSocketFactory = options.webSocketFactory || defaultWebSocketFactory;
    if (typeof this.webSocketFactory !== 'function') {
      throw new Error('Minecraft Server Management Protocol requires a WebSocket factory.');
    }
    this.timeoutMs = boundedInteger(
      options.timeoutMs,
      PROTOCOL_LIMITS.timeoutMs,
      PROTOCOL_LIMITS.minTimeoutMs,
      PROTOCOL_LIMITS.maxTimeoutMs,
      'Minecraft Server Management Protocol request timeout'
    );
    this.maxRequestBytes = boundedInteger(
      options.maxRequestBytes,
      PROTOCOL_LIMITS.requestBytes,
      1024,
      PROTOCOL_LIMITS.requestBytes,
      'Minecraft Server Management Protocol request size'
    );
    this.maxResponseBytes = boundedInteger(
      options.maxResponseBytes,
      PROTOCOL_LIMITS.responseBytes,
      1024,
      PROTOCOL_LIMITS.responseBytes,
      'Minecraft Server Management Protocol response size'
    );
    this._baselineRequirements = normalizeCompatibilityRequirements({
      minimumProtocolVersion: options.minimumProtocolVersion,
      requiredCapabilities: options.requiredCapabilities
    });
    this._requestNumber = 0;
    this._discovery = null;
    this._discoverySnapshot = null;
    this._discoveredMethodNames = new Set();
  }

  validateEndpoint() {
    return Object.freeze({ ...this.endpoint });
  }

  getDiscovery() {
    if (!this._discovery) return null;
    return {
      protocol: this._discovery.protocol,
      version: this._discovery.version,
      methods: this._discovery.methods.map(cloneMethodDescriptor),
      capabilities: [...this._discovery.capabilities],
      discoveredAt: this._discoverySnapshot?.discoveredAt || null,
      expiresAt: this._discoverySnapshot?.expiresAt || null
    };
  }

  getDiscoverySnapshot() {
    if (!this._discoverySnapshot) return null;
    return Object.freeze({
      ...this._discoverySnapshot,
      methods: this._discoverySnapshot.methods.map(cloneMethodDescriptor),
      capabilities: [...this._discoverySnapshot.capabilities]
    });
  }

  getDiscoveredMethods() {
    return this._discovery ? this._discovery.methods.map(cloneMethodDescriptor) : [];
  }

  hasDiscoveredMethod(methodName) {
    try {
      return this._discoveredMethodNames.has(validateMethodName(methodName));
    } catch {
      return false;
    }
  }

  getOperationHints() {
    return buildOperationHints(this._discovery || {});
  }

  getCompatibility(requirements = {}) {
    return evaluateProtocolCompatibility(
      this._discovery,
      mergeCompatibilityRequirements(this._baselineRequirements, requirements)
    );
  }

  clearDiscovery() {
    this._discovery = null;
    this._discoverySnapshot = null;
    this._discoveredMethodNames.clear();
  }

  async discover() {
    const result = await this._sendRpcRequest('rpc.discover', {});
    const discovery = normalizeDiscoverResult(result);
    this._setDiscovery(discovery, createDiscoverySnapshot(this.endpoint, discovery));
    return this.getDiscovery();
  }

  restoreDiscovery(snapshot) {
    const status = discoverySnapshotStatus(snapshot, this.endpoint);
    if (status.state !== 'ready') throw new Error(discoverySnapshotError(status.state));
    this._setDiscovery(discoveryFromSnapshot(status.snapshot), status.snapshot);
    return this.getDiscovery();
  }

  async invokeDiscovered(methodName, params = {}, requirements = {}) {
    const safeMethodName = validateMethodName(methodName);
    if (!this._discoveredMethodNames.has(safeMethodName)) {
      throw new Error('The requested method is not in the current discovery allowlist.');
    }
    this._assertCompatibility(requirements);
    return this._sendRpcRequest(safeMethodName, normalizeJsonParams(params));
  }

  async invokeOperation(operationKey, params = {}, options = {}) {
    if (!isPlainRecord(options)) throw new Error('Operation invocation options must be a plain object.');
    const allowed = new Set(['method', 'minimumProtocolVersion', 'requiredCapabilities']);
    for (const key of Object.keys(options)) {
      if (!allowed.has(key)) throw new Error('Operation invocation options contain an unsupported field.');
    }
    const hint = this.getOperationHints()[operationKey];
    if (!hint) throw new Error('The requested management operation is not supported by this client.');

    let methodName = null;
    if (options.method !== undefined) {
      methodName = validateMethodName(options.method);
      if (!hint.methods.some((method) => method.name === methodName)) {
        throw new Error('The selected method is not a discovered match for this management operation.');
      }
    } else if (hint.recommendedMethod) {
      methodName = hint.recommendedMethod;
    } else {
      throw new Error('Choose an explicit discovered method because this management operation is ambiguous or unavailable.');
    }
    return this.invokeDiscovered(methodName, params, {
      minimumProtocolVersion: options.minimumProtocolVersion,
      requiredCapabilities: options.requiredCapabilities
    });
  }

  _assertCompatibility(requirements) {
    if (!this._discovery) {
      throw new Error('Call discover() before invoking Minecraft Server Management Protocol methods.');
    }
    const freshness = discoverySnapshotStatus(this._discoverySnapshot, this.endpoint);
    if (freshness.state !== 'ready') {
      this.clearDiscovery();
      throw new Error(discoverySnapshotError(freshness.state));
    }
    const compatibility = this.getCompatibility(requirements);
    if (!compatibility.versionSatisfied) {
      throw new Error('The discovered Minecraft Server Management Protocol version does not satisfy the requested compatibility floor.');
    }
    if (compatibility.missingCapabilities.length > 0) {
      throw new Error('The discovered Minecraft Server Management Protocol capabilities do not satisfy this invocation.');
    }
  }

  _setDiscovery(discovery, snapshot) {
    const normalizedDiscovery = normalizeDiscoverResult(discovery);
    const normalizedSnapshot = normalizeDiscoverySnapshot(snapshot);
    this._discovery = normalizedDiscovery;
    this._discoverySnapshot = normalizedSnapshot;
    this._discoveredMethodNames = new Set(normalizedDiscovery.methods.map((method) => method.name));
  }

  async _sendRpcRequest(methodName, params) {
    const safeMethodName = validateMethodName(methodName);
    const safeParams = normalizeJsonParams(params);
    const requestId = 'mss-' + (++this._requestNumber);
    const requestBody = JSON.stringify({
      jsonrpc: '2.0',
      id: requestId,
      method: safeMethodName,
      params: safeParams
    });
    if (Buffer.byteLength(requestBody, 'utf8') > this.maxRequestBytes) {
      throw new Error('Minecraft Server Management Protocol request exceeded the configured size limit.');
    }
    const socket = createSocket(this.webSocketFactory, this.endpoint.url);
    return requestOverWebSocket(socket, requestBody, requestId, this.timeoutMs, this.maxResponseBytes);
  }
}

module.exports = {
  DISCOVERY_SNAPSHOT_VERSION,
  MinecraftManagementProtocolClient,
  OPERATION_HINT_DEFINITIONS,
  PROTOCOL_LIMITS,
  buildOperationHints,
  compareNumericVersions,
  createDiscoverySnapshot,
  discoverySnapshotStatus,
  evaluateProtocolCompatibility,
  isLoopbackDevelopmentHost,
  normalizeDiscoverySnapshot,
  normalizeDiscoverResult,
  normalizeJsonParams,
  normalizeJsonValue,
  validateManagementEndpoint,
  validateMethodName
};
