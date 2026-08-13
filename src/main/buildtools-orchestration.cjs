'use strict';

/**
 * BuildTools planning boundary for the desktop application.
 *
 * This module intentionally creates a direct-argument preview only. It never
 * starts Java, downloads BuildTools, creates a workspace, installs Java or
 * Git, writes a JAR, promotes an artifact, or acquires a plugin. The existing
 * ServerManager dependency discovery methods are consulted only to surface
 * current readiness next to the plan.
 */

const crypto = require('node:crypto');
const os = require('node:os');
const path = require('node:path');
const { spigotJavaRequirement } = require('./java-runtime-manager.cjs');

const OFFICIAL_BUILDTOOLS_JAR_URL = 'https://hub.spigotmc.org/jenkins/job/BuildTools/lastSuccessfulBuild/artifact/target/BuildTools.jar';
const FORBIDDEN_FLAGS = Object.freeze([
  '--disable-certificate-check',
  '--disable-java-check'
]);
const COMPILE_TARGETS = Object.freeze({
  spigot: 'Spigot',
  craftbukkit: 'CraftBukkit'
});
const TYPED_INPUT_KEYS = new Set([
  'revision',
  'workspace',
  'outputDirectoryName',
  'finalName',
  'compileSelection',
  'compileIfChanged',
  'dontUpdate',
  'remapped',
  'generateSource',
  'generateDocs',
  'experimental',
  'developmentBuild',
  'pullRequest'
]);
const JAVA_REQUIREMENT_MATRIX = Object.freeze([
  Object.freeze({ range: 'Before 1.17', feature: 8, state: 'supported' }),
  Object.freeze({ range: '1.17 and 1.17.1', feature: 16, state: 'supported' }),
  Object.freeze({ range: '1.17.2 through 1.20.5', feature: 17, state: 'supported' }),
  Object.freeze({ range: '1.20.6 through 1.21.11', feature: 21, state: 'supported' }),
  Object.freeze({ range: 'Newer or non-1.x revisions', feature: null, state: 'unknown' })
]);

function fail(message) {
  throw new Error(message);
}

function text(value, fallback = '') {
  return value === undefined || value === null ? fallback : String(value);
}

function hasControlCharacter(value) {
  return /[\u0000-\u001F\u007F]/.test(value);
}

function resolveAbsolutePath(value, label) {
  const candidate = text(value).trim();
  if (!candidate || hasControlCharacter(candidate) || !path.isAbsolute(candidate)) {
    fail((label || 'Path') + ' must be a non-empty absolute path without control characters. Use the Browse control.');
  }
  return path.resolve(candidate);
}

function comparablePath(value) {
  return process.platform === 'win32' ? path.resolve(value).toLocaleLowerCase('en-US') : path.resolve(value);
}

function pathsOverlap(left, right) {
  const first = comparablePath(left);
  const second = comparablePath(right);
  const firstRelative = path.relative(first, second);
  const secondRelative = path.relative(second, first);
  const inside = (relative) => relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
  return inside(firstRelative) || inside(secondRelative);
}

function pathSegments(value) {
  const root = path.parse(value).root;
  return value.slice(root.length).split(/[\\/]+/).filter(Boolean).map((item) => item.toLocaleLowerCase('en-US'));
}

function safeName(value, label, fallback) {
  const candidate = text(value).trim() || text(fallback).trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/.test(candidate) || candidate === '.' || candidate === '..' || candidate.endsWith('.')) {
    fail((label || 'Name') + ' must contain 1–96 letters, numbers, dots, dashes, or underscores and cannot contain a path separator.');
  }
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(candidate)) {
    fail((label || 'Name') + ' cannot be a reserved Windows device name.');
  }
  return candidate;
}

function normalizeRevision(value) {
  const revision = text(value).trim();
  if (!/^1\.\d+(?:\.\d+)?$/.test(revision)) {
    fail('BuildTools revision must be a released numeric Minecraft version such as 1.21.4.');
  }
  return revision;
}

function typedBoolean(input, key) {
  const value = input[key];
  if (value === undefined || value === null) return false;
  if (typeof value !== 'boolean') fail(key + ' must be a true or false typed control value.');
  return value;
}

function normalizeCompileSelection(value) {
  const source = Array.isArray(value)
    ? value
    : text(value || 'spigot').trim().toLowerCase() === 'both'
      ? ['spigot', 'craftbukkit']
      : [text(value || 'spigot').trim().toLowerCase()];
  const targets = [];
  for (const raw of source) {
    const normalized = text(raw).trim().toLowerCase();
    if (!Object.prototype.hasOwnProperty.call(COMPILE_TARGETS, normalized)) {
      fail('Compile selection must be Spigot, CraftBukkit, or both.');
    }
    if (!targets.includes(normalized)) targets.push(normalized);
  }
  if (!targets.length) fail('Choose at least one BuildTools compile target.');
  return Object.freeze(targets);
}

