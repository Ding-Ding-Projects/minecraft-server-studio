'use strict';

/**
 * Safe, side-effect-free planning helpers for Spigot BuildTools.
 *
 * This module never starts a process, writes a file, downloads BuildTools, or
 * retrieves a credential. Its callers use the returned plans to render rich
 * controls and, after an explicit confirmation, pass a narrow execution
 * request to the application-owned runner.
 */

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { TextDecoder } = require('node:util');
const zlib = require('node:zlib');

const OFFICIAL_SPIGOT_LIVE_VERSION_URL = 'https://hub.spigotmc.org/versions/latest.json';
const OFFICIAL_BUILDTOOLS_JAR_URL = 'https://hub.spigotmc.org/jenkins/job/BuildTools/lastSuccessfulBuild/artifact/target/BuildTools.jar';
const DEFAULT_MAX_METADATA_BYTES = 256 * 1024;
const DEFAULT_MAX_CONFIG_BYTES = 1024 * 1024;
const MAX_RAW_FALLBACK_BYTES = 2048;
const MAX_RAW_FALLBACK_TOKENS = 24;
const MAX_PLUGIN_JAR_BYTES = 512 * 1024 * 1024;
const MAX_PLUGIN_YML_BYTES = 256 * 1024;
const MAX_PLUGIN_YML_COMPRESSED_BYTES = 128 * 1024;
const MAX_ZIP_CENTRAL_DIRECTORY_BYTES = 2 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 4096;
const MAX_ICON_BYTES = 4 * 1024 * 1024;

const BUILDTOOLS_ARTIFACTS = Object.freeze({
  spigot: 'Spigot',
  craftbukkit: 'CraftBukkit'
});

const SAFE_RAW_FALLBACK_FLAGS = new Set([
  '--apply-patches',
  '--dev',
  '--generate-docs',
  '--generate-source',
  '--include-test-source',
  '--no-info',
  '--remapped'
]);

const BUILDTOOLS_FLAG_DOCUMENTATION = Object.freeze({
  revision: {
    flag: '--rev',
    description: 'Build the selected Minecraft revision.'
  },
  outputDirectory: {
    flag: '--output-dir',
    description: 'Write generated artifacts only into the isolated BuildTools workspace output directory.'
  },
  compileArtifacts: {
    flag: '--compile',
    description: 'Select the supported generated artifacts, such as Spigot or CraftBukkit.'
  },
  reuseExistingBuild: {
    flag: '--compile-if-changed',
    description: 'Reuse a previously generated artifact only when BuildTools reports that its inputs are unchanged.'
  },
  updatePolicy: {
    flag: '--dont-update',
    description: 'Prevent BuildTools from updating its checkout during this run. The default is to allow its normal update behavior.'
  },
  pullRequest: {
    flag: '--pull-request',
    description: 'Build a reviewed upstream pull request. This is advanced work and requires an explicit risk acknowledgement.'
  },
  disableJavaCheck: {
    flag: '--disable-java-check',
    description: 'Bypass BuildTools Java-version validation. This is a risk override and is never emitted silently.'
  },
  forceCompile: {
    flag: '--force-compile',
    description: 'Force a full compilation. This is a risk override and is never emitted silently.'
  }
});

function fail(message) {
  throw new Error(message);
}

function toText(value, fallback) {
  if (value === undefined || value === null) return fallback === undefined ? '' : fallback;
  return String(value);
}

function hasControlBytes(value) {
  return /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value);
}

function normalizeMinecraftVersion(value) {
  const text = toText(value).trim();
  if (!/^1\.\d+(?:\.\d+)?$/.test(text)) {
    fail('Choose a released numeric Minecraft version such as 1.20.6. Snapshots and free-form revisions are not safe BuildTools inputs.');
  }
  const pieces = text.split('.').map((piece) => Number(piece));
  if (pieces.some((piece) => !Number.isSafeInteger(piece) || piece < 0)) {
    fail('The Minecraft version contains an invalid numeric component.');
  }
  return Object.freeze({
    text,
    major: pieces[0],
    minor: pieces[1],
    patch: pieces[2] || 0
  });
}

function compareMinecraftVersions(leftInput, rightInput) {
  const left = typeof leftInput === 'object' && leftInput && leftInput.text ? leftInput : normalizeMinecraftVersion(leftInput);
  const right = typeof rightInput === 'object' && rightInput && rightInput.text ? rightInput : normalizeMinecraftVersion(rightInput);
  for (const field of ['major', 'minor', 'patch']) {
    if (left[field] < right[field]) return -1;
    if (left[field] > right[field]) return 1;
  }
  return 0;
}

function jdkRequirementForMinecraftVersion(value) {
  const version = normalizeMinecraftVersion(value);
  const java17Threshold = normalizeMinecraftVersion('1.17.1');
  const java21Threshold = normalizeMinecraftVersion('1.20.5');
  let major;
  let reason;

  if (compareMinecraftVersions(version, '1.17') < 0) {
    major = 8;
    reason = 'Minecraft revisions before 1.17 require JDK 8.';
  } else if (compareMinecraftVersions(version, java17Threshold) <= 0) {
    major = 16;
    reason = 'Minecraft 1.17 and 1.17.1 require JDK 16.';
  } else if (compareMinecraftVersions(version, java21Threshold) <= 0) {
    major = 17;
    reason = 'Minecraft revisions after 1.17.1 through 1.20.5 require JDK 17.';
  } else {
    major = 21;
    reason = 'Minecraft revisions after 1.20.5 require JDK 21.';
  }

  return Object.freeze({
    minecraftVersion: version.text,
    minimumMajor: major,
    recommendedMajor: major,
    label: 'JDK ' + major,
    reason,
    automaticInstall: {
      required: true,
      mode: 'app-managed-automatic',
      packageId: 'EclipseAdoptium.Temurin.' + major + '.JDK'
    }
  });
}

function clampInteger(value, fallback, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.floor(number)));
}

async function readBoundedResponse(response, maximumBytes) {
  const header = response.headers && typeof response.headers.get === 'function'
    ? response.headers.get('content-length')
    : null;
  const declaredLength = header === null ? NaN : Number(header);
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    fail('Official version metadata exceeded the configured response limit.');
  }

  if (!response.body || typeof response.body.getReader !== 'function') {
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > maximumBytes) fail('Official version metadata exceeded the configured response limit.');
    return bytes;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      const chunk = Buffer.from(result.value);
      total += chunk.length;
      if (total > maximumBytes) {
        try {
          await reader.cancel();
        } catch {
          // The response has already exceeded the hard application bound.
        }
        fail('Official version metadata exceeded the configured response limit.');
      }
      chunks.push(chunk);
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // Some fetch implementations do not expose a releasable lock.
    }
  }
  return Buffer.concat(chunks, total);
}

function decodeUtf8Strict(bytes, label) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    fail((label || 'Input') + ' was not valid UTF-8 text.');
  }
}

function safeJsonValue(value, depth) {
  const currentDepth = depth || 0;
  if (currentDepth > 8) return '[truncated-depth]';
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return value.slice(0, 2048);
  if (Array.isArray(value)) return value.slice(0, 256).map((item) => safeJsonValue(item, currentDepth + 1));
  if (typeof value === 'object') {
    const result = Object.create(null);
    for (const key of Object.keys(value).slice(0, 256)) {
      if (key === '__proto__' || key === 'prototype' || key === 'constructor') continue;
      result[key] = safeJsonValue(value[key], currentDepth + 1);
    }
    return result;
  }
  return null;
}

