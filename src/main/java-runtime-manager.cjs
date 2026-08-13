'use strict';

/**
 * Version-aware Java runtime planning for Minecraft Server Studio.
 *
 * The module may probe an explicit executable with direct argv, but never
 * installs, downloads, writes configuration, launches a server, or handles a
 * credential. Installation stays an explicit application-owned action.
 */

const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');

const SUPPORTED_JAVA_FEATURES = Object.freeze([8, 11, 16, 17, 21, 25]);
const MAX_PROBE_BYTES = 32 * 1024;
const DEFAULT_PROBE_TIMEOUT_MS = 8_000;

function runtimeError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function text(value, fallback) {
  return value === undefined || value === null ? (fallback === undefined ? '' : fallback) : String(value);
}

function parseMinecraftVersion(value) {
  const raw = text(value).trim();
  if (!/^\d+\.\d+(?:\.\d+)?$/.test(raw)) return null;
  const parts = raw.split('.').map((part) => Number(part));
  if (parts.some((part) => !Number.isSafeInteger(part) || part < 0)) return null;
  return Object.freeze([parts[0], parts[1], parts[2] || 0]);
}

function formatMinecraftVersion(parts) {
  return parts[0] + '.' + parts[1] + (parts[2] ? '.' + parts[2] : '');
}

function compareMinecraftVersions(left, right) {
  const a = Array.isArray(left) ? left : parseMinecraftVersion(left);
  const b = Array.isArray(right) ? right : parseMinecraftVersion(right);
  if (!a || !b) return null;
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] < b[index] ? -1 : 1;
  }
  return 0;
}

function knownRequirement(platform, minecraftVersion, feature, source) {
  const version = formatMinecraftVersion(minecraftVersion);
  return Object.freeze({
    status: 'known',
    platform,
    minecraftVersion: version,
    feature,
    minimumFeature: feature,
    recommendedFeature: feature,
    source,
    message: platform + ' ' + version + ' requires Java ' + feature + '.'
  });
}

function unknownRequirement(platform, minecraftVersion, message) {
  return Object.freeze({
    status: 'unknown',
    platform,
    minecraftVersion: minecraftVersion ? formatMinecraftVersion(minecraftVersion) : null,
    feature: null,
    minimumFeature: null,
    recommendedFeature: null,
    source: 'No documented compatibility rule is bundled for this version.',
    message
  });
}

function paperJavaRequirement(value) {
  const version = Array.isArray(value) ? value : parseMinecraftVersion(value);
  if (!version) {
    return unknownRequirement('Paper', null, 'The selected Paper Minecraft version is not a numeric release, so Java compatibility cannot be determined safely.');
  }
  const atLeast = (candidate) => compareMinecraftVersions(version, candidate) >= 0;
  const before = (candidate) => compareMinecraftVersions(version, candidate) < 0;
  const atMost = (candidate) => compareMinecraftVersions(version, candidate) <= 0;

  if (atLeast('26.1')) return knownRequirement('Paper', version, 25, 'Paper 26.1+ compatibility matrix');
  if (atLeast('1.7.10') && before('1.12')) return knownRequirement('Paper', version, 8, 'Paper 1.7.10–1.11 compatibility matrix');
  if (atLeast('1.12') && atMost('1.16.4')) return knownRequirement('Paper', version, 11, 'Paper 1.12–1.16.4 compatibility matrix');
  if (compareMinecraftVersions(version, '1.16.5') === 0) return knownRequirement('Paper', version, 16, 'Paper 1.16.5 compatibility matrix');
  if (atLeast('1.17') && before('1.20')) return knownRequirement('Paper', version, 17, 'Paper 1.17–1.19 compatibility matrix');
  if (atLeast('1.20') && before('1.21')) return knownRequirement('Paper', version, 21, 'Paper 1.20–1.21.11 compatibility matrix');
  if (atLeast('1.21') && atMost('1.21.11')) return knownRequirement('Paper', version, 21, 'Paper 1.20–1.21.11 compatibility matrix');

  return unknownRequirement(
    'Paper',
    version,
    'Paper ' + formatMinecraftVersion(version) + ' falls in a compatibility gap or newer release range. The application will not guess a Java runtime; update the bundled compatibility policy or choose a documented version.'
  );
}