function normalizePullRequest(value) {
  if (value === undefined || value === null || text(value).trim() === '') return null;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || number > 100000000) {
    fail('Pull-request number must be a positive whole number.');
  }
  return number;
}

function rejectEscapeHatches(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('BuildTools planning input must be a typed object.');
  for (const key of Object.keys(input)) {
    if (!TYPED_INPUT_KEYS.has(key)) {
      const value = input[key];
      if (value !== undefined && value !== null && value !== '' && value !== false) {
        fail('BuildTools planning accepts typed controls only. The ' + key + ' field is not supported.');
      }
    }
  }
  for (const key of ['rawFallback', 'expertTokens', 'additionalArgs', 'args', 'command', 'shell', 'disableJavaCheck', 'disableCertificateCheck']) {
    const value = input[key];
    if (value !== undefined && value !== null && value !== '' && value !== false) {
      fail('BuildTools planning does not accept arbitrary arguments or shell settings. Use the typed controls only.');
    }
  }
  const serialized = JSON.stringify(input);
  for (const flag of FORBIDDEN_FLAGS) {
    if (serialized.includes(flag)) {
      fail(flag + ' is rejected. This planner has no future consequence path that can safely justify bypassing that validation.');
    }
  }
}

function validateWorkspace(workspaceValue, serverHome, repositoryRoots) {
  const workspace = resolveAbsolutePath(workspaceValue, 'BuildTools workspace');
  const root = path.parse(workspace).root;
  const home = path.resolve(os.homedir());
  if (comparablePath(workspace) === comparablePath(root)) fail('A filesystem root cannot be the BuildTools workspace.');
  if (pathsOverlap(workspace, home)) fail('The BuildTools workspace cannot overlap the user home folder. Choose a dedicated local folder.');
  if (pathsOverlap(workspace, serverHome)) fail('The BuildTools workspace must be fully separate from the selected server home.');
  const unsafeSegments = new Set(['.git', 'node_modules', 'temp', 'tmp', 'onedrive', 'dropbox', 'google drive', 'icloud drive', 'nextcloud', 'syncthing']);
  if (pathSegments(workspace).some((segment) => unsafeSegments.has(segment))) {
    fail('The BuildTools workspace cannot be inside a repository, dependency folder, temporary folder, or known synced location.');
  }
  for (const rootValue of repositoryRoots || []) {
    try {
      const repositoryRoot = resolveAbsolutePath(rootValue, 'Repository root');
      if (pathsOverlap(workspace, repositoryRoot)) fail('The BuildTools workspace cannot overlap the application repository.');
    } catch (error) {
      if (String(error.message || '').includes('cannot overlap')) throw error;
    }
  }
  return workspace;
}

function composeTypedArguments(input, workspace) {
  const revision = normalizeRevision(input.revision);
  const outputDirectoryName = safeName(input.outputDirectoryName, 'Output directory name', 'buildtools-output');
  const finalName = safeName(input.finalName, 'Final name', 'spigot-' + revision);
  const compileSelection = normalizeCompileSelection(input.compileSelection);
  const compileTargets = compileSelection.map((target) => COMPILE_TARGETS[target]);
  const outputDirectory = path.join(workspace, outputDirectoryName);
  const compileIfChanged = typedBoolean(input, 'compileIfChanged');
  const dontUpdate = typedBoolean(input, 'dontUpdate');
  const remapped = typedBoolean(input, 'remapped');
  const generateSource = typedBoolean(input, 'generateSource');
  const generateDocs = typedBoolean(input, 'generateDocs');
  const experimental = typedBoolean(input, 'experimental');
  const developmentBuild = typedBoolean(input, 'developmentBuild');
  const pullRequest = normalizePullRequest(input.pullRequest);
  const args = ['--rev', revision, '--output-dir', outputDirectory, '--final-name', finalName, '--compile', compileTargets.join(',')];
  if (compileIfChanged) args.push('--compile-if-changed');
  if (dontUpdate) args.push('--dont-update');
  if (remapped) args.push('--remapped');
  if (generateSource) args.push('--generate-source');
  if (generateDocs) args.push('--generate-docs');
  if (experimental) args.push('--experimental');
  if (developmentBuild) args.push('--dev');
  if (pullRequest !== null) args.push('--pull-request', String(pullRequest));
  return Object.freeze({
    revision,
    outputDirectoryName,
    outputDirectory,
    finalName,
    compileSelection,
    compileTargets: Object.freeze(compileTargets),
    compileIfChanged,
    dontUpdate,
    remapped,
    generateSource,
    generateDocs,
    experimental,
    developmentBuild,
    pullRequest,
    args: Object.freeze(args)
  });
}