function collectVersionStrings(value, collected, depth) {
  const currentDepth = depth || 0;
  if (collected.size >= 128 || currentDepth > 8) return;
  if (typeof value === 'string') {
    if (/^1\.\d+(?:\.\d+)?$/.test(value)) collected.add(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 256)) collectVersionStrings(item, collected, currentDepth + 1);
    return;
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value).slice(0, 256)) collectVersionStrings(item, collected, currentDepth + 1);
  }
}

function normalizeOfficialLiveVersionMetadata(document, fetchedAt) {
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    fail('The official Spigot version endpoint returned an unexpected JSON document.');
  }
  const candidates = new Set();
  collectVersionStrings(document, candidates);
  const versions = [...candidates].sort((left, right) => compareMinecraftVersions(right, left));
  const directLatest = ['name', 'version', 'latest']
    .map((key) => document[key])
    .find((value) => typeof value === 'string' && /^1\.\d+(?:\.\d+)?$/.test(value)) || null;
  const latest = directLatest || versions[0] || null;
  return Object.freeze({
    source: OFFICIAL_SPIGOT_LIVE_VERSION_URL,
    fetchedAt: fetchedAt || new Date().toISOString(),
    latest,
    versions,
    document: safeJsonValue(document)
  });
}

/**
 * Network is intentionally performed only when this exported function is
 * invoked. Module loading and preflight planning never fetch metadata.
 */
async function fetchOfficialLiveVersionMetadata(options) {
  const input = options || {};
  const fetchImplementation = input.fetch || globalThis.fetch;
  if (typeof fetchImplementation !== 'function') {
    fail('This runtime does not provide fetch, so official Spigot version metadata cannot be retrieved.');
  }
  const maximumBytes = clampInteger(input.maximumBytes, DEFAULT_MAX_METADATA_BYTES, 1024, DEFAULT_MAX_METADATA_BYTES);
  const timeoutMs = clampInteger(input.timeoutMs, 15_000, 1000, 60_000);
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    const response = await fetchImplementation(OFFICIAL_SPIGOT_LIVE_VERSION_URL, {
      method: 'GET',
      redirect: 'error',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Minecraft-Server-Studio/0.1.0'
      },
      signal: controller ? controller.signal : undefined
    });
    if (!response || !response.ok) {
      const status = response && Number.isFinite(response.status) ? String(response.status) : 'an unknown';
      fail('Official Spigot version metadata request failed with HTTP ' + status + '.');
    }
    const bytes = await readBoundedResponse(response, maximumBytes);
    const text = decodeUtf8Strict(bytes, 'Official Spigot version metadata');
    let document;
    try {
      document = JSON.parse(text);
    } catch {
      fail('Official Spigot version metadata was not valid JSON.');
    }
    return normalizeOfficialLiveVersionMetadata(document, new Date().toISOString());
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function resolveAbsolutePath(value, label) {
  const text = toText(value).trim();
  if (!text || hasControlBytes(text)) {
    fail((label || 'Path') + ' must be a non-empty absolute path without control characters.');
  }
  if (!path.isAbsolute(text)) {
    fail((label || 'Path') + ' must be absolute. Use the app browse control instead of a relative path.');
  }
  return path.resolve(text);
}

function comparablePath(value) {
  return process.platform === 'win32' ? value.toLocaleLowerCase('en-US') : value;
}

function pathIsInside(parent, candidate) {
  const parentPath = comparablePath(path.resolve(parent));
  const candidatePath = comparablePath(path.resolve(candidate));
  const relative = path.relative(parentPath, candidatePath);
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}

function pathsOverlap(left, right) {
  return pathIsInside(left, right) || pathIsInside(right, left);
}

function normalPathSegments(resolvedPath) {
  const root = path.parse(resolvedPath).root;
  return resolvedPath.slice(root.length).split(/[\\/]+/).filter(Boolean);
}

function configuredRoots(values) {
  if (!Array.isArray(values)) return [];
  const roots = [];
  for (const item of values) {
    try {
      roots.push(resolveAbsolutePath(item, 'Configured safety root'));
    } catch {
      // An invalid optional root cannot be used to authorize a path.
    }
  }
  return roots;
}

function temporaryRoots() {
  const roots = [os.tmpdir(), process.env.TEMP, process.env.TMP];
  if (process.env.LOCALAPPDATA) roots.push(path.join(process.env.LOCALAPPDATA, 'Temp'));
  return configuredRoots(roots.filter((item) => typeof item === 'string' && path.isAbsolute(item)));
}

function hasCloudOrTemporarySegment(resolvedPath) {
  const segments = normalPathSegments(resolvedPath).map((segment) => segment.toLocaleLowerCase('en-US'));
  const unsafe = new Set([
    '.git',
    'node_modules',
    'onedrive',
    'dropbox',
    'google drive',
    'icloud drive',
    'nextcloud',
    'syncthing',
    'creative cloud files',
    'temp',
    'tmp'
  ]);
  return segments.some((segment) => unsafe.has(segment));
}

function assessManagedPath(pathValue, context) {
  const input = context || {};
  let resolvedPath;
  try {
    resolvedPath = resolveAbsolutePath(pathValue, input.label || 'Path');
  } catch (error) {
    return {
      safe: false,
      path: null,
      reasons: [error.message],
      inspectionRequired: false
    };
  }

  const reasons = [];
  const root = path.parse(resolvedPath).root;
  const home = path.resolve(os.homedir());
  if (comparablePath(resolvedPath) === comparablePath(root)) {
    reasons.push('The filesystem root cannot be used for BuildTools or server output.');
  }
  if (comparablePath(resolvedPath) === comparablePath(home) || pathIsInside(resolvedPath, home)) {
    reasons.push('The user home folder or one of its parents cannot be used because a mistake could affect unrelated data.');
  }
  if (hasCloudOrTemporarySegment(resolvedPath)) {
    reasons.push('Synced cloud, repository, dependency, or temporary locations are not allowed for BuildTools or managed server output.');
  }

  const explicitlyUntrusted = [
    ...configuredRoots(input.repositoryRoots),
    ...configuredRoots(input.syncedRoots),
    ...configuredRoots(input.untrustedRoots),
    ...temporaryRoots()
  ];
  for (const unsafeRoot of explicitlyUntrusted) {
    if (pathIsInside(unsafeRoot, resolvedPath)) {
      reasons.push('The selected path is inside a configured repository, synced, or temporary safety root: ' + unsafeRoot + '.');
    }
  }

  if (input.serverHome) {
    try {
      const serverHome = resolveAbsolutePath(input.serverHome, 'Server home');
      if (pathsOverlap(resolvedPath, serverHome)) {
        reasons.push('The BuildTools workspace must be wholly separate from the server home and cannot be its parent or child.');
      }
    } catch (error) {
      reasons.push(error.message);
    }
  }

  return {
    safe: reasons.length === 0,
    path: resolvedPath,
    reasons,
    inspectionRequired: true
  };
}

function assertSafeBuildToolsWorkspace(workspace, context) {
  const assessment = assessManagedPath(workspace, {
    ...(context || {}),
    label: 'BuildTools workspace'
  });
  if (!assessment.safe) fail(assessment.reasons.join(' '));
  return assessment;
}