function spigotJavaRequirement(value) {
  const version = Array.isArray(value) ? value : parseMinecraftVersion(value);
  if (!version) {
    return unknownRequirement('Spigot', null, 'The selected Spigot Minecraft version is not a numeric release, so Java compatibility cannot be determined safely.');
  }
  if (version[0] !== 1) {
    return unknownRequirement('Spigot', version, 'Spigot BuildTools compatibility is bundled only for the documented 1.x release ranges. The application will not guess for this version.');
  }
  if (compareMinecraftVersions(version, '1.17') < 0) return knownRequirement('Spigot', version, 8, 'Spigot BuildTools compatibility matrix');
  if (compareMinecraftVersions(version, '1.17') >= 0 && compareMinecraftVersions(version, '1.17.1') <= 0) {
    return knownRequirement('Spigot', version, 16, 'Spigot BuildTools compatibility matrix');
  }
  if (compareMinecraftVersions(version, '1.17.1') > 0 && compareMinecraftVersions(version, '1.20.5') <= 0) {
    return knownRequirement('Spigot', version, 17, 'Spigot BuildTools compatibility matrix');
  }
  if (compareMinecraftVersions(version, '1.20.5') > 0 && compareMinecraftVersions(version, '1.21.11') <= 0) {
    return knownRequirement('Spigot', version, 21, 'Spigot BuildTools compatibility matrix');
  }
  return unknownRequirement(
    'Spigot',
    version,
    'Spigot BuildTools ' + formatMinecraftVersion(version) + ' is outside the documented bundled compatibility range. The application will not guess a Java runtime.'
  );
}

function describeJavaRequirementForServer(server) {
  const flavor = text(server && server.software).trim().toLowerCase();
  return flavor === 'paper'
    ? paperJavaRequirement(server && server.minecraftVersion)
    : flavor === 'spigot'
      ? spigotJavaRequirement(server && server.minecraftVersion)
      : unknownRequirement('server', null, 'Choose Paper or Spigot before resolving Java.');
}

function javaRequirementForServer(server) {
  const requirement = describeJavaRequirementForServer(server);
  if (requirement.status !== 'known') throw runtimeError('JAVA_REQUIREMENT_UNKNOWN', requirement.message);
  return requirement;
}

function parseJavaFeatureVersion(output) {
  const transcript = text(output);
  const legacy = transcript.match(/(?:java|openjdk)\s+version\s+"1\.(8)(?:[._]\d+)*"?/i);
  if (legacy) return 8;
  const named = transcript.match(/(?:java|openjdk)(?:\s+runtime)?(?:\s+version)?\s+"?(\d+)(?:[._]\d+){0,4}"?/i);
  if (named) {
    const feature = Number(named[1]);
    return Number.isSafeInteger(feature) && feature >= 8 && feature <= 99 ? feature : null;
  }
  const firstLine = transcript.split(/\r?\n/).find(Boolean) || '';
  const standalone = firstLine.match(/^\s*"?(\d+)(?:[._]\d+){1,4}"?\b/);
  if (!standalone) return null;
  const feature = Number(standalone[1]);
  return Number.isSafeInteger(feature) && feature >= 8 && feature <= 99 ? feature : null;
}

function safeExecutablePath(value) {
  const candidate = text(value).trim();
  if (!candidate) throw runtimeError('JAVA_PATH_REQUIRED', 'Choose a Java executable before requesting a runtime inspection.');
  if (/[\r\n\0]/.test(candidate)) throw runtimeError('JAVA_PATH_INVALID', 'The Java executable path contains an unsafe control character.');
  return candidate;
}

function runDirect(executable, args, options) {
  const command = safeExecutablePath(executable);
  const argv = Array.isArray(args) ? args.map((arg) => text(arg)) : [];
  const configuration = options || {};
  const timeoutMs = Number.isFinite(configuration.timeoutMs) ? configuration.timeoutMs : DEFAULT_PROBE_TIMEOUT_MS;
  const maximumBytes = Number.isFinite(configuration.maximumBytes) ? configuration.maximumBytes : MAX_PROBE_BYTES;
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let total = 0;
    let finished = false;
    let timedOut = false;
    let child;
    const finish = (value) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve(value);
    };
    const append = (channel, chunk) => {
      if (total >= maximumBytes) return;
      const value = chunk.toString('utf8');
      const remaining = maximumBytes - total;
      const clipped = value.slice(0, remaining);
      total += Buffer.byteLength(clipped);
      if (channel === 'stdout') stdout += clipped;
      else stderr += clipped;
    };
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill();
      } catch {
        // The probe is already no longer running.
      }
    }, Math.max(1_000, Math.min(timeoutMs, 30_000)));
    try {
      child = spawn(command, argv, {
        cwd: configuration.cwd,
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      });
    } catch (error) {
      finish({ started: false, code: null, stdout, stderr, timedOut: false, error: text(error && error.message, 'Unable to start Java.') });
      return;
    }
    child.stdout.on('data', (chunk) => append('stdout', chunk));
    child.stderr.on('data', (chunk) => append('stderr', chunk));
    child.once('error', (error) => finish({ started: false, code: null, stdout, stderr, timedOut: false, error: text(error && error.message, 'Unable to start Java.') }));
    child.once('close', (code) => finish({
      started: true,
      code: code === null || code === undefined ? 1 : code,
      stdout,
      stderr,
      timedOut,
      error: timedOut ? 'Java version probing timed out.' : null
    }));
  });
}