function readinessFor(requirement, java, git) {
  const blockers = [];
  if (requirement.status !== 'known') blockers.push(requirement.message);
  if (!java?.available) blockers.push('A compatible Java runtime is not currently detected. Use the existing dependency installer before any future executor is enabled.');
  if (!git?.available) blockers.push('Git is not currently detected. Use the existing dependency installer before any future executor is enabled.');
  return Object.freeze({
    state: blockers.length ? 'blocked' : 'ready-to-plan-only',
    blockers: Object.freeze(blockers)
  });
}

class BuildToolsOrchestrationController {
  constructor(options = {}) {
    if (!options.serverManager) throw new Error('BuildTools planning requires the application ServerManager.');
    this.serverManager = options.serverManager;
    this.repositoryRoots = Array.isArray(options.repositoryRoots) ? options.repositoryRoots.slice(0, 16) : [];
  }

  async createPlan(serverId, rawInput = {}) {
    rejectEscapeHatches(rawInput);
    const server = await this.serverManager.getServer(serverId);
    if (!server || server.software !== 'spigot') throw new Error('BuildTools planning is available only for a selected Spigot server.');
    const serverHome = resolveAbsolutePath(server.serverPath, 'Server home');
    const workspace = validateWorkspace(rawInput.workspace, serverHome, this.repositoryRoots);
    const typed = composeTypedArguments(rawInput, workspace);
    const requirement = spigotJavaRequirement(typed.revision);
    const java = requirement.status === 'known'
      ? await this.serverManager.findJavaDependency(requirement.feature, server.javaPath || null)
      : { available: false, path: null, feature: null, source: null, detectedFeatures: [] };
    const git = await this.serverManager.findDependency('git');
    const readiness = readinessFor(requirement, java, git);
    const buildToolsJar = path.join(workspace, 'BuildTools.jar');
    const operationId = crypto.randomUUID();
    const directArgv = Object.freeze({
      executable: java.available ? java.path : null,
      args: Object.freeze(['-jar', buildToolsJar, ...typed.args]),
      cwd: workspace,
      shell: false,
      windowsHide: true,
      processStarted: false
    });
    return Object.freeze({
      schema: 1,
      kind: 'buildtools-plan-only',
      operationId,
      server: Object.freeze({ id: server.id, name: text(server.name).slice(0, 160), serverHome, minecraftVersion: text(server.minecraftVersion).slice(0, 64) }),
      revision: typed.revision,
      javaRequirement: requirement,
      javaRequirementMatrix: JAVA_REQUIREMENT_MATRIX,
      dependencies: Object.freeze({
        java: Object.freeze({ id: 'java', available: java.available === true, path: java.path || null, feature: java.feature || null, source: java.source || null, requiredFeature: requirement.feature || null }),
        git: Object.freeze({ id: 'git', available: git.available === true, path: git.path || null, source: git.source || null, required: true })
      }),
      workspace: Object.freeze({
        root: workspace,
        buildToolsJar,
        outputDirectory: typed.outputDirectory,
        outputDirectoryName: typed.outputDirectoryName,
        separateFromServerHome: true,
        created: false
      }),
      flags: typed,
      directArgv,
      readiness,
      execution: Object.freeze({
        state: 'unavailable',
        processStarted: false,
        reason: 'This surface is a plan-only foundation. No BuildTools downloader, process executor, JAR promotion, or rollback executor is registered here.',
        nextStep: 'Review the typed direct-argument preview and resolve any Java or Git blocker with the existing dependency controls. A future executor must be separately designed and verified before it can be enabled.'
      }),
      boundaries: Object.freeze({
        buildToolsSource: OFFICIAL_BUILDTOOLS_JAR_URL,
        downloadsStarted: false,
        workspaceCreated: false,
        processStarted: false,
        jarDistributed: false,
        pluginAcquisition: 'not-supported'
      })
    });
  }
}

module.exports = {
  BuildToolsOrchestrationController,
  FORBIDDEN_FLAGS,
  JAVA_REQUIREMENT_MATRIX,
  composeTypedArguments,
  normalizeCompileSelection,
  normalizePullRequest,
  rejectEscapeHatches,
  validateWorkspace
};