async function lstatOrNull(fsImplementation, candidate) {
  try {
    return await fsImplementation.lstat(candidate);
  } catch (error) {
    if (error && error.code === 'ENOENT') return null;
    throw error;
  }
}

async function inspectPathMarkers(resolvedPath, fsImplementation) {
  const reasons = [];
  const implementation = fsImplementation || fs;
  const root = path.parse(resolvedPath).root;
  const parts = normalPathSegments(resolvedPath);
  let cursor = root;
  for (const part of parts) {
    cursor = path.join(cursor, part);
    try {
      const stats = await lstatOrNull(implementation, cursor);
      if (!stats) break;
      if (stats.isSymbolicLink()) {
        reasons.push('The selected path includes a symbolic-link or reparse-point component and cannot be trusted for managed output.');
        break;
      }
    } catch {
      reasons.push('The selected path could not be inspected safely.');
      break;
    }
  }

  let ancestor = resolvedPath;
  while (true) {
    try {
      const stats = await lstatOrNull(implementation, ancestor);
      if (stats && stats.isDirectory()) {
        const gitMarker = await lstatOrNull(implementation, path.join(ancestor, '.git'));
        if (gitMarker) {
          reasons.push('The selected path is inside a Git repository rooted at ' + ancestor + '.');
          break;
        }
      }
    } catch {
      reasons.push('The selected path could not be inspected for repository markers.');
      break;
    }
    const parent = path.dirname(ancestor);
    if (parent === ancestor) break;
    ancestor = parent;
  }
  return reasons;
}

async function inspectBuildToolsWorkspacePath(workspace, context) {
  const assessment = assertSafeBuildToolsWorkspace(workspace, context);
  const markerReasons = await inspectPathMarkers(assessment.path, context && context.fs);
  return {
    ...assessment,
    safe: markerReasons.length === 0,
    reasons: [...assessment.reasons, ...markerReasons],
    inspectionRequired: false
  };
}

async function inspectServerHomePath(serverHome, context) {
  const assessment = assessManagedPath(serverHome, {
    ...(context || {}),
    label: 'Server home'
  });
  if (!assessment.safe) return { ...assessment, inspectionRequired: false };
  const markerReasons = await inspectPathMarkers(assessment.path, context && context.fs);
  return {
    ...assessment,
    safe: markerReasons.length === 0,
    reasons: [...assessment.reasons, ...markerReasons],
    inspectionRequired: false
  };
}

function normalizeOperationId(value) {
  const candidate = toText(value || crypto.randomUUID()).trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/.test(candidate)) {
    fail('The BuildTools operation identifier must contain only letters, numbers, and hyphens.');
  }
  return candidate;
}

function createBuildToolsWorkspaceLayout(workspace, operationId) {
  const workspaceRoot = resolveAbsolutePath(workspace, 'BuildTools workspace');
  const id = normalizeOperationId(operationId);
  const operationRoot = path.join(workspaceRoot, 'operations', id);
  return Object.freeze({
    workspaceRoot,
    operationId: id,
    operationRoot,
    downloadDirectory: path.join(operationRoot, 'download'),
    buildDirectory: path.join(operationRoot, 'build'),
    outputDirectory: path.join(operationRoot, 'output'),
    stagingOutputDirectory: path.join(operationRoot, 'staging-output'),
    rollbackDirectory: path.join(operationRoot, 'rollback-records'),
    buildToolsJar: path.join(operationRoot, 'download', 'BuildTools.jar')
  });
}

function normalizeArtifact(value) {
  const key = toText(value).trim().toLocaleLowerCase('en-US');
  if (!Object.prototype.hasOwnProperty.call(BUILDTOOLS_ARTIFACTS, key)) {
    fail('BuildTools can only compile the supported Spigot or CraftBukkit artifact selections.');
  }
  return key;
}

function normalizeTarget(value) {
  const target = toText(value || 'spigot').trim().toLocaleLowerCase('en-US');
  if (!['spigot', 'craftbukkit', 'both'].includes(target)) {
    fail('Choose Spigot, CraftBukkit, or both as the BuildTools target.');
  }
  return target;
}

function normalizeCompileArtifacts(value, target) {
  const fromTarget = target === 'both' ? ['spigot', 'craftbukkit'] : [target];
  const input = value === undefined || value === null ? fromTarget : value;
  if (!Array.isArray(input) || !input.length) {
    fail('Choose at least one BuildTools artifact to compile.');
  }
  const normalized = [...new Set(input.map(normalizeArtifact))];
  if (target !== 'both' && !normalized.includes(target)) {
    fail('The selected target must be included in the compile artifact selection.');
  }
  return normalized;
}

function acknowledged(input, name) {
  const values = input && input.riskAcknowledgements;
  if (Array.isArray(values)) return values.includes(name);
  return Boolean(values && values[name] === true);
}