async function probeJavaRuntime(executable, options) {
  const candidate = safeExecutablePath(executable);
  const primary = await runDirect(candidate, ['--version'], options);
  const primaryText = primary.stdout + '\n' + primary.stderr;
  const primaryFeature = parseJavaFeatureVersion(primaryText);
  const fallback = !primary.started || primary.code !== 0 || primaryFeature === null
    ? await runDirect(candidate, ['-version'], options)
    : null;
  const result = fallback || primary;
  const transcript = (result.stdout + '\n' + result.stderr).trim().slice(0, 2_048);
  const feature = parseJavaFeatureVersion(transcript);
  return Object.freeze({
    path: path.isAbsolute(candidate) ? path.resolve(candidate) : candidate,
    feature,
    launchable: Boolean(result.started) && !result.timedOut && result.code === 0 && feature !== null,
    probe: fallback ? '-version' : '--version',
    error: result.error || (!feature ? 'The Java executable did not report a recognizable feature version.' : null),
    transcript,
    verifiedAt: new Date().toISOString()
  });
}

function addCandidate(collected, value, source) {
  const candidate = text(value).trim();
  if (!candidate || /[\r\n\0]/.test(candidate)) return;
  const identity = process.platform === 'win32' ? candidate.toLowerCase() : candidate;
  if (!collected.some((entry) => entry.identity === identity)) collected.push({ identity, path: candidate, source });
}

