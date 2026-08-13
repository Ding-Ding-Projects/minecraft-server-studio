'use strict';

/**
 * Typed Paper JAR command-line profile planning.
 *
 * This module builds only direct server arguments that belong after
 * `-jar <server.jar>`. It does not execute Java, inspect a JAR, write a
 * server file, or accept raw operating-system command text. Java/JVM options
 * remain owned by the runtime profile and are deliberately outside this
 * profile's schema.
 */

const path = require('node:path');

const PAPER_CLI_ARGUMENTS = Object.freeze({
  probes: Object.freeze(['--help', '--version']),
  configuration: Object.freeze(['-C', '-P', '-b', '-c', '--paper-dir', '--pidFile']),
  bootstrap: Object.freeze(['--initSettings', '--demo', '--bonusChest', '--safeMode', '--nogui', '--noconsole', '--nojline']),
  overrides: Object.freeze(['-h', '-p', '-s', '-o', '-w', '--server-name', '--serverId']),
  diagnostics: Object.freeze(['--jfrProfile']),
  destructive: Object.freeze(['--forceUpgrade', '--eraseCache', '--recreateRegionFiles'])
});

const DESTRUCTIVE_PROFILE_KEYS = Object.freeze([
  'forceUpgrade',
  'eraseCache',
  'recreateRegionFiles'
]);

const FORBIDDEN_RAW_FIELDS = Object.freeze([
  'args',
  'argFile',
  'expertTokens',
  'javaArgs',
  'javaOptions',
  'jvmArgs',
  'jvmOptions',
  'rawArgs',
  'rawTokens',
  'serverArgs'
]);

const DEFAULT_PROFILE = Object.freeze({
  schema: 1,
  noGui: true,
  disableConsole: false,
  emulateVanillaConsole: false,
  initializeSettingsOnly: false,
  demo: false,
  bonusChest: false,
  safeMode: false,
  jfrProfile: false,
  commandSettingsPath: null,
  bukkitSettingsPath: null,
  serverPropertiesPath: null,
  paperSettingsDirectory: null,
  pluginsDirectory: null,
  pidFilePath: null,
  host: null,
  port: null,
  maxPlayers: null,
  onlineMode: null,
  worldName: null,
  serverName: null,
  serverId: null,
  forceUpgrade: false,
  eraseCache: false,
  recreateRegionFiles: false
});

function profileError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function text(value, fallback = '') {
  return value === undefined || value === null ? fallback : String(value);
}

function sourceObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value;
}