function parseRawBuildToolsFallback(value) {
  if (value === undefined || value === null || value === '') return [];
  if (typeof value !== 'string') {
    fail('The advanced raw BuildTools fallback must be a single text value that can be safely tokenized.');
  }
  if (Buffer.byteLength(value, 'utf8') > MAX_RAW_FALLBACK_BYTES || hasControlBytes(value)) {
    fail('The advanced raw BuildTools fallback is too large or contains control bytes.');
  }
  if (/[;&|<>$\\\`"'()[\]{}*?!]/.test(value)) {
    fail('The advanced raw BuildTools fallback cannot contain shell syntax, quoting, globbing, or redirection characters.');
  }
  const tokens = value.trim() ? value.trim().split(/\s+/) : [];
  if (tokens.length > MAX_RAW_FALLBACK_TOKENS) {
    fail('The advanced raw BuildTools fallback has too many tokens.');
  }
  for (const token of tokens) {
    if (!/^--[a-z][a-z0-9-]*$/i.test(token) || !SAFE_RAW_FALLBACK_FLAGS.has(token)) {
      fail('The advanced raw BuildTools fallback contains an unsupported flag. Use the structured control for revision, output, update, reuse, pull-request, and risk overrides.');
    }
  }
  return tokens;
}

function composeBuildToolsFlags(input) {
  const options = input || {};
  const revision = normalizeMinecraftVersion(options.revision).text;
  const target = normalizeTarget(options.target);
  const outputDirectory = resolveAbsolutePath(options.outputDirectory, 'BuildTools output directory');
  const compileArtifacts = normalizeCompileArtifacts(options.compileArtifacts, target);
  const outputArtifactNames = compileArtifacts.map((artifact) => BUILDTOOLS_ARTIFACTS[artifact]);
  const argumentsList = ['--rev', revision, '--output-dir', outputDirectory, '--compile', outputArtifactNames.join(',')];
  const emitted = ['revision', 'outputDirectory', 'compileArtifacts'];
  const warnings = [];

  const reuseMode = toText(options.reuseMode || 'full-build').trim();
  if (!['full-build', 'compile-if-changed'].includes(reuseMode)) {
    fail('Choose either a full BuildTools compilation or compile-if-changed reuse mode.');
  }
  if (reuseMode === 'compile-if-changed') {
    argumentsList.push('--compile-if-changed');
    emitted.push('reuseExistingBuild');
    warnings.push('BuildTools may reuse an existing artifact only when it reports unchanged inputs.');
  }

  const updatePolicy = toText(options.updatePolicy || 'allow-update').trim();
  if (!['allow-update', 'do-not-update'].includes(updatePolicy)) {
    fail('Choose either normal BuildTools updates or the explicit do-not-update policy.');
  }
  if (updatePolicy === 'do-not-update') {
    argumentsList.push('--dont-update');
    emitted.push('updatePolicy');
    warnings.push('BuildTools checkout updates are disabled for this run; the generated artifact can be stale.');
  }

  const requestedBooleanFlags = [
    ['applyPatches', '--apply-patches'],
    ['developmentBuild', '--dev'],
    ['generateDocs', '--generate-docs'],
    ['generateSources', '--generate-source'],
    ['includeTestSource', '--include-test-source'],
    ['minimalOutput', '--no-info'],
    ['remappedArtifacts', '--remapped']
  ];
  for (const pair of requestedBooleanFlags) {
    if (options[pair[0]] === true) argumentsList.push(pair[1]);
  }

  if (options.pullRequest !== undefined && options.pullRequest !== null && options.pullRequest !== '') {
    const pullRequest = Number(options.pullRequest);
    if (!Number.isSafeInteger(pullRequest) || pullRequest < 1 || pullRequest > 100000000) {
      fail('The BuildTools pull-request number must be a positive whole number.');
    }
    if (!acknowledged(options, 'pull-request')) {
      fail('Building an upstream pull request requires the explicit pull-request risk acknowledgement.');
    }
    argumentsList.push('--pull-request', String(pullRequest));
    emitted.push('pullRequest');
    warnings.push('This run targets an upstream pull request rather than an ordinary released revision.');
  }

  if (options.disableJavaCheck === true) {
    if (!acknowledged(options, 'disable-java-check')) {
      fail('Bypassing the BuildTools Java check requires the explicit disable-java-check risk acknowledgement.');
    }
    argumentsList.push('--disable-java-check');
    emitted.push('disableJavaCheck');
    warnings.push('BuildTools Java validation is bypassed. The requested JDK requirement remains the supported application policy.');
  }

  if (options.forceCompile === true) {
    if (!acknowledged(options, 'force-compile')) {
      fail('Forcing BuildTools compilation requires the explicit force-compile risk acknowledgement.');
    }
    argumentsList.push('--force-compile');
    emitted.push('forceCompile');
    warnings.push('BuildTools is instructed to force compilation even if it could otherwise reuse output.');
  }

  const rawFallback = parseRawBuildToolsFallback(options.rawFallback);
  if (rawFallback.length) {
    argumentsList.push(...rawFallback);
    warnings.push('Advanced raw fallback flags were tokenized against a small allowlist; shell syntax and protected BuildTools flags were refused.');
  }

  return Object.freeze({
    revision,
    target,
    outputDirectory,
    compileArtifacts,
    arguments: argumentsList,
    rawFallback,
    reuseMode,
    updatePolicy,
    warnings,
    documentation: emitted.map((key) => BUILDTOOLS_FLAG_DOCUMENTATION[key]).filter(Boolean)
  });
}

function safeJarFileName(value, fallback) {
  const name = toText(value || fallback || 'server.jar').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}\.jar$/i.test(name) || path.basename(name) !== name) {
    fail('The promoted JAR name must be a safe local .jar filename.');
  }
  return name;
}

function createJarPromotionPlan(input) {
  const options = input || {};
  const serverHome = resolveAbsolutePath(options.serverHome, 'Server home');
  const buildOutputJar = resolveAbsolutePath(options.buildOutputJar, 'BuildTools output JAR');
  const operationId = normalizeOperationId(options.operationId);
  const finalJarName = safeJarFileName(options.finalJarName, 'server.jar');
  const finalJar = path.join(serverHome, finalJarName);
  const stageDirectory = path.join(serverHome, '.minecraft-server-studio', 'staging', operationId);
  const rollbackDirectory = path.join(serverHome, '.minecraft-server-studio', 'rollback', operationId);
  const stagedJar = path.join(stageDirectory, finalJarName);
  const rollbackJar = path.join(rollbackDirectory, finalJarName + '.previous');

  if (pathsOverlap(buildOutputJar, serverHome)) {
    fail('The BuildTools output JAR must remain outside the server home until the planned stage-and-swap promotion.');
  }
  if (comparablePath(finalJar) === comparablePath(stagedJar) || comparablePath(finalJar) === comparablePath(buildOutputJar)) {
    fail('The JAR promotion plan contains overlapping source, staging, and destination paths.');
  }

  return Object.freeze({
    kind: 'jar-stage-swap-rollback-plan',
    operationId,
    requiresServerStopped: true,
    sourceBuildOutput: buildOutputJar,
    sameFilesystemStage: stagedJar,
    finalJar,
    rollbackJar,
    steps: [
      {
        action: 'verify-generated-jar',
        path: buildOutputJar,
        requirement: 'regular file, bounded size, ZIP/JAR signature accepted'
      },
      {
        action: 'copy-to-server-local-stage',
        from: buildOutputJar,
        to: stagedJar,
        requirement: 'copy only after the generated JAR passes validation'
      },
      {
        action: 'verify-server-local-stage',
        path: stagedJar,
        requirement: 'validate staged bytes before replacing the live JAR'
      },
      {
        action: 'move-current-jar-to-rollback',
        from: finalJar,
        to: rollbackJar,
        optionalWhenMissing: true
      },
      {
        action: 'atomic-rename-stage-to-final',
        from: stagedJar,
        to: finalJar,
        requirement: 'both paths are in the server home, so the executor can use a same-filesystem rename'
      }
    ],
    rollback: [
      {
        action: 'remove-failed-final-jar',
        path: finalJar,
        onlyIfCreatedByThisOperation: true
      },
      {
        action: 'restore-previous-jar',
        from: rollbackJar,
        to: finalJar,
        onlyIfRollbackJarExists: true
      }
    ]
  });
}

function splitConfigLines(text) {
  const parts = text.match(/[^\r\n]*(?:\r\n|\n|\r|$)/g) || [];
  const lines = [];
  for (const part of parts) {
    if (part === '') continue;
    const endingMatch = part.match(/(\r\n|\n|\r)$/);
    const ending = endingMatch ? endingMatch[1] : '';
    lines.push({ raw: ending ? part.slice(0, -ending.length) : part, ending });
  }
  return lines;
}

function findUnescapedConfigSeparator(line) {
  let escaped = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === '\\') {
      escaped = true;
      continue;
    }
    if (character === '=' || character === ':') return index;
  }
  return -1;
}

function normalizeKnownKeys(values) {
  if (!Array.isArray(values)) return null;
  const result = new Set();
  for (const value of values) {
    const key = toText(value).trim();
    if (/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(key)) result.add(key);
  }
  return result;
}

function parseGeneratedConfig(content, options) {
  const input = options || {};
  const maximumBytes = clampInteger(input.maximumBytes, DEFAULT_MAX_CONFIG_BYTES, 1024, DEFAULT_MAX_CONFIG_BYTES);
  const text = Buffer.isBuffer(content)
    ? decodeUtf8Strict(content, 'Generated configuration')
    : toText(content);
  if (Buffer.byteLength(text, 'utf8') > maximumBytes || hasControlBytes(text)) {
    fail('Generated configuration exceeds the safety bound or contains control bytes.');
  }
  const withoutBom = text.startsWith('\uFEFF') ? text.slice(1) : text;
  const knownKeys = normalizeKnownKeys(input.knownKeys);
  const lines = splitConfigLines(withoutBom).map((line, index) => {
    const trimmed = line.raw.trim();
    if (!trimmed) return { ...line, index, type: 'blank' };
    if (trimmed.startsWith('#') || trimmed.startsWith(';')) return { ...line, index, type: 'comment' };
    const separatorIndex = findUnescapedConfigSeparator(line.raw);
    if (separatorIndex < 1) return { ...line, index, type: 'raw' };
    const before = line.raw.slice(0, separatorIndex);
    const key = before.trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(key)) return { ...line, index, type: 'raw' };
    return {
      ...line,
      index,
      type: 'entry',
      key,
      value: line.raw.slice(separatorIndex + 1),
      separator: line.raw[separatorIndex],
      prefix: line.raw.slice(0, separatorIndex),
      unknown: knownKeys ? !knownKeys.has(key) : true
    };
  });
  const defaultEol = text.includes('\r\n') ? '\r\n' : '\n';
  return Object.freeze({
    kind: 'safe-generated-key-value-config',
    textHasBom: text.startsWith('\uFEFF'),
    textHadFinalLineEnding: /(?:\r\n|\n|\r)$/.test(withoutBom),
    defaultEol,
    knownKeys: knownKeys ? [...knownKeys] : null,
    lines
  });
}

function assertSafeConfigEntry(key, value) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(key)) {
    fail('Configuration updates can only address safe key-value property names.');
  }
  if (hasControlBytes(value) || /[\r\n]/.test(value) || Buffer.byteLength(value, 'utf8') > 8192) {
    fail('Configuration values must be single-line bounded text without control bytes.');
  }
}

function renderGeneratedConfig(model) {
  const prefix = model.textHasBom ? '\uFEFF' : '';
  return prefix + model.lines.map((line) => line.raw + line.ending).join('');
}

function updateGeneratedConfig(model, updates, options) {
  if (!model || model.kind !== 'safe-generated-key-value-config' || !Array.isArray(model.lines)) {
    fail('Provide a parsed generated configuration model before applying updates.');
  }
  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
    fail('Configuration updates must be an object of key-value pairs.');
  }
  const input = options || {};
  const allowedKeys = normalizeKnownKeys(input.knownKeys || model.knownKeys);
  if (!allowedKeys) {
    fail('Provide the GUI-managed knownKeys list before updating generated configuration. This preserves every unknown key by default.');
  }
  const lines = model.lines.map((line) => ({ ...line }));
  const changedKeys = [];

  for (const pair of Object.entries(updates)) {
    const key = pair[0];
    const value = toText(pair[1]);
    assertSafeConfigEntry(key, value);
    if (allowedKeys && !allowedKeys.has(key)) {
      fail('Refusing to overwrite unknown configuration key ' + key + '. Unknown keys and comments are preserved verbatim.');
    }
    let targetIndex = -1;
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      if (lines[index].type === 'entry' && lines[index].key === key) {
        targetIndex = index;
        break;
      }
    }
    if (targetIndex >= 0) {
      const target = lines[targetIndex];
      target.value = value;
      target.raw = target.prefix + target.separator + value;
      target.unknown = false;
    } else {
      if (lines.length && lines[lines.length - 1].ending === '') {
        lines[lines.length - 1].ending = model.defaultEol;
      }
      lines.push({
        index: lines.length,
        type: 'entry',
        key,
        value,
        separator: '=',
        prefix: key,
        raw: key + '=' + value,
        ending: model.textHadFinalLineEnding ? model.defaultEol : '',
        unknown: false
      });
    }
    changedKeys.push(key);
  }

  const next = {
    ...model,
    lines
  };
  const unknownKeys = lines.filter((line) => line.type === 'entry' && line.unknown).map((line) => line.key);
  return Object.freeze({
    model: Object.freeze(next),
    text: renderGeneratedConfig(next),
    changedKeys,
    preservedUnknownKeys: [...new Set(unknownKeys)]
  });
}

function crc32(bytes) {
  let crc = 0xFFFFFFFF;
  for (let index = 0; index < bytes.length; index += 1) {
    crc ^= bytes[index];
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function findZipEndOfCentralDirectory(tail, archiveSize) {
  for (let offset = tail.length - 22; offset >= 0; offset -= 1) {
    if (tail.readUInt32LE(offset) !== 0x06054B50) continue;
    const commentLength = tail.readUInt16LE(offset + 20);
    if (offset + 22 + commentLength !== tail.length) continue;
    const diskNumber = tail.readUInt16LE(offset + 4);
    const directoryDisk = tail.readUInt16LE(offset + 6);
    const entryCount = tail.readUInt16LE(offset + 10);
    const centralSize = tail.readUInt32LE(offset + 12);
    const centralOffset = tail.readUInt32LE(offset + 16);
    if (diskNumber !== 0 || directoryDisk !== 0) {
      fail('Multi-disk plugin JAR archives are not supported.');
    }
    if (entryCount === 0xFFFF || centralSize === 0xFFFFFFFF || centralOffset === 0xFFFFFFFF) {
      fail('ZIP64 plugin JAR archives are not supported for plugin.yml inspection.');
    }
    if (entryCount > MAX_ZIP_ENTRIES || centralSize > MAX_ZIP_CENTRAL_DIRECTORY_BYTES || centralOffset + centralSize > archiveSize) {
      fail('Plugin JAR archive metadata exceeds the inspection safety limits.');
    }
    return { entryCount, centralSize, centralOffset };
  }
  fail('The plugin JAR does not contain a valid ZIP central directory.');
}

function decodeZipFileName(bytes) {
  const name = decodeUtf8Strict(bytes, 'ZIP entry name');
  if (hasControlBytes(name) || name.includes('\\') || name.startsWith('/') || name.split('/').includes('..')) {
    fail('The plugin JAR contains an unsafe ZIP entry name.');
  }
  return name;
}

function parseZipCentralDirectory(bytes, expectedEntries) {
  const entries = [];
  let offset = 0;
  while (offset < bytes.length) {
    if (offset + 46 > bytes.length || bytes.readUInt32LE(offset) !== 0x02014B50) {
      fail('Plugin JAR central-directory data is malformed.');
    }
    const flags = bytes.readUInt16LE(offset + 8);
    const method = bytes.readUInt16LE(offset + 10);
    const crc = bytes.readUInt32LE(offset + 16);
    const compressedSize = bytes.readUInt32LE(offset + 20);
    const uncompressedSize = bytes.readUInt32LE(offset + 24);
    const nameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    const diskStart = bytes.readUInt16LE(offset + 34);
    const localHeaderOffset = bytes.readUInt32LE(offset + 42);
    const end = offset + 46 + nameLength + extraLength + commentLength;
    if (end > bytes.length || diskStart !== 0 || compressedSize === 0xFFFFFFFF || uncompressedSize === 0xFFFFFFFF || localHeaderOffset === 0xFFFFFFFF) {
      fail('Plugin JAR central-directory entry uses an unsupported ZIP format.');
    }
    entries.push({
      name: decodeZipFileName(bytes.subarray(offset + 46, offset + 46 + nameLength)),
      flags,
      method,
      crc,
      compressedSize,
      uncompressedSize,
      localHeaderOffset
    });
    offset = end;
  }
  if (entries.length !== expectedEntries) fail('Plugin JAR central-directory entry count did not match its end record.');
  return entries;
}

function selectPluginYmlEntry(entries) {
  const matches = entries.filter((entry) => entry.name.toLocaleLowerCase('en-US') === 'plugin.yml');
  if (matches.length !== 1) {
    fail('A plugin JAR must contain exactly one root-level plugin.yml file.');
  }
  const entry = matches[0];
  if ((entry.flags & 0x0001) !== 0) fail('Encrypted plugin.yml entries cannot be inspected safely.');
  if (![0, 8].includes(entry.method)) fail('plugin.yml uses an unsupported ZIP compression method.');
  if (entry.compressedSize > MAX_PLUGIN_YML_COMPRESSED_BYTES || entry.uncompressedSize > MAX_PLUGIN_YML_BYTES) {
    fail('plugin.yml exceeds the inspection size limit.');
  }
  if (entry.compressedSize > 0 && entry.uncompressedSize / entry.compressedSize > 200) {
    fail('plugin.yml has an unsafe compression ratio.');
  }
  return entry;
}

async function readPluginYmlEntry(readRange, archiveSize, entry) {
  const header = await readRange(entry.localHeaderOffset, 30);
  if (header.length !== 30 || header.readUInt32LE(0) !== 0x04034B50) {
    fail('The plugin.yml local ZIP header is missing or malformed.');
  }
  const localFlags = header.readUInt16LE(6);
  const nameLength = header.readUInt16LE(26);
  const extraLength = header.readUInt16LE(28);
  if ((localFlags & 0x0001) !== 0) fail('Encrypted plugin.yml entries cannot be inspected safely.');
  const dataOffset = entry.localHeaderOffset + 30 + nameLength + extraLength;
  if (dataOffset + entry.compressedSize > archiveSize) {
    fail('plugin.yml points outside the plugin JAR archive.');
  }
  const compressed = await readRange(dataOffset, entry.compressedSize);
  if (compressed.length !== entry.compressedSize) fail('plugin.yml data was truncated.');
  let decoded;
  try {
    decoded = entry.method === 0
      ? compressed
      : zlib.inflateRawSync(compressed, { maxOutputLength: MAX_PLUGIN_YML_BYTES });
  } catch {
    fail('plugin.yml could not be decompressed safely.');
  }
  if (decoded.length !== entry.uncompressedSize || decoded.length > MAX_PLUGIN_YML_BYTES) {
    fail('plugin.yml decompressed to an unexpected or unsafe size.');
  }
  if (crc32(decoded) !== entry.crc) fail('plugin.yml did not match its ZIP CRC.');
  return decodeUtf8Strict(decoded, 'plugin.yml');
}

function stripYamlComment(value) {
  let quote = null;
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (quote === '"' && escaped) {
      escaped = false;
      continue;
    }
    if (quote === '"' && character === '\\') {
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
    if (character === '#' && !quote && (index === 0 || /\s/.test(value[index - 1]))) {
      return value.slice(0, index).trimEnd();
    }
  }
  return value.trimEnd();
}

function safeYamlScalar(value) {
  const trimmed = stripYamlComment(value).trim();
  if (!trimmed) return '';
  if (/^[!&*]|^(<<:|\||>)/.test(trimmed)) return null;
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    const inner = trimmed.slice(1, -1);
    return hasControlBytes(inner) ? null : inner;
  }
  return hasControlBytes(trimmed) ? null : trimmed;
}

function parsePluginYmlText(text) {
  if (Buffer.byteLength(text, 'utf8') > MAX_PLUGIN_YML_BYTES || hasControlBytes(text)) {
    fail('plugin.yml is too large or contains control bytes.');
  }
  const fields = {
    name: null,
    main: null,
    version: null,
    apiVersion: null,
    description: null,
    website: null,
    author: null,
    authors: []
  };
  const warnings = [];
  let activeList = null;
  for (const sourceLine of text.split(/\r\n|\n|\r/)) {
    const line = stripYamlComment(sourceLine);
    if (!line.trim()) continue;
    const listItem = line.match(/^\s*-\s+(.+)$/);
    if (activeList && listItem) {
      const scalar = safeYamlScalar(listItem[1]);
      if (scalar !== null && scalar) fields[activeList].push(scalar);
      else warnings.push('An unsupported list value was left unparsed.');
      continue;
    }
    activeList = null;
    const match = line.match(/^([A-Za-z][A-Za-z0-9_-]{0,63}):(?:\s*(.*))?$/);
    if (!match) continue;
    const key = match[1].toLocaleLowerCase('en-US');
    const value = match[2] || '';
    if (key === 'authors' && !value.trim()) {
      activeList = 'authors';
      continue;
    }
    const scalar = safeYamlScalar(value);
    if (scalar === null) {
      warnings.push('An advanced YAML value for ' + key + ' was preserved as text but not interpreted.');
      continue;
    }
    if (key === 'name') fields.name = scalar;
    else if (key === 'main') fields.main = scalar;
    else if (key === 'version') fields.version = scalar;
    else if (key === 'api-version') fields.apiVersion = scalar;
    else if (key === 'description') fields.description = scalar;
    else if (key === 'website') fields.website = scalar;
    else if (key === 'author') fields.author = scalar;
    else if (key === 'authors') fields.authors = scalar ? scalar.split(',').map((item) => item.trim()).filter(Boolean) : [];
  }
  return Object.freeze({
    rawText: text,
    fields: Object.freeze({
      ...fields,
      authors: Object.freeze([...fields.authors])
    }),
    warnings: Object.freeze(warnings)
  });
}

async function inspectPluginJarBytes(input) {
  const archive = Buffer.isBuffer(input) ? input : Buffer.from(input || []);
  if (!archive.length || archive.length > MAX_PLUGIN_JAR_BYTES) {
    fail('Plugin JAR bytes are empty or exceed the inspection size limit.');
  }
  const tail = archive.subarray(Math.max(0, archive.length - 65557));
  const directory = findZipEndOfCentralDirectory(tail, archive.length);
  const entries = parseZipCentralDirectory(
    archive.subarray(directory.centralOffset, directory.centralOffset + directory.centralSize),
    directory.entryCount
  );
  const entry = selectPluginYmlEntry(entries);
  const rawText = await readPluginYmlEntry(
    async (offset, length) => archive.subarray(offset, offset + length),
    archive.length,
    entry
  );
  return Object.freeze({
    kind: 'plugin-yml-inspection',
    entryName: entry.name,
    compressionMethod: entry.method === 0 ? 'stored' : 'deflate',
    ...parsePluginYmlText(rawText)
  });
}

async function inspectPluginJarFile(filePath) {
  const resolvedPath = resolveAbsolutePath(filePath, 'Plugin JAR');
  if (!/\.jar$/i.test(resolvedPath)) fail('Choose a local .jar plugin file.');
  const handle = await fs.open(resolvedPath, 'r');
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile() || metadata.size < 22 || metadata.size > MAX_PLUGIN_JAR_BYTES) {
      fail('Plugin JAR is not a regular file or exceeds the inspection size limit.');
    }
    const readRange = async (offset, length) => {
      if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset + length > metadata.size) {
        fail('Plugin JAR inspection attempted an invalid archive range.');
      }
      const buffer = Buffer.alloc(length);
      const result = await handle.read(buffer, 0, length, offset);
      return result.bytesRead === length ? buffer : buffer.subarray(0, result.bytesRead);
    };
    const tailLength = Math.min(metadata.size, 65557);
    const directory = findZipEndOfCentralDirectory(await readRange(metadata.size - tailLength, tailLength), metadata.size);
    const entries = parseZipCentralDirectory(
      await readRange(directory.centralOffset, directory.centralSize),
      directory.entryCount
    );
    const entry = selectPluginYmlEntry(entries);
    const rawText = await readPluginYmlEntry(readRange, metadata.size, entry);
    return Object.freeze({
      kind: 'plugin-yml-inspection',
      sourcePath: resolvedPath,
      entryName: entry.name,
      compressionMethod: entry.method === 0 ? 'stored' : 'deflate',
      ...parsePluginYmlText(rawText)
    });
  } finally {
    await handle.close();
  }
}

function invalidIcon(reason) {
  return Object.freeze({
    valid: false,
    format: 'png',
    reasons: [reason]
  });
}

function validateServerIconPng(input) {
  if (!Buffer.isBuffer(input)) return invalidIcon('Select a local PNG file before validating a server icon.');
  if (input.length < 45 || input.length > MAX_ICON_BYTES) {
    return invalidIcon('The proposed icon is empty, truncated, or exceeds the local image safety limit.');
  }
  const signature = '89504e470d0a1a0a';
  if (input.subarray(0, 8).toString('hex') !== signature) {
    return invalidIcon('The proposed icon does not have a PNG byte signature.');
  }

  let offset = 8;
  let width = null;
  let height = null;
  let bitDepth = null;
  let colorType = null;
  let interlace = null;
  let foundIend = false;
  let animated = false;
  let chunkCount = 0;
  while (offset < input.length) {
    if (offset + 12 > input.length || chunkCount >= 256) return invalidIcon('The PNG chunk layout exceeds the image validation limit.');
    const length = input.readUInt32BE(offset);
    const type = input.subarray(offset + 4, offset + 8).toString('ascii');
    const end = offset + 12 + length;
    if (length > MAX_ICON_BYTES || end > input.length || !/^[A-Za-z]{4}$/.test(type)) {
      return invalidIcon('The PNG contains a malformed chunk.');
    }
    const chunkData = input.subarray(offset + 8, offset + 8 + length);
    const expectedCrc = input.readUInt32BE(offset + 8 + length);
    if (crc32(input.subarray(offset + 4, offset + 8 + length)) !== expectedCrc) {
      return invalidIcon('The PNG chunk checksum did not match its bytes.');
    }
    if (chunkCount === 0) {
      if (type !== 'IHDR' || length !== 13) return invalidIcon('The PNG must begin with a complete IHDR header.');
      width = chunkData.readUInt32BE(0);
      height = chunkData.readUInt32BE(4);
      bitDepth = chunkData[8];
      colorType = chunkData[9];
      interlace = chunkData[12];
    }
    if (type === 'acTL') animated = true;
    if (type === 'IEND') {
      if (length !== 0 || end !== input.length) return invalidIcon('The PNG has invalid trailing data after IEND.');
      foundIend = true;
      break;
    }
    offset = end;
    chunkCount += 1;
  }
  if (!foundIend || width !== 64 || height !== 64) {
    return invalidIcon('Minecraft server icons must be a complete 64 by 64 PNG.');
  }
  if (animated) return invalidIcon('Animated PNG files cannot be used as a Minecraft server icon.');
  if (![0, 2, 3, 4, 6].includes(colorType) || ![1, 2, 4, 8, 16].includes(bitDepth) || ![0, 1].includes(interlace)) {
    return invalidIcon('The PNG IHDR reports unsupported color, bit-depth, or interlace metadata.');
  }
  return Object.freeze({
    valid: true,
    format: 'png',
    width,
    height,
    bitDepth,
    colorType,
    interlace,
    hasAlpha: colorType === 4 || colorType === 6
  });
}

function createServerIconPlan(input) {
  const options = input || {};
  const sourceName = toText(options.sourceName || 'selected-image')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim()
    .slice(0, 128) || 'selected-image';
  const validation = validateServerIconPng(options.bytes);
  const targetDirectory = options.serverHome ? resolveAbsolutePath(options.serverHome, 'Server home') : null;
  const targetPath = targetDirectory ? path.join(targetDirectory, 'server-icon.png') : 'server-icon.png';
  if (validation.valid) {
    return Object.freeze({
      kind: 'server-icon-plan',
      status: 'ready-to-stage',
      sourceName,
      targetPath,
      validation,
      generatedImage: false,
      actions: [
        'Ask the operator to confirm the local file copy.',
        'Stage the validated PNG before replacing any existing server-icon.png.'
      ]
    });
  }
  return Object.freeze({
    kind: 'server-icon-plan',
    status: 'conversion-requested',
    sourceName,
    targetPath,
    validation,
    generatedImage: false,
    conversionRequest: {
      required: true,
      localOnly: true,
      outputFormat: 'PNG',
      width: 64,
      height: 64,
      preserveTransparencyWhenPossible: true,
      note: 'This adapter only requests a local conversion plan. It never generates, converts, or writes image bytes.'
    }
  });
}

function containsForbiddenSecretField(value, depth) {
  const currentDepth = depth || 0;
  if (!value || typeof value !== 'object' || currentDepth > 4) return false;
  for (const key of Object.keys(value)) {
    if (/(password|secret|token|credential|privatekey)/i.test(key)) return true;
    if (containsForbiddenSecretField(value[key], currentDepth + 1)) return true;
  }
  return false;
}

function normalizeVaultReference(value) {
  if (value === undefined || value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value) || containsForbiddenSecretField(value)) {
    fail('RCON configuration requires an OS credential-vault reference and must not receive a password or secret value.');
  }
  const type = toText(value.type).trim();
  const provider = toText(value.provider).trim();
  const service = toText(value.service).trim();
  const account = toText(value.account).trim();
  const referenceId = toText(value.referenceId).trim();
  if (type !== 'os-credential-vault' || !provider || !service || !account || !referenceId) {
    fail('RCON configuration requires a complete OS credential-vault reference with type, provider, service, account, and reference identifier.');
  }
  for (const field of [provider, service, account, referenceId]) {
    if (field.length > 160 || hasControlBytes(field)) fail('The OS credential-vault reference contains an unsafe field.');
  }
  return Object.freeze({
    type,
    provider,
    service,
    account,
    referenceId
  });
}

function createRconConfigCard(input) {
  const options = input || {};
  if (containsForbiddenSecretField(options)) {
    fail('RCON configuration must use an OS credential-vault reference, never a password or secret field.');
  }
  const enabled = options.enabled === true;
  const port = options.port === undefined || options.port === null || options.port === '' ? 25575 : Number(options.port);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    fail('RCON port must be a whole number from 1 through 65535.');
  }
  const host = toText(options.host || '127.0.0.1').trim();
  if (!host || host.length > 253 || hasControlBytes(host)) fail('RCON host is invalid.');
  const vaultReference = normalizeVaultReference(options.vaultReference);
  let status;
  if (!enabled) status = vaultReference ? 'disabled-with-vault-reference' : 'disabled';
  else status = vaultReference ? 'ready' : 'needs-os-vault-reference';

  return Object.freeze({
    kind: 'rcon-config-card',
    status,
    enabled,
    host,
    port,
    vaultReference,
    passwordAccepted: false,
    controls: Object.freeze([
      { id: 'enable-rcon', type: 'switch', value: enabled },
      { id: 'rcon-host', type: 'host-picker', value: host },
      { id: 'rcon-port', type: 'bounded-number', minimum: 1, maximum: 65535, value: port },
      {
        id: 'rcon-vault-reference',
        type: 'os-vault-reference-picker',
        requiredWhenEnabled: true,
        state: vaultReference ? 'selected' : 'missing'
      }
    ]),
    recovery: enabled && !vaultReference
      ? 'Choose or create a protected OS credential-vault entry before RCON can be started.'
      : null
  });
}

function autoInstallDependencyPlan(jdkRequirement) {
  return Object.freeze([
    Object.freeze({
      id: 'java-jdk-' + jdkRequirement.minimumMajor,
      label: jdkRequirement.label,
      required: true,
      installMode: 'app-managed-automatic',
      installWhenMissing: true,
      packageId: jdkRequirement.automaticInstall.packageId,
      reason: jdkRequirement.reason
    }),
    Object.freeze({
      id: 'git',
      label: 'Git for Windows',
      required: true,
      installMode: 'app-managed-automatic',
      installWhenMissing: true,
      packageId: 'Git.Git',
      reason: 'BuildTools uses Git while assembling Spigot.'
    })
  ]);
}

function authorityPayload(preflight) {
  return {
    revision: preflight.revision,
    operationId: preflight.operationId,
    workspace: preflight.workspace,
    command: preflight.command,
    promotion: preflight.promotion,
    dependencies: preflight.dependencies,
    jdk: preflight.jdk
  };
}

function authorityDigest(preflight) {
  return crypto.createHash('sha256').update(JSON.stringify(authorityPayload(preflight))).digest('hex');
}

async function createBuildToolsPreflight(input) {
  const options = input || {};
  const revision = normalizeMinecraftVersion(options.revision).text;
  const operationId = normalizeOperationId(options.operationId);
  const serverHome = resolveAbsolutePath(options.serverHome, 'Server home');
  const workspaceAssessment = await inspectBuildToolsWorkspacePath(options.workspace, {
    serverHome,
    repositoryRoots: options.repositoryRoots,
    syncedRoots: options.syncedRoots,
    untrustedRoots: options.untrustedRoots,
    fs: options.fs
  });
  const serverAssessment = await inspectServerHomePath(serverHome, {
    repositoryRoots: options.repositoryRoots,
    syncedRoots: options.syncedRoots,
    untrustedRoots: options.untrustedRoots,
    fs: options.fs
  });
  if (!workspaceAssessment.safe || !serverAssessment.safe) {
    fail([...workspaceAssessment.reasons, ...serverAssessment.reasons].join(' '));
  }

  const workspace = createBuildToolsWorkspaceLayout(workspaceAssessment.path, operationId);
  const flags = composeBuildToolsFlags({
    ...(options.flags || {}),
    revision,
    outputDirectory: workspace.outputDirectory
  });
  const buildOutputJar = path.join(workspace.outputDirectory, 'spigot-' + revision + '.jar');
  const promotion = createJarPromotionPlan({
    serverHome,
    buildOutputJar,
    operationId,
    finalJarName: options.finalJarName || 'server.jar'
  });
  const jdk = jdkRequirementForMinecraftVersion(revision);
  const preflight = {
    kind: 'buildtools-preflight',
    schema: 1,
    operationId,
    revision,
    jdk,
    dependencies: autoInstallDependencyPlan(jdk),
    workspace,
    pathSafety: Object.freeze({
      workspace: workspaceAssessment,
      serverHome: serverAssessment,
      separateFromServerHome: true,
      repositoryChecksPassed: true,
      temporaryAndSyncChecksPassed: true
    }),
    officialVersionMetadata: options.officialVersionMetadata
      ? normalizeOfficialLiveVersionMetadata(options.officialVersionMetadata.document || options.officialVersionMetadata, options.officialVersionMetadata.fetchedAt)
      : Object.freeze({
        state: 'not-fetched',
        source: OFFICIAL_SPIGOT_LIVE_VERSION_URL,
        action: 'Call fetchOfficialLiveVersionMetadata only when the user opens or refreshes the live-version control.'
      }),
    buildTools: Object.freeze({
      downloadUrl: OFFICIAL_BUILDTOOLS_JAR_URL,
      jarPath: workspace.buildToolsJar,
      downloadRequired: true,
      workspaceOnly: true
    }),
    flags,
    command: Object.freeze({
      executable: toText(options.javaExecutable || 'java').trim() || 'java',
      args: Object.freeze(['-jar', workspace.buildToolsJar, ...flags.arguments]),
      cwd: workspace.buildDirectory,
      shell: false,
      processNotStarted: true
    }),
    promotion,
    authority: Object.freeze({
      status: 'requires-explicit-user-confirmation',
      processNotStarted: true,
      confirmationRequired: true,
      confirmationScope: 'Download official BuildTools, build the selected revision in the isolated workspace, then promote only the validated staged JAR using the attached rollback plan.',
      expiresWhenChanged: true
    })
  };
  return Object.freeze({
    ...preflight,
    authority: Object.freeze({
      ...preflight.authority,
      digest: authorityDigest(preflight)
    })
  });
}

function authorizeBuildToolsPreflight(preflight, confirmation) {
  if (!preflight || preflight.kind !== 'buildtools-preflight' || !preflight.authority) {
    fail('A complete BuildTools preflight is required before any execution request can be prepared.');
  }
  const approval = confirmation || {};
  const expectedDigest = authorityDigest(preflight);
  if (approval.confirmed !== true || approval.digest !== expectedDigest || preflight.authority.digest !== expectedDigest) {
    fail('The BuildTools preflight has not received a matching explicit user confirmation. Re-run preflight if any choice changed.');
  }
  return Object.freeze({
    kind: 'authorized-buildtools-execution-request',
    preflightDigest: expectedDigest,
    confirmedAt: toText(approval.confirmedAt || new Date().toISOString()),
    command: preflight.command,
    promotion: preflight.promotion,
    dependencies: preflight.dependencies,
    processNotStarted: true,
    executorContract: 'The application-owned executor must install missing dependencies through the app, validate BuildTools output, and execute only this shell:false command data.'
  });
}

module.exports = Object.freeze({
  OFFICIAL_SPIGOT_LIVE_VERSION_URL,
  OFFICIAL_BUILDTOOLS_JAR_URL,
  BUILDTOOLS_FLAG_DOCUMENTATION,
  normalizeMinecraftVersion,
  compareMinecraftVersions,
  jdkRequirementForMinecraftVersion,
  fetchOfficialLiveVersionMetadata,
  normalizeOfficialLiveVersionMetadata,
  assessManagedPath,
  assertSafeBuildToolsWorkspace,
  inspectBuildToolsWorkspacePath,
  inspectServerHomePath,
  createBuildToolsWorkspaceLayout,
  parseRawBuildToolsFallback,
  composeBuildToolsFlags,
  createJarPromotionPlan,
  parseGeneratedConfig,
  renderGeneratedConfig,
  updateGeneratedConfig,
  inspectPluginJarBytes,
  inspectPluginJarFile,
  parsePluginYmlText,
  validateServerIconPng,
  createServerIconPlan,
  createRconConfigCard,
  createBuildToolsPreflight,
  authorizeBuildToolsPreflight
});