async function pathJavaCandidates(options) {
  const configuration = options || {};
  if (Array.isArray(configuration.pathCandidates)) return configuration.pathCandidates;
  const lookup = process.platform === 'win32' ? 'where.exe' : 'which';
  const result = await runDirect(lookup, ['java'], { timeoutMs: 4_000, maximumBytes: 8 * 1024 });
  if (!result.started || result.code !== 0) return [];
  return result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

async function discoverJavaRuntimeCandidates(options) {
  const configuration = options || {};
  const collected = [];
  addCandidate(collected, configuration.configuredPath, 'selected server runtime');
  for (const candidate of Array.isArray(configuration.explicitPaths) ? configuration.explicitPaths : []) {
    addCandidate(collected, candidate, 'explicit runtime path');
  }
  const javaHome = text(configuration.javaHome === undefined ? process.env.JAVA_HOME : configuration.javaHome).trim();
  if (javaHome) {
    const names = process.platform === 'win32' ? ['java.exe', 'java'] : ['java', 'java.exe'];
    for (const name of names) addCandidate(collected, path.join(javaHome, 'bin', name), 'JAVA_HOME');
  }
  for (const candidate of await pathJavaCandidates(configuration)) addCandidate(collected, candidate, 'PATH');
  return Object.freeze(collected.map(({ identity, ...entry }) => Object.freeze(entry)));
}

function createJavaInstallPlan(feature, options) {
  const normalized = Number(feature);
  if (!SUPPORTED_JAVA_FEATURES.includes(normalized)) {
    throw runtimeError('JAVA_INSTALL_UNSUPPORTED', 'No automatic Java installer plan is bundled for Java ' + text(feature) + '.');
  }
  const configuration = options || {};
  const configuredSources = configuration.portableSources && typeof configuration.portableSources === 'object'
    ? configuration.portableSources
    : {};
  const portable = configuredSources[String(normalized)] || configuredSources[normalized] || null;
  const portablePlan = portable && typeof portable.url === 'string' && /^https:\/\//i.test(portable.url)
    ? Object.freeze({
      state: 'configured',
      url: portable.url,
      sha256: typeof portable.sha256 === 'string' ? portable.sha256.toLowerCase() : null,
      archiveName: typeof portable.archiveName === 'string' && portable.archiveName.trim()
        ? portable.archiveName.trim()
        : 'java-' + normalized + '-windows.zip'
    })
    : Object.freeze({
      state: 'missing-source',
      reason: 'No canonical portable Java ' + normalized + ' source is configured. Package-manager actions remain available when installed; no URL is invented.'
    });
  return Object.freeze({
    feature: normalized,
    label: 'Eclipse Temurin ' + normalized + ' JDK',
    packageInstallers: Object.freeze([
      Object.freeze({ id: 'winget', command: 'winget', args: Object.freeze(['install', '--id', 'EclipseAdoptium.Temurin.' + normalized + '.JDK', '--exact', '--accept-package-agreements', '--accept-source-agreements']) }),
      Object.freeze({ id: 'choco', command: 'choco', args: Object.freeze(['install', 'temurin' + normalized, '-y']) })
    ]),
    portable: portablePlan
  });
}

function unsafeJvmTokenReason(token) {
  const value = text(token).trim();
  if (!value) return 'empty JVM token';
  if (value.length > 256 || /[\r\n\0]/.test(value)) return 'an unsafe control character or length';
  if (/[;&|\x60]/.test(value) || /\$\(|\$\{/.test(value)) return 'shell control syntax';
  if (value.startsWith('@')) return 'an argument-file reference';
  if (/^(?:-javaagent:|-agentlib:|-agentpath:|-Xrun|-Xbootclasspath|--class-path$|-cp$|-classpath$|--module-path$|-p$)/i.test(value)) return 'an agent, native, or class-path option';
  if (/^-D(?:java\.library\.path|com\.sun\.management|jdk\.management\.agent|javax\.management)\b/i.test(value)) return 'a native-library or remote-management property';
  if (/^-XX:(?:OnError|OnOutOfMemoryError)=/i.test(value)) return 'an operating-system command hook';
  return null;
}

function normalizeExpertTokens(value) {
  const tokens = Array.isArray(value)
    ? value.map((item) => text(item).trim()).filter(Boolean)
    : text(value).trim() ? text(value).trim().split(/\s+/) : [];
  if (tokens.length > 16) throw runtimeError('JAVA_JVM_TOKEN_LIMIT', 'Use at most 16 reviewed expert JVM tokens.');
  for (const token of tokens) {
    const reason = unsafeJvmTokenReason(token);
    if (reason) throw runtimeError('JAVA_JVM_TOKEN_UNSAFE', 'The JVM token "' + token.slice(0, 64) + '" is blocked because it contains ' + reason + '.');
  }
  return Object.freeze(tokens);
}

function memoryGigabytes(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 1 || number > 128) {
    throw runtimeError('JAVA_MEMORY_INVALID', 'Memory must be between 1 GB and 128 GB.');
  }
  return Math.round(number);
}

function normalizeServerArgs(value) {
  const args = Array.isArray(value) ? value : ['nogui'];
  if (!args.length || args.length > 16) throw runtimeError('JAVA_SERVER_ARGS_INVALID', 'Server arguments must contain between one and 16 direct tokens.');
  return Object.freeze(args.map((item) => {
    const token = text(item).trim();
    if (!token || token.length > 512 || /[\r\n\0]/.test(token) || /[;&|\x60]/.test(token) || token.startsWith('@')) {
      throw runtimeError('JAVA_SERVER_ARGS_UNSAFE', 'Server arguments must be direct Minecraft tokens without shell or argument-file syntax.');
    }
    return token;
  }));
}

function createJavaLaunchProfile(input) {
  const source = input || {};
  const executable = safeExecutablePath(source.javaExecutable);
  const jarPath = safeExecutablePath(source.serverJar);
  if (!path.isAbsolute(executable) || !path.isAbsolute(jarPath)) {
    throw runtimeError('JAVA_LAUNCH_PATH_INVALID', 'Java executable and server JAR paths must be absolute before launch.');
  }
  const feature = Number(source.javaFeature);
  if (!Number.isSafeInteger(feature) || feature < 8 || feature > 99) {
    throw runtimeError('JAVA_FEATURE_INVALID', 'A verified Java feature version is required before building the launch profile.');
  }
  const memory = memoryGigabytes(source.memoryGb);
  const profile = source.profile && typeof source.profile === 'object' ? source.profile : {};
  const gc = ['auto', 'g1', 'serial', 'zgc'].includes(profile.gc) ? profile.gc : 'g1';
  const diagnostics = ['off', 'gc-log', 'jfr', 'jcmd-ready'].includes(profile.diagnostics) ? profile.diagnostics : 'off';
  const args = ['-Xms' + memory + 'G', '-Xmx' + memory + 'G'];
  if (gc === 'g1') args.push('-XX:+UseG1GC');
  if (gc === 'serial') args.push('-XX:+UseSerialGC');
  if (gc === 'zgc') {
    if (feature < 17) throw runtimeError('JAVA_GC_UNSUPPORTED', 'ZGC requires Java 17 or later.');
    args.push('-XX:+UseZGC');
  }
  const diagnosticsDirectory = text(source.diagnosticsDirectory).trim();
  if (diagnostics === 'gc-log') {
    if (!diagnosticsDirectory || !path.isAbsolute(diagnosticsDirectory)) throw runtimeError('JAVA_DIAGNOSTICS_PATH_REQUIRED', 'An absolute diagnostics directory is required for GC logging.');
    args.push('-Xlog:gc*:file=' + path.join(diagnosticsDirectory, 'gc-%t.log') + ':time,uptime:filecount=5,filesize=10M');
  }
  if (diagnostics === 'jfr') {
    if (feature < 11) throw runtimeError('JAVA_JFR_UNSUPPORTED', 'Java Flight Recorder requires Java 11 or later.');
    if (!diagnosticsDirectory || !path.isAbsolute(diagnosticsDirectory)) throw runtimeError('JAVA_DIAGNOSTICS_PATH_REQUIRED', 'An absolute diagnostics directory is required for Java Flight Recorder.');
    args.push('-XX:StartFlightRecording=filename=' + path.join(diagnosticsDirectory, 'server-%t.jfr') + ',dumponexit=true');
  }
  args.push(...normalizeExpertTokens(profile.expertTokens), '-jar', jarPath, ...normalizeServerArgs(source.serverArgs));
  const jarIndex = args.indexOf('-jar');
  return Object.freeze({
    executable: path.resolve(executable),
    args: Object.freeze(args),
    jvmTokens: Object.freeze(args.slice(0, jarIndex)),
    serverJar: path.resolve(jarPath),
    serverArgs: Object.freeze(args.slice(jarIndex + 2)),
    diagnosticsDirectory: diagnosticsDirectory || null,
    profile: Object.freeze({ gc, diagnostics })
  });
}

async function createJavaLaunchPreflight(input) {
  const source = input || {};
  const requirement = source.requirement || null;
  const runtime = source.runtime || null;
  const issues = [];
  if (!requirement || requirement.status !== 'known') {
    issues.push({ code: 'java-requirement-unknown', message: 'Java compatibility is unknown for the selected server version.' });
  }
  if (!runtime || !runtime.launchable) {
    issues.push({ code: 'java-runtime-unavailable', message: 'No launchable Java runtime has been verified.' });
  } else if (requirement && requirement.status === 'known' && runtime.feature !== requirement.feature) {
    issues.push({ code: 'java-runtime-incompatible', message: 'Java ' + runtime.feature + ' does not match the required Java ' + requirement.feature + '.' });
  }
  const jarPath = text(source.serverJar).trim();
  if (!jarPath || !path.isAbsolute(jarPath)) {
    issues.push({ code: 'server-jar-invalid', message: 'The server JAR must be an absolute path.' });
  } else {
    try {
      const stat = await fs.stat(jarPath);
      if (!stat.isFile()) issues.push({ code: 'server-jar-missing', message: 'The selected server JAR is not a file.' });
    } catch {
      issues.push({ code: 'server-jar-missing', message: 'The selected server JAR does not exist.' });
    }
  }
  let launch = null;
  if (!issues.length) {
    try {
      launch = createJavaLaunchProfile({
        javaExecutable: runtime.path,
        javaFeature: runtime.feature,
        serverJar: jarPath,
        memoryGb: source.memoryGb,
        profile: source.profile,
        serverArgs: source.serverArgs,
        diagnosticsDirectory: source.diagnosticsDirectory
      });
    } catch (error) {
      issues.push({ code: error.code || 'java-launch-profile-invalid', message: text(error && error.message, 'The Java launch profile is invalid.') });
    }
  }
  return Object.freeze({ state: issues.length ? 'blocked' : 'ready', requirement, runtime, launch, issues: Object.freeze(issues) });
}

module.exports = {
  SUPPORTED_JAVA_FEATURES,
  parseMinecraftVersion,
  compareMinecraftVersions,
  paperJavaRequirement,
  spigotJavaRequirement,
  describeJavaRequirementForServer,
  javaRequirementForServer,
  parseJavaFeatureVersion,
  runDirect,
  probeJavaRuntime,
  discoverJavaRuntimeCandidates,
  createJavaInstallPlan,
  unsafeJvmTokenReason,
  normalizeExpertTokens,
  createJavaLaunchProfile,
  createJavaLaunchPreflight
};