function hasShellSyntax(value) {
  return /[;&|`$<>]/.test(value) || /\$\(|\$\{/.test(value);
}

function requirePlainText(value, label, maximum) {
  const result = text(value).trim();
  if (result.length > maximum || /[\r\n\0]/.test(result) || hasShellSyntax(result)) {
    throw profileError('PAPER_CLI_VALUE_UNSAFE', label + ' contains unsafe control or shell syntax.');
  }
  return result;
}

function normalizeBoolean(value, label, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  throw profileError('PAPER_CLI_BOOLEAN_INVALID', label + ' must be true or false.');
}

function normalizeOptionalBoolean(value, label) {
  if (value === undefined || value === null || value === '') return null;
  return normalizeBoolean(value, label);
}

function normalizeServerRoot(value) {
  const root = requirePlainText(value, 'The server folder', 1_024);
  if (!root || !path.isAbsolute(root)) {
    throw profileError('PAPER_CLI_SERVER_ROOT_INVALID', 'The Paper CLI profile requires an absolute local server folder.');
  }
  return path.resolve(root);
}

function isWithinServerRoot(root, candidate) {
  const relative = path.relative(root, candidate);
  return Boolean(relative) && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}

function normalizeOwnedPath(value, serverRoot, label, kind) {
  const raw = requirePlainText(value, label, 1_024);
  if (!raw) return null;
  if (raw.startsWith('@')) {
    throw profileError('PAPER_CLI_ARGUMENT_FILE_DENIED', label + ' cannot use an argument-file reference.');
  }
  const candidate = path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(serverRoot, raw);
  if (!isWithinServerRoot(serverRoot, candidate)) {
    throw profileError('PAPER_CLI_PATH_OUTSIDE_SERVER', label + ' must stay inside the selected server folder.');
  }
  if (kind === 'file' && candidate === serverRoot) {
    throw profileError('PAPER_CLI_PATH_KIND_INVALID', label + ' must name a file inside the selected server folder.');
  }
  return candidate;
}

function normalizePort(value, label, minimum, maximum) {
  const raw = requirePlainText(value, label, 16);
  if (!raw) return null;
  if (!/^\d+$/.test(raw)) throw profileError('PAPER_CLI_NUMBER_INVALID', label + ' must be a whole number.');
  const number = Number(raw);
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) {
    throw profileError('PAPER_CLI_NUMBER_RANGE', label + ' must be from ' + minimum + ' through ' + maximum + '.');
  }
  return number;
}

function normalizeHost(value) {
  const host = requirePlainText(value, 'Server host override', 253);
  if (!host) return null;
  const hostname = /^[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$/;
  const ipv6 = /^[0-9A-Fa-f:]{2,64}$/;
  if (!hostname.test(host) && !ipv6.test(host)) {
    throw profileError('PAPER_CLI_HOST_INVALID', 'Server host override must be a hostname, IPv4 address, or IPv6 literal without a URL scheme.');
  }
  return host;
}

function normalizeWorldName(value) {
  const world = requirePlainText(value, 'World name', 64);
  if (!world) return null;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(world)) {
    throw profileError('PAPER_CLI_WORLD_INVALID', 'World name must use 1–64 letters, numbers, dots, underscores, or hyphens and cannot contain a path separator.');
  }
  return world;
}

function normalizeServerName(value) {
  const name = requirePlainText(value, 'Server name override', 80);
  return name || null;
}

function normalizeServerId(value) {
  const id = requirePlainText(value, 'Server identifier override', 128);
  if (!id) return null;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(id)) {
    throw profileError('PAPER_CLI_SERVER_ID_INVALID', 'Server identifier must use letters, numbers, dots, underscores, or hyphens.');
  }
  return id;
}

function assertNoRawJvmRoute(source) {
  for (const field of FORBIDDEN_RAW_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(source, field)) continue;
    const value = source[field];
    const nonEmpty = Array.isArray(value) ? value.length > 0 : Boolean(text(value).trim());
    if (nonEmpty) {
      throw profileError(
        'PAPER_CLI_RAW_ROUTE_DENIED',
        'Paper CLI controls accept typed server arguments only. Use the Runtime tab for reviewed JVM settings; raw arguments, argument files, Java agents, native agents, and shell text are blocked.'
      );
    }
  }
}

function assertDestructiveOptionsDisabled(source) {
  const requested = DESTRUCTIVE_PROFILE_KEYS.filter((key) => normalizeBoolean(source[key], key, false));
  if (!requested.length) return;
  throw profileError(
    'PAPER_CLI_DESTRUCTIVE_CONFIRMATION_REQUIRED',
    'The selected Paper upgrade/cache/region operation is disabled until a stored two-key destructive confirmation is bound to an exact launch preflight. No destructive Paper CLI flag was added to this direct launch plan.'
  );
}

function normalizePaperCliProfile(input, options = {}) {
  const source = sourceObject(input);
  const serverRoot = normalizeServerRoot(options.serverRoot);
  assertNoRawJvmRoute(source);
  assertDestructiveOptionsDisabled(source);

  const profile = {
    schema: 1,
    noGui: true,
    disableConsole: normalizeBoolean(source.disableConsole, 'Disable console', false),
    emulateVanillaConsole: normalizeBoolean(source.emulateVanillaConsole, 'Vanilla-style console mode', false),
    initializeSettingsOnly: normalizeBoolean(source.initializeSettingsOnly, 'Initialize settings only', false),
    demo: normalizeBoolean(source.demo, 'Demo world', false),
    bonusChest: normalizeBoolean(source.bonusChest, 'Bonus chest', false),
    safeMode: normalizeBoolean(source.safeMode, 'Safe mode', false),
    jfrProfile: normalizeBoolean(source.jfrProfile, 'Paper JFR profile', false),
    commandSettingsPath: normalizeOwnedPath(source.commandSettingsPath, serverRoot, 'Commands settings path', 'file'),
    bukkitSettingsPath: normalizeOwnedPath(source.bukkitSettingsPath, serverRoot, 'Bukkit settings path', 'file'),
    serverPropertiesPath: normalizeOwnedPath(source.serverPropertiesPath, serverRoot, 'Server properties path', 'file'),
    paperSettingsDirectory: normalizeOwnedPath(source.paperSettingsDirectory, serverRoot, 'Paper settings directory', 'directory'),
    pluginsDirectory: normalizeOwnedPath(source.pluginsDirectory, serverRoot, 'Plugin directory', 'directory'),
    pidFilePath: normalizeOwnedPath(source.pidFilePath, serverRoot, 'PID file path', 'file'),
    host: normalizeHost(source.host),
    port: normalizePort(source.port, 'Server port override', 1, 65_535),
    maxPlayers: normalizePort(source.maxPlayers, 'Maximum players override', 1, 2_147_483_647),
    onlineMode: normalizeOptionalBoolean(source.onlineMode, 'Online-mode override'),
    worldName: normalizeWorldName(source.worldName),
    serverName: normalizeServerName(source.serverName),
    serverId: normalizeServerId(source.serverId),
    forceUpgrade: false,
    eraseCache: false,
    recreateRegionFiles: false
  };

  return Object.freeze({
    ...profile,
    worldPath: profile.worldName ? path.join(serverRoot, profile.worldName) : null,
    pluginJarBoundary: 'Paper accepts a plugin directory, not individual plugin-JAR arguments. Plugin JAR selection, inspection, staging, and promotion remain in the Plugins tab.'
  });
}

function directServerToken(value, label) {
  const token = text(value);
  if (!token || token.length > 1_024 || /[\r\n\0]/.test(token) || hasShellSyntax(token) || token.startsWith('@')) {
    throw profileError('PAPER_CLI_TOKEN_UNSAFE', label + ' is not a safe direct Paper CLI token.');
  }
  if (/^(?:-javaagent:|-agentlib:|-agentpath:|-Xrun|-Xbootclasspath|--class-path$|-cp$|-classpath$|--module-path$|-p$)/i.test(token)) {
    throw profileError('PAPER_CLI_JVM_ROUTE_DENIED', 'Paper server arguments cannot add a Java agent, native agent, class path, or JVM option.');
  }
  return token;
}

function buildPaperCliServerArgs(profile) {
  const source = sourceObject(profile);
  const args = ['--nogui'];
  const addFlag = (enabled, flag) => {
    if (enabled) args.push(flag);
  };
  const addValue = (flag, value, label) => {
    if (value === null || value === undefined || value === '') return;
    args.push(flag, directServerToken(value, label));
  };

  addFlag(source.disableConsole, '--noconsole');
  addFlag(source.emulateVanillaConsole, '--nojline');
  addFlag(source.initializeSettingsOnly, '--initSettings');
  addFlag(source.demo, '--demo');
  addFlag(source.bonusChest, '--bonusChest');
  addFlag(source.safeMode, '--safeMode');
  addFlag(source.jfrProfile, '--jfrProfile');
  addValue('-C', source.commandSettingsPath, 'Commands settings path');
  addValue('-b', source.bukkitSettingsPath, 'Bukkit settings path');
  addValue('-c', source.serverPropertiesPath, 'Server properties path');
  addValue('--paper-dir', source.paperSettingsDirectory, 'Paper settings directory');
  addValue('-P', source.pluginsDirectory, 'Plugin directory');
  addValue('--pidFile', source.pidFilePath, 'PID file path');
  addValue('-h', source.host, 'Server host override');
  addValue('-p', source.port, 'Server port override');
  addValue('-s', source.maxPlayers, 'Maximum players override');
  addValue('-o', source.onlineMode === null || source.onlineMode === undefined ? null : String(source.onlineMode), 'Online-mode override');
  addValue('-w', source.worldName, 'World name');
  addValue('--server-name', source.serverName, 'Server name override');
  addValue('--serverId', source.serverId, 'Server identifier override');

  for (const token of args) directServerToken(token, 'Generated Paper CLI argument');
  return Object.freeze(args);
}

function createPaperCliPreflight(input = {}) {
  const source = sourceObject(input);
  const software = text(source.software).trim().toLowerCase();
  if (software !== 'paper') {
    return Object.freeze({
      state: 'unsupported-flavor',
      message: 'Paper JAR CLI controls are unavailable for this server flavor. Spigot launch and BuildTools arguments remain under their separate explicit controls.',
      serverArgs: Object.freeze([]),
      probes: PAPER_CLI_ARGUMENTS.probes,
      destructiveOptions: Object.freeze({
        state: 'disabled',
        reason: 'Paper destructive upgrade/cache/region flags are unavailable for this server flavor.'
      })
    });
  }

  try {
    const serverRoot = normalizeServerRoot(source.serverRoot);
    const profile = normalizePaperCliProfile(source.profile, { serverRoot });
    const jarPath = normalizeOwnedPath(source.serverJar || path.join(serverRoot, 'server.jar'), serverRoot, 'Server JAR path', 'file');
    if (!jarPath) throw profileError('PAPER_CLI_JAR_REQUIRED', 'A server.jar path is required for the Paper CLI preview.');
    const serverArgs = buildPaperCliServerArgs(profile);
    return Object.freeze({
      state: 'ready',
      message: 'The direct Paper argument vector is valid. Java/runtime, server JAR, EULA, plugin, and lifecycle checks still run again when a server start is requested.',
      profile,
      serverArgs,
      probes: PAPER_CLI_ARGUMENTS.probes,
      preview: Object.freeze({
        executable: '<verified Java executable>',
        jvmBoundary: '<Runtime tab JVM tokens only>',
        jarFlag: '-jar',
        jarPath,
        serverArgs
      }),
      destructiveOptions: Object.freeze({
        state: 'disabled',
        reason: 'Force upgrade, cache erase, and region recreation remain disabled until the existing two-key destructive confirmation can authorize an exact stored launch preflight.'
      })
    });
  } catch (error) {
    return Object.freeze({
      state: 'blocked',
      message: text(error && error.message, 'The Paper CLI profile is invalid.'),
      serverArgs: Object.freeze([]),
      probes: PAPER_CLI_ARGUMENTS.probes,
      destructiveOptions: Object.freeze({
        state: 'disabled',
        reason: 'Force upgrade, cache erase, and region recreation remain disabled until the existing two-key destructive confirmation can authorize an exact stored launch preflight.'
      })
    });
  }
}

module.exports = {
  PAPER_CLI_ARGUMENTS,
  DESTRUCTIVE_PROFILE_KEYS,
  DEFAULT_PROFILE,
  normalizePaperCliProfile,
  buildPaperCliServerArgs,
  createPaperCliPreflight
};
