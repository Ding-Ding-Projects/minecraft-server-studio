const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const {
  createDesktopCompletenessInventory,
  createLocalStatusSnapshot
} = require('./desktop-status-model.cjs');
const {
  createBuildToolsPreflight,
  authorizeBuildToolsPreflight,
  fetchOfficialLiveVersionMetadata,
  inspectPluginJarFile
} = require('./buildtools-adapter.cjs');
const {
  composeCommand,
  composeRawTokenizedCommand,
  createCommandCenterRegistry,
  presentRegistry,
  ROUTES
} = require('./command-center-registry.cjs');
const { discoverySnapshotStatus } = require('./minecraft-management-protocol.cjs');
const javaRuntime = require('./java-runtime-manager.cjs');
const {
  probeSelectedJar,
  queryLoopbackRconEvidence
} = require('./command-runtime-discovery.cjs');
const configPluginSafety = require('./config-plugin-safety.cjs');
const backupLifecycle = require('./server-backup-manager.cjs');

const PAPER_API = 'https://api.papermc.io/v2/projects/paper';
const SPIGOT_BUILDTOOLS_URL = 'https://hub.spigotmc.org/jenkins/job/BuildTools/lastSuccessfulBuild/artifact/target/BuildTools.jar';
const MAX_COMMAND_DISCOVERY_RESPONSES = 24;
const MAX_COMMAND_DISCOVERY_RESPONSE_BYTES = 64 * 1024;
const COMMAND_DISCOVERY_SETTLE_MS = 900;
const COMMAND_DISCOVERY_QUIET_MS = 160;
const MANAGED_JAVA_INVENTORY_SCHEMA = 1;
const MAX_MANAGED_JAVA_RUNTIMES = 16;
const MAX_PORTABLE_JAVA_BYTES = 4 * 1024 * 1024 * 1024;
const DEFAULT_PROPERTIES = Object.freeze({
  'accepts-transfers': 'false',
  'allow-flight': 'false',
  'broadcast-console-to-ops': 'true',
  'broadcast-rcon-to-ops': 'true',
  'bug-report-link': '',
  'debug': 'false',
  'difficulty': 'easy',
  'enable-jmx-monitoring': 'false',
  'enable-query': 'false',
  'enable-rcon': 'false',
  'enable-status': 'true',
  'enforce-secure-profile': 'true',
  'enforce-whitelist': 'false',
  'entity-broadcast-range-percentage': '100',
  'force-gamemode': 'false',
  'function-permission-level': '2',
  'gamemode': 'survival',
  'generate-structures': 'true',
  'generator-settings': '{}',
  'hardcore': 'false',
  'hide-online-players': 'false',
  'initial-disabled-packs': '',
  'initial-enabled-packs': 'vanilla',
  'level-name': 'world',
  'level-seed': '',
  'level-type': 'minecraft:normal',
  'log-ips': 'true',
  'max-chained-neighbor-updates': '1000000',
  'max-players': '20',
  'max-tick-time': '60000',
  'max-world-size': '29999984',
  'motd': 'A Minecraft Server Studio server',
  'online-mode': 'true',
  'op-permission-level': '4',
  'pause-when-empty-seconds': '60',
  'player-idle-timeout': '0',
  'prevent-proxy-connections': 'false',
  'query.port': '25565',
  'rate-limit': '0',
  'rcon.password': '',
  'rcon.port': '25575',
  'resource-pack': '',
  'resource-pack-id': '',
  'resource-pack-prompt': '',
  'resource-pack-sha1': '',
  'require-resource-pack': 'false',
  'region-file-compression': 'deflate',
  'server-ip': '',
  'server-port': '25565',
  'simulation-distance': '10',
  'spawn-animals': 'true',
  'spawn-npcs': 'true',
  'spawn-protection': '16',
  'sync-chunk-writes': 'true',
  'text-filtering-config': '',
  'use-native-transport': 'true',
  'view-distance': '10',
  'white-list': 'false'
});

// These current Minecraft game rules deliberately remain outside server.properties.
// Delivery uses a serialized local console or protected RCON route; the generic
// management protocol remains unavailable until discovery supplies exact params.
const DEFAULT_GAMERULES = Object.freeze(Object.fromEntries(
  Object.entries(configPluginSafety.MANAGED_GAME_RULES).map(([name, definition]) => [name, definition.defaultValue])
));

const ALLOWED_PROPERTY_KEYS = new Set(Object.keys(DEFAULT_PROPERTIES));
const STATUS_COMPLETENESS_ROWS = Object.freeze({
  'status-destination': { implementationPath: ['src/main/desktop-status-model.cjs', 'src/renderer/index.html', 'src/renderer/renderer.js'], documentationPath: ['docs/features/local-status-and-completeness.md'], localization: { state: 'pending', detail: 'Desktop localization resources are not yet complete.' }, test: { state: 'pending', detail: 'No test was run in this delivery pass.' }, capture: { state: 'pending', detail: 'No capture was run in this delivery pass.' }, evidence: { state: 'in-progress', detail: 'The local status model and visible renderer destination are registered, but no verification result is claimed.' } },
  'status-hub-bridge': { implementationPath: ['src/main/shared-status-hub-client.cjs', 'src/main/main.cjs', 'src/main/preload.cjs', 'src/main/desktop-status-model.cjs', 'src/renderer/index.html', 'src/renderer/renderer.js'], documentationPath: ['docs/features/shared-status-hub-bridge.md', 'docs/features/local-status-and-completeness.md'], localization: { state: 'pending', detail: 'Desktop localization resources are not yet complete.' }, test: { state: 'pending', detail: 'No test was run in this delivery pass.' }, capture: { state: 'pending', detail: 'No capture was run in this delivery pass.' }, evidence: { state: 'in-progress', detail: 'The opt-in main-process Status Hub bridge source is registered; no external registration, update, poll, reply delivery, or runtime verification is claimed.' } },
  'server-creation': { implementationPath: ['src/main/server-manager.cjs', 'src/renderer/index.html'], documentationPath: ['docs/features/server-orchestration.md'], localization: { state: 'pending' }, test: { state: 'pending' }, capture: { state: 'pending' }, evidence: { state: 'in-progress', detail: 'Structured Paper and Spigot server creation source is registered; verification remains pending.' } },
  'dependency-bootstrap': { implementationPath: ['src/main/server-manager.cjs', 'src/renderer/renderer.js'], documentationPath: ['docs/features/dependency-bootstrap.md'], localization: { state: 'pending' }, test: { state: 'pending' }, capture: { state: 'pending' }, evidence: { state: 'in-progress', detail: 'Detection, installation, retry, and status source is registered; verification remains pending.' } },
  'paper': { implementationPath: ['src/main/server-manager.cjs', 'src/renderer/index.html'], documentationPath: ['docs/features/server-orchestration.md'], localization: { state: 'pending' }, test: { state: 'pending' }, capture: { state: 'pending' }, evidence: { state: 'in-progress', detail: 'Official Paper selection and setup source is registered; verification remains pending.' } },
  'spigot-buildtools': { implementationPath: ['src/main/buildtools-adapter.cjs', 'src/renderer/index.html'], documentationPath: ['docs/features/spigot-buildtools.md'], localization: { state: 'pending' }, test: { state: 'pending' }, capture: { state: 'pending' }, evidence: { state: 'in-progress', detail: 'BuildTools preflight and rich-control source is registered; verification remains pending.' } },
  'java-runtime-and-jar-launch': { implementationPath: ['src/main/java-runtime-manager.cjs', 'src/main/server-manager.cjs', 'src/renderer/renderer.js'], documentationPath: ['docs/features/java-runtime-and-launch.md'], localization: { state: 'pending' }, test: { state: 'pending' }, capture: { state: 'pending' }, evidence: { state: 'in-progress', detail: 'Version-aware runtime discovery, persistent app-managed runtime records, official portable-source metadata, direct probes, and launch preflight source are registered; verification remains pending.' } },
  'protocol-management': { implementationPath: ['src/main/minecraft-management-protocol.cjs', 'src/main/main.cjs', 'src/renderer/index.html'], documentationPath: ['docs/features/server-orchestration.md'], localization: { state: 'pending' }, test: { state: 'pending' }, capture: { state: 'pending' }, evidence: { state: 'in-progress', detail: 'Endpoint-bound, time-limited discovery metadata and the provider-authentication boundary are registered; verification remains pending.' } },
  'command-center': { implementationPath: ['src/main/command-center-registry.cjs', 'src/main/command-runtime-discovery.cjs', 'src/main/server-manager.cjs', 'src/renderer/index.html', 'src/renderer/renderer.js'], documentationPath: ['docs/features/command-center.md'], localization: { state: 'pending' }, test: { state: 'pending' }, capture: { state: 'pending' }, evidence: { state: 'in-progress', detail: 'Bounded selected-JAR and explicitly requested live local-console or loopback-RCON discovery sources are wired; runtime interaction and verification remain pending.' } },
  'plugins': { implementationPath: ['src/main/config-plugin-safety.cjs', 'src/main/server-manager.cjs', 'src/renderer/index.html'], documentationPath: ['docs/features/configuration-and-plugin-safety.md'], localization: { state: 'pending' }, test: { state: 'pending' }, capture: { state: 'pending' }, evidence: { state: 'in-progress', detail: 'Bounded local JAR inspection, dependency planning, staging, promotion records, and rollback metadata are registered; no runtime verification is claimed.' } },
  'configuration': { implementationPath: ['src/main/config-plugin-safety.cjs', 'src/main/server-manager.cjs', 'src/renderer/index.html'], documentationPath: ['docs/features/configuration-and-plugin-safety.md'], localization: { state: 'pending' }, test: { state: 'pending' }, capture: { state: 'pending' }, evidence: { state: 'in-progress', detail: 'Lossless known-key server.properties updates and version-badged live gamerule delivery are registered; no runtime verification is claimed.' } },
  'console-and-rcon': { implementationPath: ['src/main/server-manager.cjs', 'src/main/main.cjs', 'src/main/preload.cjs', 'src/cli/mss.cjs', 'src/cli/rcon-gateway.cjs', 'src/renderer/rcon-response-safety.js', 'src/renderer/renderer.js', 'src/renderer/index.html'], documentationPath: ['docs/features/server-orchestration.md', 'docs/features/cli-rcon-gateway.md', 'docs/features/rcon-response-safety.md'], localization: { state: 'pending' }, test: { state: 'pending' }, capture: { state: 'pending' }, evidence: { state: 'in-progress', detail: 'Local console, protected fixed-loopback CLI RCON, and redacted bounded desktop RCON response presentation are registered; runtime verification remains pending.' } },
  'backups-and-updates': { implementationPath: ['src/main/server-backup-manager.cjs', 'src/main/server-manager.cjs', 'src/main/main.cjs', 'src/main/preload.cjs', 'src/renderer/index.html', 'src/renderer/renderer.js'], documentationPath: ['docs/features/backups-and-paper-updates.md'], localization: { state: 'pending' }, test: { state: 'pending', detail: 'No test was run in this delivery pass.' }, capture: { state: 'pending', detail: 'No capture was run in this delivery pass.' }, evidence: { state: 'in-progress', detail: 'Bounded local snapshot, restore, Paper stable-update, and rollback source is registered; verification remains pending.' } },
  'settings-appearance-and-localization': { implementationPath: ['src/main/studio-settings.cjs', 'src/main/main.cjs', 'src/main/preload.cjs', 'src/renderer/experience-copy.js', 'src/renderer/index.html', 'src/renderer/renderer.js'], documentationPath: ['docs/features/experience-settings.md', 'docs/features/local-status-and-completeness.md'], localization: { state: 'in-progress', detail: 'The language-mode, message-style, display-name, dialog-emoji, and School-mode foundation is registered; complete application-wide localization remains pending.' }, test: { state: 'pending', detail: 'No test was run in this delivery pass.' }, capture: { state: 'pending', detail: 'No built-artifact capture was run in this delivery pass.' }, evidence: { state: 'in-progress', detail: 'App-private settings, a watched shared local record, credential-vault backed unlock storage, and core renderer wiring are registered; broader settings, appearance, and localization requirements remain incomplete.' } },
  'application-updates': { implementationPath: ['src/main/update-controller.cjs', 'src/main/main.cjs', 'src/main/preload.cjs', 'src/renderer/index.html', 'src/renderer/renderer.js'], documentationPath: ['docs/features/unsigned-automatic-updates.md'], localization: { state: 'pending', detail: 'Application-update copy is English-only; localization remains incomplete.' }, test: { state: 'pending', detail: 'No test was run in this delivery pass.' }, capture: { state: 'pending', detail: 'No capture was run in this delivery pass.' }, evidence: { state: 'in-progress', detail: 'Unsigned Squirrel.Windows application-update source is registered; package and runtime verification remain pending.' } },
  'file-converter': { implementationPath: [], documentationPath: [], localization: { state: 'pending' }, test: { state: 'pending' }, capture: { state: 'pending' }, evidence: { state: 'pending', detail: 'The desktop local converter surface remains pending.' } },
  'ollama': { implementationPath: [], documentationPath: [], localization: { state: 'pending' }, test: { state: 'pending' }, capture: { state: 'pending' }, evidence: { state: 'pending', detail: 'The desktop local Ollama suite remains pending.' } },
  'authenticator-and-toy-locks': { implementationPath: [], documentationPath: [], localization: { state: 'pending' }, test: { state: 'pending' }, capture: { state: 'pending' }, evidence: { state: 'pending', detail: 'The desktop authenticator and toy-lock suite remain pending.' } },
  'docs-history-and-notifications': { implementationPath: ['src/renderer/renderer.js'], documentationPath: ['docs/features/README.md'], localization: { state: 'pending' }, test: { state: 'pending' }, capture: { state: 'pending' }, evidence: { state: 'pending', detail: 'Toast notifications exist; the complete documentation, history, and notification-center surface remains pending.' } },
  'export': { implementationPath: [], documentationPath: [], localization: { state: 'pending' }, test: { state: 'pending' }, capture: { state: 'pending' }, evidence: { state: 'pending', detail: 'Complete structured exports and external-editor handoff remain pending.' } }
});
const DEPENDENCIES = Object.freeze({
  java: {
    label: 'Version-aware Java runtime',
    command: 'java',
    versionArgs: ['-version'],
    installers: []
  },
  git: {
    label: 'Git for Windows',
    command: 'git',
    versionArgs: ['--version'],
    installers: [
      { command: 'winget', args: ['install', '--id', 'Git.Git', '--exact', '--accept-package-agreements', '--accept-source-agreements'] },
      { command: 'choco', args: ['install', 'git', '-y'] }
    ]
  }
});

const PORTABLE_TOOLCHAIN = Object.freeze({
  java: {
    destination: 'java',
    executableNames: ['java.exe']
  },
  git: {
    archiveName: 'mingit.zip',
    destination: 'git',
    async source() {
      const metadata = await fetchJson('https://api.github.com/repos/git-for-windows/git/releases/latest');
      const asset = (metadata.assets || []).find((candidate) => /^MinGit-.*-64-bit\.zip$/i.test(candidate.name));
      if (!asset?.browser_download_url) throw new Error('The official Git for Windows release does not currently publish a MinGit x64 archive.');
      return { url: asset.browser_download_url, sha256: asset.digest?.replace(/^sha256:/i, '') || null };
    },
    executableNames: ['git.exe']
  }
});

function toBoolean(value) {
  return value === true || value === 'true';
}

function stringValue(value, fallback = '') {
  return value === undefined || value === null ? fallback : String(value);
}

function safeSlug(value) {
  return stringValue(value)
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'minecraft-server';
}

function validVersion(value) {
  return /^\d+\.\d+(?:\.\d+)?$/.test(stringValue(value));
}

function javaInstallerDependencyForFeature(feature, portableSource) {
  const plan = javaRuntime.createJavaInstallPlan(feature, { portableSource });
  return {
    ...DEPENDENCIES.java,
    label: plan.label,
    installers: plan.packageInstallers.map((installer) => ({
      command: installer.command,
      args: [...installer.args]
    })),
    installPlan: plan
  };
}

function managedJavaPortableSpec(feature, portableSource) {
  const plan = javaRuntime.createJavaInstallPlan(feature, { portableSource });
  return {
    archiveName: plan.portable.archiveName || 'java-' + plan.feature + '-windows.zip',
    destination: path.join('java', String(plan.feature), plan.portable.sha256 ? plan.portable.sha256.slice(0, 16) : 'unresolved'),
    executableNames: ['java.exe', 'java'],
    async source() {
      if (plan.portable.state !== 'configured') throw new Error(plan.portable.reason);
      return { ...plan.portable };
    }
  };
}

function normalizeProperties(input = {}) {
  const normalized = { ...DEFAULT_PROPERTIES };
  for (const [key, value] of Object.entries(input)) {
    if (ALLOWED_PROPERTY_KEYS.has(key)) {
      normalized[key] = stringValue(value);
    }
  }
  return normalized;
}

function normalizeGameRules(input = {}) {
  return configPluginSafety.normalizeManagedGameRules({ ...DEFAULT_GAMERULES, ...(input || {}) });
}

function normalizeLaunchProfile(input = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const gc = ['auto', 'g1', 'zgc', 'serial'].includes(source.gc) ? source.gc : 'g1';
  const diagnostics = ['off', 'gc-log', 'jfr', 'jcmd-ready'].includes(source.diagnostics) ? source.diagnostics : 'off';
  const rawTokens = Array.isArray(source.expertTokens)
    ? source.expertTokens
    : stringValue(source.expertTokens).trim() ? stringValue(source.expertTokens).trim().split(/\s+/) : [];
  if (rawTokens.length > 16) throw new Error('Use at most 16 reviewed expert JVM tokens.');
  const expertTokens = rawTokens.map((token) => stringValue(token).trim()).filter(Boolean);
  const safePatterns = [
    /^-XX:\+UseStringDeduplication$/,
    /^-XX:MaxGCPauseMillis=\d{1,6}$/,
    /^-XX:ParallelGCThreads=\d{1,4}$/,
    /^-XX:ConcGCThreads=\d{1,4}$/
  ];
  for (const token of expertTokens) {
    if (token.length > 128 || /[\r\n\0]/.test(token) || token.startsWith('@') || !safePatterns.some((pattern) => pattern.test(token))) {
      throw new Error('Expert JVM tokens must be individually approved safe JVM options. Agents, native libraries, class paths, argument files, remote management, and operating-system command hooks are blocked.');
    }
  }
  return { gc, diagnostics, expertTokens };
}

function parseMemoryGb(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 1 || numeric > 128) {
    throw new Error('Memory must be between 1 GB and 128 GB.');
  }
  return Math.round(numeric);
}

function redactOutput(value) {
  return stringValue(value).replace(/(password|token|secret)=\S+/gi, '$1=[redacted]');
}

function boundedCommandDiscoveryText(lines = []) {
  let result = '';
  let truncated = false;
  for (const line of lines) {
    const next = `${result}${result ? '\n' : ''}${String(line ?? '')}`;
    if (Buffer.byteLength(next, 'utf8') > MAX_COMMAND_DISCOVERY_RESPONSE_BYTES) {
      truncated = true;
      break;
    }
    result = next;
  }
  return { text: result, truncated };
}

function commandDiscoveryPause(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function boundedDiscoveryLabel(value, maximum) {
  return stringValue(value).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, maximum);
}

function normalizeCommandDiscoveryProvenance(entry) {
  const raw = entry?.provenance || entry?.metadata?.provenance || (typeof entry?.request === 'object' ? entry.request : null);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const argv = Array.isArray(raw.argv)
    ? raw.argv.slice(0, 8).map((value) => boundedDiscoveryLabel(value, 2048)).filter(Boolean)
    : [];
  const result = {
    adapter: boundedDiscoveryLabel(raw.adapter || '', 128) || null,
    transport: boundedDiscoveryLabel(raw.transport || '', 64) || null,
    javaExecutable: boundedDiscoveryLabel(raw.javaExecutable || '', 2048) || null,
    jarPath: boundedDiscoveryLabel(raw.jarPath || '', 2048) || null,
    host: boundedDiscoveryLabel(raw.host || '', 128) || null,
    port: Number.isInteger(raw.port) && raw.port >= 1 && raw.port <= 65535 ? raw.port : null,
    argv
  };
  return Object.values(result).some((value) => Array.isArray(value) ? value.length : Boolean(value)) ? result : null;
}

function normalizeCommandDiscoveryEntry(entry, allowedRequests) {
  if (!entry || typeof entry !== 'object') return null;
  const requestSource = typeof entry.request === 'string' ? entry.request : entry.probe;
  const request = stringValue(requestSource).trim().replace(/^\//, '').toLowerCase();
  if (!allowedRequests.includes(request)) return null;
  const output = boundedCommandDiscoveryText([redactOutput(entry.text || entry.response || entry.output || entry.metadata?.error || '')]);
  const flags = Array.isArray(entry.flags)
    ? entry.flags.map((flag) => stringValue(flag).trim()).filter((flag) => /^--[A-Za-z0-9][A-Za-z0-9-]{0,127}$/.test(flag)).slice(0, 128)
    : [];
  return {
    source: boundedDiscoveryLabel(entry.source || 'local-runtime', 128) || 'local-runtime',
    route: boundedDiscoveryLabel(entry.route || '', 64) || null,
    request,
    capturedAt: boundedDiscoveryLabel(entry.capturedAt || entry.finishedAt || entry.at || '', 64) || null,
    state: ['captured', 'failed', 'skipped'].includes(entry.state) ? entry.state : 'captured',
    exitCode: Number.isInteger(entry.exitCode) ? entry.exitCode : null,
    timedOut: Boolean(entry.timedOut),
    truncated: Boolean(entry.truncated || output.truncated),
    text: output.text,
    flags,
    provenance: normalizeCommandDiscoveryProvenance(entry)
  };
}

function normalizeCommandDiscoveryState(value = {}) {
  const input = value && typeof value === 'object' ? value : {};
  const normalizeEntries = (entries, allowedRequests) => (Array.isArray(entries) ? entries : [])
    .slice(0, MAX_COMMAND_DISCOVERY_RESPONSES)
    .map((entry) => normalizeCommandDiscoveryEntry(entry, allowedRequests))
    .filter(Boolean);
  return {
    jarProbes: normalizeEntries(input.jarProbes, ['--help', '--version', 'help', 'version']),
    liveResponses: normalizeEntries(input.liveResponses, ['help', 'plugins', 'paper']),
    updatedAt: boundedDiscoveryLabel(input.updatedAt || '', 64) || null
  };
}

function commandDiscoverySummary(value = {}) {
  const normalized = normalizeCommandDiscoveryState(value);
  return {
    jarProbeCount: normalized.jarProbes.length,
    liveResponseCount: normalized.liveResponses.length,
    updatedAt: normalized.updatedAt
  };
}

async function pathExists(candidate) {
  try {
    await fs.access(candidate);
    return true;
  } catch {
    return false;
  }
}

async function findFileRecursively(root, names, depth = 4) {
  if (depth < 0 || !(await pathExists(root))) return null;
  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    const candidate = path.join(root, entry.name);
    if (entry.isFile() && names.includes(entry.name.toLowerCase())) return candidate;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const found = await findFileRecursively(path.join(root, entry.name), names, depth - 1);
    if (found) return found;
  }
  return null;
}

async function knownJavaInstallationCandidates(dataDir) {
  const roots = [
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Eclipse Adoptium'),
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Java'),
    path.join(process.env.LOCALAPPDATA || dataDir, 'Programs', 'Eclipse Adoptium'),
    path.join(process.env.LOCALAPPDATA || dataDir, 'Programs', 'Java')
  ];
  const candidates = [];
  for (const root of [...new Set(roots)]) {
    let entries;
    try {
      entries = await fs.readdir(root, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries.slice(0, MAX_MANAGED_JAVA_RUNTIMES)) {
      if (!entry.isDirectory()) continue;
      for (const executableName of process.platform === 'win32' ? ['java.exe', 'java'] : ['java', 'java.exe']) {
        const candidate = path.join(root, entry.name, 'bin', executableName);
        if (await pathExists(candidate)) candidates.push(candidate);
      }
    }
  }
  return candidates;
}

async function writeJsonAtomically(target, value) {
  const directory = path.dirname(target);
  await fs.mkdir(directory, { recursive: true });
  const temporary = `${target}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await fs.rename(temporary, target);
}

async function commandExists(command) {
  const lookup = process.platform === 'win32' ? 'where.exe' : 'which';
  return new Promise((resolve) => {
    let output = '';
    const child = spawn(lookup, [command], { windowsHide: true, shell: false });
    child.stdout.on('data', (chunk) => { output += chunk.toString(); });
    child.once('error', () => resolve({ available: false, path: null }));
    child.once('close', (code) => {
      const first = output.split(/\r?\n/).map((line) => line.trim()).find(Boolean) || null;
      resolve({ available: code === 0 && Boolean(first), path: first });
    });
  });
}

function runCommand(command, args, onLine) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, shell: false });
    let stdout = '';
    let stderr = '';
    const forward = (chunk, channel) => {
      const text = chunk.toString();
      if (channel === 'stdout') stdout += text;
      else stderr += text;
      for (const line of text.split(/\r?\n/)) {
        if (line.trim()) onLine?.(redactOutput(line));
      }
    };
    child.stdout.on('data', (chunk) => forward(chunk, 'stdout'));
    child.stderr.on('data', (chunk) => forward(chunk, 'stderr'));
    child.once('error', reject);
    child.once('close', (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

async function expandZip(archive, destination, onLine) {
  const quote = (value) => String(value).replace(/'/g, "''");
  const script = `$ErrorActionPreference = 'Stop'; Expand-Archive -LiteralPath '${quote(archive)}' -DestinationPath '${quote(destination)}' -Force`;
  const result = await runCommand('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], onLine);
  if (result.code !== 0) throw new Error(`Portable tool extraction failed: ${redactOutput(result.stderr || result.stdout).slice(-1000)}`);
}

async function getCommandVersion(executable, args) {
  try {
    const result = await runCommand(executable, args);
    return redactOutput(`${result.stdout}\n${result.stderr}`).trim().split(/\r?\n/)[0] || null;
  } catch {
    return null;
  }
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Minecraft-Server-Studio/0.1.0' },
    signal: AbortSignal.timeout(30_000)
  });
  if (!response.ok) {
    throw new Error(`Download metadata failed with HTTP ${response.status}.`);
  }
  return response.json();
}

async function downloadFile(url, destination, expectedSha256, emit) {
  emit?.(`Downloading ${url}`);
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Minecraft-Server-Studio/0.1.0' },
    signal: AbortSignal.timeout(120_000)
  });
  if (!response.ok || !response.body) {
    throw new Error(`Download failed with HTTP ${response.status}.`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length) throw new Error('Downloaded file was empty.');
  if (expectedSha256) {
    const actual = crypto.createHash('sha256').update(bytes).digest('hex');
    if (actual.toLowerCase() !== String(expectedSha256).toLowerCase()) {
      throw new Error('Downloaded file did not match the publisher-provided SHA-256 value.');
    }
  }
  await fs.writeFile(destination, bytes);
  emit?.(`Saved ${path.basename(destination)} (${Math.ceil(bytes.length / 1024 / 1024)} MB).`);
}

function owns(record, key) {
  return Boolean(record) && Object.prototype.hasOwnProperty.call(record, key);
}

function plainManagementRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function discoveryStatusForManagement(management) {
  const endpoint = stringValue(management?.endpoint).trim();
  if (!endpoint) return { state: 'missing', snapshot: null };
  return discoverySnapshotStatus(management?.discovery, endpoint, {
    allowInsecureLoopback: Boolean(management?.allowInsecureLoopback)
  });
}

function managementStateFor({ endpoint, credentialConfigured, discoveryState }) {
  if (!endpoint) return 'not-configured';
  if (credentialConfigured) return 'authentication-adapter-required';
  if (discoveryState === 'ready') return 'ready';
  if (discoveryState === 'expired') return 'discovery-expired';
  if (discoveryState === 'endpoint-mismatch') return 'discovery-endpoint-changed';
  if (discoveryState === 'invalid') return 'discovery-invalid';
  return 'configured';
}

function copyDiscoverySnapshot(snapshot, state = null) {
  if (!snapshot) return null;
  const copy = {
    schemaVersion: snapshot.schemaVersion,
    protocol: snapshot.protocol,
    version: snapshot.version,
    discoveredAt: snapshot.discoveredAt,
    expiresAt: snapshot.expiresAt,
    methods: snapshot.methods.map((method) => ({ ...method })),
    capabilities: [...snapshot.capabilities]
  };
  if (state) copy.state = state;
  return copy;
}

function normalizeManagementForStorage(currentValue, patchValue) {
  const current = plainManagementRecord(currentValue);
  const patch = plainManagementRecord(patchValue);
  const endpoint = owns(patch, 'endpoint')
    ? stringValue(patch.endpoint).trim()
    : stringValue(current.endpoint).trim();
  const allowInsecureLoopback = owns(patch, 'allowInsecureLoopback')
    ? Boolean(patch.allowInsecureLoopback)
    : Boolean(current.allowInsecureLoopback);
  const credentialConfigured = owns(patch, 'credentialConfigured')
    ? Boolean(patch.credentialConfigured)
    : Boolean(current.credentialConfigured);
  const endpointChanged = endpoint !== stringValue(current.endpoint).trim()
    || allowInsecureLoopback !== Boolean(current.allowInsecureLoopback);

  let snapshot = null;
  let discoveryState = 'missing';
  if (owns(patch, 'discovery')) {
    if (!endpoint) throw new Error('A management endpoint is required before discovery metadata can be stored.');
    const status = discoverySnapshotStatus(patch.discovery, endpoint, { allowInsecureLoopback });
    if (status.state !== 'ready') {
      throw new Error('Only a current, endpoint-matching rpc.discover allowlist may be stored for a management connection.');
    }
    snapshot = status.snapshot;
    discoveryState = status.state;
  } else if (!endpointChanged && current.discovery) {
    const status = discoveryStatusForManagement({ endpoint, allowInsecureLoopback, discovery: current.discovery });
    if (status.state === 'ready' || status.state === 'expired') snapshot = status.snapshot;
    discoveryState = status.state;
  }

  return {
    endpoint,
    allowInsecureLoopback,
    credentialConfigured,
    state: managementStateFor({ endpoint, credentialConfigured, discoveryState }),
    discoveredAt: snapshot?.discoveredAt || null,
    expiresAt: snapshot?.expiresAt || null,
    capabilities: discoveryState === 'ready' ? snapshot.methods.map((method) => method.name) : [],
    discovery: snapshot ? copyDiscoverySnapshot(snapshot) : null
  };
}

function copyPublicManagement(server) {
  const stored = plainManagementRecord(server.management);
  const endpoint = stringValue(stored.endpoint).trim();
  const allowInsecureLoopback = Boolean(stored.allowInsecureLoopback);
  const credentialConfigured = Boolean(stored.credentialConfigured);
  const discoveryStatus = discoveryStatusForManagement({
    endpoint,
    allowInsecureLoopback,
    discovery: stored.discovery
  });
  const state = managementStateFor({
    endpoint,
    credentialConfigured,
    discoveryState: discoveryStatus.state
  });
  const discovery = copyDiscoverySnapshot(discoveryStatus.snapshot, discoveryStatus.state);
  const readyForInvocation = state === 'ready' && discoveryStatus.state === 'ready';
  return {
    endpoint,
    allowInsecureLoopback,
    state,
    discoveredAt: discovery?.discoveredAt || null,
    expiresAt: discovery?.expiresAt || null,
    capabilities: readyForInvocation ? discovery.methods.map((method) => method.name) : [],
    discovery,
    authentication: {
      state: credentialConfigured ? 'provider-adapter-required' : 'no-provider-adapter',
      credentialConfigured,
      message: credentialConfigured
        ? 'A protected credential is stored, but this build has no documented provider-specific authentication adapter and will not send it.'
        : 'No provider-specific authentication adapter is configured. Endpoints that require authentication are unavailable in this build.'
    }
  };
}

function safeHttpsDownloadUrl(value) {
  let parsed;
  try {
    parsed = new URL(String(value || '').trim());
  } catch {
    throw new Error('The portable Java provider returned an invalid download URL.');
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    throw new Error('The portable Java provider download URL must use HTTPS without embedded credentials.');
  }
  return parsed;
}

async function fetchHttpsWithRedirects(url, timeoutMs = 120_000) {
  let current = safeHttpsDownloadUrl(url);
  for (let redirects = 0; redirects <= 5; redirects += 1) {
    let response;
    try {
      response = await fetch(current, {
        headers: { 'User-Agent': 'Minecraft-Server-Studio/0.1.0' },
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs)
      });
    } catch (error) {
      throw new Error('The portable Java download request failed: ' + redactOutput(error && error.message || 'network error').slice(0, 512));
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new Error('The portable Java download redirected without a destination.');
      current = safeHttpsDownloadUrl(new URL(location, current).toString());
      continue;
    }
    if (!response.ok || !response.body) throw new Error('The portable Java download failed with HTTP ' + response.status + '.');
    return response;
  }
  throw new Error('The portable Java download exceeded the allowed HTTPS redirect limit.');
}

async function downloadVerifiedPortableJavaArchive(source, destination, emit) {
  const expectedBytes = Number(source && source.expectedBytes);
  const expectedSha256 = String(source && source.sha256 || '').toLowerCase();
  if (!Number.isSafeInteger(expectedBytes) || expectedBytes < 1 || expectedBytes > MAX_PORTABLE_JAVA_BYTES) {
    throw new Error('The portable Java provider metadata did not include a bounded archive size.');
  }
  if (!/^[a-f0-9]{64}$/i.test(expectedSha256)) {
    throw new Error('The portable Java provider metadata did not include a valid SHA-256 checksum.');
  }
  const temporary = destination + '.' + crypto.randomUUID() + '.part';
  let handle;
  try {
    emit?.('Downloading a verified portable Java archive from the official provider.');
    const response = await fetchHttpsWithRedirects(source.url);
    handle = await fs.open(temporary, 'w', 0o600);
    const hash = crypto.createHash('sha256');
    let received = 0;
    for await (const chunk of response.body) {
      const bytes = Buffer.from(chunk);
      received += bytes.length;
      if (received > expectedBytes) throw new Error('The portable Java download exceeded the provider-reported archive size.');
      hash.update(bytes);
      await handle.write(bytes);
    }
    await handle.close();
    handle = null;
    if (received !== expectedBytes) {
      throw new Error('The portable Java download size did not match the provider metadata.');
    }
    if (hash.digest('hex').toLowerCase() !== expectedSha256) {
      throw new Error('The portable Java download did not match the provider SHA-256 checksum.');
    }
    await fs.rename(temporary, destination);
    emit?.('Portable Java archive passed provider size and SHA-256 validation.');
  } catch (error) {
    if (handle) await handle.close().catch(() => {});
    await fs.rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}

function safePortableArchiveEntry(value) {
  const entry = String(value || '').trim().replace(/\\/g, '/');
  if (!entry || entry.length > 1_024 || entry.includes('\0') || entry.startsWith('/') || /^[A-Za-z]:/.test(entry)) return false;
  const parts = entry.split('/').filter(Boolean);
  return parts.length > 0 && parts.every((part) => part !== '.' && part !== '..');
}

async function assertPortableRuntimeTree(root) {
  const pending = [{ directory: root, depth: 0 }];
  let entriesSeen = 0;
  while (pending.length) {
    const current = pending.pop();
    if (current.depth > 8) throw new Error('Portable Java extraction exceeded the allowed directory depth.');
    let entries;
    try {
      entries = await fs.readdir(current.directory, { withFileTypes: true });
    } catch {
      throw new Error('Portable Java extraction could not be inspected safely.');
    }
    for (const entry of entries) {
      entriesSeen += 1;
      if (entriesSeen > 20_000) throw new Error('Portable Java extraction exceeded the allowed entry count.');
      const candidate = path.join(current.directory, entry.name);
      const stat = await fs.lstat(candidate);
      if (stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory())) {
        throw new Error('Portable Java extraction contained an unsupported link or special filesystem entry.');
      }
      if (stat.isDirectory()) pending.push({ directory: candidate, depth: current.depth + 1 });
    }
  }
}

async function extractPortableJavaArchive(archive, destination, onLine) {
  const tar = await commandExists(process.platform === 'win32' ? 'tar.exe' : 'tar');
  if (!tar.available) throw new Error('The operating-system archive extractor is unavailable for the verified portable Java ZIP.');
  const executable = tar.path || (process.platform === 'win32' ? 'tar.exe' : 'tar');
  const listing = await javaRuntime.runDirect(executable, ['-tf', archive], {
    timeoutMs: 30_000,
    maximumBytes: 512 * 1024
  });
  if (!listing.started || listing.timedOut || listing.code !== 0) {
    throw new Error('Portable Java archive validation failed: ' + redactOutput(listing.error || listing.stderr || listing.stdout || 'archive listing exited ' + listing.code).slice(-1_000));
  }
  const entries = listing.stdout.split(/\r?\n/).filter(Boolean);
  if (!entries.length || entries.length > 20_000 || entries.some((entry) => !safePortableArchiveEntry(entry))) {
    throw new Error('Portable Java archive validation rejected an unsafe or unsupported entry path.');
  }
  const result = await javaRuntime.runDirect(executable, ['-xf', archive, '-C', destination], {
    timeoutMs: 30_000,
    maximumBytes: 32 * 1024
  });
  for (const line of (result.stdout + '\n' + result.stderr).split(/\r?\n/)) {
    if (line.trim()) onLine?.(redactOutput(line));
  }
  if (!result.started || result.timedOut || result.code !== 0) {
    throw new Error('Portable Java extraction failed: ' + redactOutput(result.error || result.stderr || result.stdout || 'archive extractor exited ' + result.code).slice(-1_000));
  }
  await assertPortableRuntimeTree(destination);
}

function pathIsWithin(root, candidate) {
  if (!root || !candidate) return false;
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return Boolean(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function backupDirectoryForDisplay(storageRoot, server) {
  const serverId = stringValue(server?.id).trim();
  if (!/^[A-Za-z0-9._-]{1,160}$/.test(serverId)) throw new Error('The selected server has an invalid local backup identifier.');
  return path.join(path.resolve(storageRoot), serverId);
}

function copyPublicPaperUpdate(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
  return {
    state: stringValue(record.state).slice(0, 64) || 'unknown',
    updatedAt: record.updatedAt || null,
    rolledBackAt: record.rolledBackAt || null,
    build: Number.isSafeInteger(record.build) ? record.build : null,
    minecraftVersion: stringValue(record.minecraftVersion).slice(0, 64) || null,
    releaseSha256: /^[a-f0-9]{64}$/i.test(stringValue(record.releaseSha256)) ? stringValue(record.releaseSha256).toLowerCase() : null,
    backupId: /^[A-Za-z0-9._-]{1,160}$/.test(stringValue(record.backupId)) ? stringValue(record.backupId) : null,
    rollbackAvailable: Boolean(record.rollbackJar)
  };
}

function copyPublicServer(server) {
  return {
    id: server.id,
    name: server.name,
    software: server.software,
    minecraftVersion: server.minecraftVersion,
    serverPath: server.serverPath,
    memoryGb: server.memoryGb,
    javaPath: server.javaPath || '',
    launchProfile: { ...normalizeLaunchProfile(server.launchProfile) },
    rconSecretConfigured: Boolean(server.rconSecretConfigured),
    eulaAccepted: Boolean(server.eulaAccepted),
    gameRules: { ...normalizeGameRules(server.gameRules) },
    gameRuleStatus: currentGameRuleStatus(server),
    management: copyPublicManagement(server),
    commandDiscovery: commandDiscoverySummary(server.commandDiscovery),
    paperUpdate: copyPublicPaperUpdate(server.lastPaperUpdate),
    createdAt: server.createdAt,
    updatedAt: server.updatedAt,
    settings: { ...server.settings }
  };
}

function normalizeManagedJavaRuntimeRecord(value) {
  const record = value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  if (!record) return null;
  const feature = Number(record.feature);
  const executable = stringValue(record.path).trim();
  if (!javaRuntime.SUPPORTED_JAVA_FEATURES.includes(feature) || !executable || /[\r\n\0]/.test(executable) || !path.isAbsolute(executable)) {
    return null;
  }
  const plan = javaRuntime.createJavaInstallPlan(feature, { portableSource: record.source });
  if (plan.portable.state !== 'configured') return null;
  return {
    feature,
    path: path.resolve(executable),
    source: { ...plan.portable },
    installedAt: stringValue(record.installedAt).trim() || null,
    verifiedAt: stringValue(record.verifiedAt).trim() || null
  };
}

function copyGameRuleStatus(input) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const result = {};
  for (const name of Object.keys(configPluginSafety.MANAGED_GAME_RULES)) {
    const candidate = source[name];
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue;
    const compatibility = configPluginSafety.gameRuleCompatibility(candidate.selectedVersion || '', name);
    result[name] = {
      value: candidate.value === true,
      state: ['saved-pending-server-start', 'saved-version-incompatible', 'sent-local-console', 'sent-rcon', 'saved-no-live-transport', 'failed'].includes(candidate.state)
        ? candidate.state
        : 'saved-pending-server-start',
      transport: ['local-console', 'rcon', 'none'].includes(candidate.transport) ? candidate.transport : 'none',
      selectedVersion: stringValue(candidate.selectedVersion || compatibility.selectedVersion || '').slice(0, 32),
      minimumVersion: compatibility.minimumVersion,
      detail: stringValue(candidate.detail).slice(0, 512),
      updatedAt: candidate.updatedAt || null
    };
  }
  return result;
}

function currentGameRuleStatus(server) {
  const result = { ...copyGameRuleStatus(server.gameRuleStatus) };
  const gameRules = normalizeGameRules(server.gameRules);
  for (const name of Object.keys(configPluginSafety.MANAGED_GAME_RULES)) {
    if (result[name]) continue;
    const compatibility = configPluginSafety.gameRuleCompatibility(server.minecraftVersion, name);
    result[name] = {
      value: Boolean(gameRules[name]),
      state: compatibility.supported ? 'saved-pending-server-start' : 'saved-version-incompatible',
      transport: 'none',
      selectedVersion: server.minecraftVersion,
      minimumVersion: compatibility.minimumVersion,
      detail: compatibility.supported
        ? `No live delivery record exists yet. The stored value can be sent through a supported local console or RCON route after a save or managed start.`
        : compatibility.reason,
      updatedAt: null
    };
  }
  return result;
}

function initialGameRuleStatus(server, ruleNames = Object.keys(configPluginSafety.MANAGED_GAME_RULES)) {
  const result = { ...currentGameRuleStatus(server) };
  for (const name of ruleNames) {
    if (!Object.prototype.hasOwnProperty.call(configPluginSafety.MANAGED_GAME_RULES, name)) continue;
    const compatibility = configPluginSafety.gameRuleCompatibility(server.minecraftVersion, name);
    result[name] = {
      value: Boolean(server.gameRules?.[name]),
      state: compatibility.supported ? 'saved-pending-server-start' : 'saved-version-incompatible',
      transport: 'none',
      selectedVersion: server.minecraftVersion,
      detail: compatibility.supported
        ? `Saved for Minecraft ${server.minecraftVersion}; it will be sent through a live command transport after the server starts.`
        : compatibility.reason,
      updatedAt: new Date().toISOString()
    };
  }
  return result;
}

function safePluginRecord(input) {
  const record = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const descriptor = configPluginSafety.publicPluginDescriptor(record.descriptor);
  const fileName = stringValue(record.fileName).trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._ -]{0,180}\.jar$/i.test(fileName)) return null;
  const sha256 = stringValue(record.sha256).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(sha256)) return null;
  return {
    id: /^[0-9a-f-]{36}$/i.test(stringValue(record.id)) ? record.id : crypto.randomUUID(),
    state: ['staged', 'promoted'].includes(record.state) ? record.state : 'staged',
    fileName,
    sha256,
    descriptor,
    plannedAt: record.plannedAt || new Date().toISOString(),
    promotedAt: record.promotedAt || null,
    lastBlockedReason: stringValue(record.lastBlockedReason).slice(0, 512),
    rollback: record.rollback && typeof record.rollback === 'object' && !Array.isArray(record.rollback)
      ? {
        action: stringValue(record.rollback.action).slice(0, 128),
        fileName: stringValue(record.rollback.fileName).slice(0, 256),
        requiresConfirmation: record.rollback.requiresConfirmation !== false
      }
      : null
  };
}

function normalizePluginRecords(input) {
  const records = Array.isArray(input) ? input : [];
  const result = [];
  for (const item of records.slice(-256)) {
    const record = safePluginRecord(item);
    if (record) result.push(record);
  }
  return result;
}

function pathInside(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}

class ServerManager {
  constructor(options = {}) {
    this.dataDir = options.dataDir || path.join(os.homedir(), '.minecraft-server-studio');
    this.onEvent = options.onEvent || (() => {});
    this.credentialSecretProvider = typeof options.credentialSecretProvider === 'function'
      ? options.credentialSecretProvider
      : null;
    this.processes = new Map();
    this.statusEvents = [];
    this.statusOperations = new Map();
    this.statusEvidence = new Map();
    this.statusUpdatedAt = new Date().toISOString();
    this.buildToolsMetadata = null;
    this.buildToolsPlans = new Map();
    this.commandDiscovery = new Map();
    this.consoleQueues = new Map();
    this.consoleQueues = new Map();
    this.backupStorageDir = path.join(this.dataDir, 'backups');
    this.backupPlans = new Map();
    this.restorePlans = new Map();
    this.paperUpdatePlans = new Map();
    this.paperRollbackPlans = new Map();
    this.registryFile = path.join(this.dataDir, 'servers.json');
    this.toolchainDir = path.join(this.dataDir, 'toolchain');
    this.managedJavaInventoryFile = path.join(this.toolchainDir, 'java-runtimes.json');
    this.managedJavaPaths = new Set();
    this.managedJavaInventoryRefresh = null;
  }

  emit(event) {
    const emitted = { at: new Date().toISOString(), ...event };
    this.recordStatusEvent(emitted);
    this.onEvent(emitted);
  }

  recordStatusEvent(event) {
    const type = stringValue(event?.type, 'status-event').slice(0, 128);
    const message = redactOutput(stringValue(event?.message || event?.status || type)).slice(0, 1024);
    const state = type.includes('error') || type.includes('failed')
      ? 'failed'
      : type.includes('stopping') || type.includes('progress')
        ? 'running'
        : type.includes('provisioned') || type.includes('installed') || type.includes('created')
          ? 'complete'
          : 'idle';
    this.statusEvents.unshift({
      id: crypto.randomUUID(),
      type,
      message,
      state,
      occurredAt: event?.at || new Date().toISOString(),
      operationId: stringValue(event?.operationId || '').slice(0, 128)
    });
    if (this.statusEvents.length > 128) this.statusEvents.length = 128;
    this.statusUpdatedAt = new Date().toISOString();
  }

  beginStatusOperation(id, title, detail = '') {
    const operationId = stringValue(id).slice(0, 128);
    this.statusOperations.set(operationId, {
      id: operationId,
      title: stringValue(title).slice(0, 1024),
      state: 'running',
      startedAt: new Date().toISOString(),
      progress: null,
      detail: redactOutput(stringValue(detail)).slice(0, 4096),
      evidenceIds: []
    });
    this.statusUpdatedAt = new Date().toISOString();
    return operationId;
  }

  completeStatusOperation(id, state = 'complete', detail = '') {
    const operationId = stringValue(id).slice(0, 128);
    const operation = this.statusOperations.get(operationId);
    if (!operation) return;
    operation.state = ['complete', 'failed', 'cancelled', 'blocked'].includes(state) ? state : 'complete';
    operation.detail = redactOutput(stringValue(detail || operation.detail)).slice(0, 4096);
    this.statusUpdatedAt = new Date().toISOString();
  }

  recordLocalEvidence(id, title, detail, localPath = '') {
    const evidenceId = stringValue(id).slice(0, 128);
    this.statusEvidence.set(evidenceId, {
      id: evidenceId,
      title: stringValue(title).slice(0, 1024),
      kind: 'local-record',
      state: 'verified',
      localPath: stringValue(localPath).slice(0, 1024),
      recordedAt: new Date().toISOString(),
      detail: redactOutput(stringValue(detail)).slice(0, 4096)
    });
    this.statusUpdatedAt = new Date().toISOString();
  }

  async localStatusSnapshot() {
    const servers = await this.listServers();
    const dependencyInspection = await this.inspectDependencies();
    const dependencies = Object.values(dependencyInspection.dependencies || {});
    const missingDependencies = dependencies.filter((dependency) => !dependency.available);
    this.recordLocalEvidence('server-registry', 'Local server registry', `${servers.length} server definition(s) are stored locally.`, this.registryFile);
    this.recordLocalEvidence('dependency-inspection', 'Dependency inspection', missingDependencies.length
      ? `${missingDependencies.length} required tool(s) need installation or repair.`
      : 'All currently inspected tools are available.', this.toolchainDir);
    const currentState = this.statusOperations.size && [...this.statusOperations.values()].some((operation) => operation.state === 'running')
      ? 'running'
      : this.processes.size ? 'running' : 'idle';
    const nextSteps = [];
    if (missingDependencies.length) {
      nextSteps.push({
        id: 'install-missing-tools',
        label: 'Install or repair missing tools',
        state: 'waiting',
        detail: `Use Automatic setup to install or retry: ${missingDependencies.map((dependency) => dependency.label).join(', ')}.`,
        evidenceIds: ['dependency-inspection']
      });
    }
    if (!servers.length) {
      nextSteps.push({ id: 'create-server', label: 'Create a local server', state: 'waiting', detail: 'Use the structured creation dialog to create a Paper or Spigot server definition.', evidenceIds: ['server-registry'] });
    }
    if (servers.some((server) => !server.eulaAccepted)) {
      nextSteps.push({ id: 'eula-review', label: 'Review and accept the Minecraft EULA for selected servers', state: 'waiting', detail: 'A server cannot start until its own EULA acknowledgment is selected.', evidenceIds: ['server-registry'] });
    }
    if (!nextSteps.length) {
      nextSteps.push({ id: 'choose-server', label: 'Choose a server to inspect or operate', state: 'idle', detail: 'Select a local server to review setup, runtime, command, and status details.', evidenceIds: ['server-registry'] });
    }
    const snapshot = createLocalStatusSnapshot({
      currentState,
      lastUpdated: this.statusUpdatedAt,
      activeOperations: [...this.statusOperations.values()].filter((operation) => operation.state === 'running'),
      events: this.statusEvents,
      localEvidence: [...this.statusEvidence.values()],
      nextSteps
    });
    const completeness = createDesktopCompletenessInventory({ rows: STATUS_COMPLETENESS_ROWS });
    return { snapshot, completeness };
  }

  async refreshSpigotVersionMetadata() {
    const operationId = this.beginStatusOperation('spigot-version-metadata', 'Refresh official Spigot version metadata', 'Requesting the official Spigot metadata record after the user opened the refresh control.');
    try {
      const metadata = await fetchOfficialLiveVersionMetadata({ fetch });
      this.buildToolsMetadata = metadata;
      this.recordLocalEvidence('spigot-version-metadata', 'Official Spigot version metadata', `Fetched official version metadata at ${metadata.fetchedAt || new Date().toISOString()}.`);
      this.completeStatusOperation(operationId, 'complete', 'Official Spigot version metadata was received.');
      return metadata;
    } catch (error) {
      this.completeStatusOperation(operationId, 'failed', error.message);
      throw error;
    }
  }

  async buildToolsPreflight(id, input = {}) {
    const server = await this.getServer(id);
    if (server.software !== 'spigot') throw new Error('BuildTools planning is available only for a Spigot server definition.');
    const revision = stringValue(input.revision || server.minecraftVersion).trim();
    if (!validVersion(revision)) throw new Error('Choose an official numeric Minecraft revision before creating a BuildTools plan.');
    const workspace = stringValue(input.workspace).trim();
    if (!workspace) throw new Error('Choose a dedicated BuildTools workspace with the Browse control.');
    const operationId = `buildtools-${server.id}-${Date.now()}`;
    const java = await this.resolveJava(server);
    const preflight = await createBuildToolsPreflight({
      revision,
      operationId,
      serverHome: server.serverPath,
      workspace,
      javaExecutable: java,
      officialVersionMetadata: this.buildToolsMetadata,
      repositoryRoots: [process.cwd()],
      flags: {
        target: input.target || 'spigot',
        reuseMode: input.reuse ? 'compile-if-changed' : 'full-build',
        updatePolicy: input.update ? 'allow-update' : 'do-not-update',
        riskAcknowledgements: input.riskAcknowledgements || {},
        rawFallback: input.rawFallback || ''
      }
    });
    this.buildToolsPlans.set(id, preflight);
    this.recordLocalEvidence(`buildtools-plan-${server.id}`, 'BuildTools preflight', `Prepared an explicit, non-executing BuildTools preflight for ${revision}.`, workspace);
    this.emit({ type: 'buildtools-preflight', serverId: id, message: `Prepared a non-executing BuildTools preflight for ${revision}.` });
    return preflight;
  }

  async executeBuildToolsPlan(id, confirmation = {}) {
    const server = await this.getServer(id);
    if (server.software !== 'spigot') throw new Error('BuildTools execution is available only for a Spigot server definition.');
    if (this.processes.has(id)) throw new Error('Stop the selected server before promoting a new BuildTools JAR.');
    const preflight = this.buildToolsPlans.get(id);
    if (!preflight) throw new Error('Prepare a BuildTools preflight in the BuildTools tab before starting a build.');
    const authorized = authorizeBuildToolsPreflight(preflight, confirmation);
    const operationId = this.beginStatusOperation(`buildtools-execution-${id}`, `Build Spigot ${preflight.revision}`, 'Downloading official BuildTools into the isolated workspace.');
    try {
      const git = await this.findDependency('git');
      if (!git.available) throw new Error('Spigot BuildTools requires Git. Use the in-app installer before starting this build.');
      await fs.mkdir(preflight.workspace.buildDirectory, { recursive: true });
      await fs.mkdir(preflight.workspace.outputDirectory, { recursive: true });
      await downloadFile(preflight.buildTools.downloadUrl, preflight.buildTools.jarPath, null, (message) => this.emit({ type: 'provision-output', serverId: id, message }));
      this.emit({ type: 'provision-output', serverId: id, message: `Building Spigot ${preflight.revision} in the isolated BuildTools workspace.` });
      const result = await runCommand(authorized.command.executable, authorized.command.args, (line) => this.emit({ type: 'provision-output', serverId: id, message: line }));
      if (result.code !== 0) throw new Error(`BuildTools failed: ${redactOutput(result.stderr || result.stdout).slice(-1000)}`);
      const stagedSource = authorized.promotion.sourceBuildOutput;
      const stat = await fs.stat(stagedSource);
      if (!stat.isFile() || stat.size < 64 || stat.size > 2 * 1024 * 1024 * 1024) throw new Error('BuildTools did not produce a valid bounded server JAR at the planned output path.');
      const jarHandle = await fs.open(stagedSource, 'r');
      const header = Buffer.alloc(4);
      try {
        await jarHandle.read(header, 0, header.length, 0);
      } finally {
        await jarHandle.close();
      }
      if (!header.equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])) && !header.equals(Buffer.from([0x50, 0x4b, 0x05, 0x06]))) {
        throw new Error('BuildTools output did not have a JAR/ZIP signature. The existing server JAR was not changed.');
      }
      const promotion = authorized.promotion;
      await fs.mkdir(path.dirname(promotion.sameFilesystemStage), { recursive: true });
      await fs.mkdir(path.dirname(promotion.rollbackJar), { recursive: true });
      await fs.copyFile(stagedSource, promotion.sameFilesystemStage);
      if (await pathExists(promotion.finalJar)) await fs.rename(promotion.finalJar, promotion.rollbackJar);
      await fs.rename(promotion.sameFilesystemStage, promotion.finalJar);
      this.recordLocalEvidence(`buildtools-output-${id}`, 'Staged Spigot server JAR', `BuildTools produced and promoted Spigot ${preflight.revision}; the prior JAR remains in the rollback path when one existed.`, promotion.finalJar);
      this.completeStatusOperation(operationId, 'complete', `Spigot ${preflight.revision} was staged and promoted using the rollback plan.`);
      this.emit({ type: 'server-provisioned', serverId: id, message: `Spigot ${preflight.revision} is ready with a rollback record.` });
      return { server: copyPublicServer(server), jarPath: promotion.finalJar, reused: false, rollbackJar: promotion.rollbackJar };
    } catch (error) {
      this.completeStatusOperation(operationId, 'failed', error.message);
      throw error;
    }
  }

  pluginStagingDirectory(server) {
    const root = path.resolve(server.serverPath);
    const directory = path.resolve(root, '.minecraft-server-studio', 'plugin-staging');
    if (!pathInside(root, directory)) throw new Error('The app-managed plugin staging location escaped the selected server folder.');
    return directory;
  }

  pluginDestinationPath(server, fileName) {
    const root = path.resolve(server.serverPath);
    const destination = path.resolve(root, 'plugins', fileName);
    const pluginsRoot = path.resolve(root, 'plugins');
    if (!pathInside(pluginsRoot, destination) || path.dirname(destination) !== pluginsRoot) {
      throw new Error('The plugin destination escaped the server plugins folder.');
    }
    return destination;
  }

  async inspectInstalledPluginJars(server) {
    const pluginsPath = path.join(server.serverPath, 'plugins');
    if (!(await pathExists(pluginsPath))) return [];
    const entries = await fs.readdir(pluginsPath, { withFileTypes: true });
    const candidates = entries.filter((entry) => entry.isFile() && /\.jar$/i.test(entry.name)).sort((left, right) => left.name.localeCompare(right.name));
    if (candidates.length > 128) throw new Error('The plugin dependency plan is bounded to 128 installed JARs. Remove or separately review extra plugin files before adding another one.');
    const inspected = [];
    let totalBytes = 0;
    for (const entry of candidates) {
      const candidatePath = path.join(pluginsPath, entry.name);
      try {
        const stats = await fs.lstat(candidatePath);
        if (totalBytes + stats.size > 2 * 1024 * 1024 * 1024) {
          inspected.push({ state: 'installed', fileName: entry.name, inspectionError: 'Installed plugin inspection exceeds the 2 GB aggregate safety bound.' });
          break;
        }
        totalBytes += stats.size;
        const inspection = await configPluginSafety.inspectPluginJar(candidatePath);
        inspected.push({ state: 'installed', fileName: entry.name, ...inspection });
      } catch (error) {
        inspected.push({ state: 'installed', fileName: entry.name, inspectionError: redactOutput(error.message).slice(0, 512) });
      }
    }
    return inspected;
  }

  async planPluginInstallation(id, sourcePath) {
    const server = await this.getServer(id);
    const source = await configPluginSafety.inspectPluginJar(sourcePath);
    const installed = await this.inspectInstalledPluginJars(server);
    const pendingFileNames = normalizePluginRecords(server.pluginInstallations)
      .filter((record) => record.state === 'staged')
      .map((record) => record.fileName);
    return configPluginSafety.createPluginInstallationPlan({
      server,
      source,
      installed,
      pendingFileNames,
      serverRunning: this.processes.has(id)
    });
  }

  async pluginDescriptors(server) {
    const pluginsPath = path.join(server.serverPath, 'plugins');
    if (!(await pathExists(pluginsPath))) return [];
    const entries = await fs.readdir(pluginsPath, { withFileTypes: true });
    const descriptors = [];
    for (const entry of entries.filter((candidate) => candidate.isFile() && /\.jar$/i.test(candidate.name)).slice(0, 256)) {
      try {
        const descriptor = await inspectPluginJarFile(path.join(pluginsPath, entry.name));
        descriptors.push(descriptor);
      } catch (error) {
        descriptors.push({ name: entry.name, inspectionError: redactOutput(error.message).slice(0, 512) });
      }
    }
    return descriptors;
  }

  commandDiscoveryRequests(server, input = {}) {
    const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
    const requestedSources = Array.isArray(source.sources) ? source.sources : [];
    const sources = new Set(requestedSources.filter((source) => ['selected-jar', 'local-console', 'rcon'].includes(source)));
    const allowedQueries = server.software === 'paper' ? ['help', 'plugins', 'paper'] : ['help', 'plugins'];
    const suppliedQueries = Array.isArray(source.queries) ? source.queries : [];
    const queries = [...new Set(suppliedQueries.map((query) => stringValue(query).trim().replace(/^\//, '').toLowerCase()).filter((query) => allowedQueries.includes(query)))];
    return {
      sources,
      queries
    };
  }

  async persistCommandDiscovery(id, discovery) {
    const registry = await this.registry();
    const index = registry.servers.findIndex((server) => server.id === id);
    if (index < 0) throw new Error('The selected server no longer exists in the local registry.');
    registry.servers[index].commandDiscovery = normalizeCommandDiscoveryState(discovery);
    registry.servers[index].updatedAt = new Date().toISOString();
    await this.saveRegistry(registry);
    return registry.servers[index];
  }

  recordCommandDiscoveryOutput(serverId, channel, message) {
    const active = this.commandDiscovery.get(serverId);
    if (!active) return;
    active.lastOutputAt = Date.now();
    const normalized = redactOutput(message);
    const current = boundedCommandDiscoveryText(active.lines);
    const candidate = boundedCommandDiscoveryText([...active.lines, normalized]);
    if (candidate.truncated || current.truncated) {
      active.truncated = true;
      return;
    }
    active.lines.push(normalized);
    if (channel === 'stderr') active.stderrLines += 1;
  }

  async captureLocalConsoleResponse(id, request) {
    const running = this.processes.get(id);
    if (!running) {
      return {
        source: 'live-local-console',
        route: ROUTES.LOCAL_CONSOLE,
        request,
        capturedAt: new Date().toISOString(),
        state: 'skipped',
        text: 'The local server process is not running in Minecraft Server Studio.'
      };
    }
    if (this.commandDiscovery.has(id)) throw new Error('Another runtime command discovery capture is already in progress for this server.');
    const capture = {
      request,
      lines: [],
      truncated: false,
      stderrLines: 0,
      lastOutputAt: Date.now(),
      startedAt: new Date().toISOString()
    };
    this.commandDiscovery.set(id, capture);
    try {
      running.child.stdin.write(`${request}\n`);
      await commandDiscoveryPause(COMMAND_DISCOVERY_SETTLE_MS);
      while (capture.lines.length && Date.now() - capture.lastOutputAt < COMMAND_DISCOVERY_QUIET_MS) {
        await commandDiscoveryPause(COMMAND_DISCOVERY_QUIET_MS);
      }
      const output = boundedCommandDiscoveryText(capture.lines);
      return {
        source: 'live-local-console',
        route: ROUTES.LOCAL_CONSOLE,
        request,
        capturedAt: new Date().toISOString(),
        state: 'captured',
        truncated: Boolean(capture.truncated || output.truncated),
        text: output.text,
        note: capture.stderrLines ? 'The bounded capture includes local stderr output after the explicit request.' : 'The bounded capture contains output observed after the explicit local-console request.'
      };
    } catch (error) {
      return {
        source: 'live-local-console',
        route: ROUTES.LOCAL_CONSOLE,
        request,
        capturedAt: new Date().toISOString(),
        state: 'failed',
        text: redactOutput(error.message).slice(0, 1024)
      };
    } finally {
      this.commandDiscovery.delete(id);
    }
  }

  async collectSelectedJarDiscovery(server) {
    if (this.processes.has(server.id)) {
      return ['--help', '--version'].map((request) => ({
        source: 'local-jar-probe',
        request,
        capturedAt: new Date().toISOString(),
        state: 'skipped',
        text: 'Stop the local server before probing its selected JAR with non-starting help/version arguments.'
      }));
    }
    const jarPath = path.join(server.serverPath, 'server.jar');
    if (!(await pathExists(jarPath))) {
      return ['--help', '--version'].map((request) => ({
        source: 'local-jar-probe',
        request,
        capturedAt: new Date().toISOString(),
        state: 'skipped',
        text: 'No selected server.jar exists yet. Provision the selected Paper or Spigot server before requesting JAR evidence.'
      }));
    }
    try {
      const javaPath = await this.resolveJava(server);
      const result = await probeSelectedJar({ javaPath, jarPath });
      return Array.isArray(result?.probes) ? result.probes : [];
    } catch (error) {
      return ['--help', '--version'].map((request) => ({
        source: 'local-jar-probe',
        request,
        capturedAt: new Date().toISOString(),
        state: 'failed',
        text: redactOutput(error.message).slice(0, 1024)
      }));
    }
  }

  async collectRconDiscovery(server, queries) {
    if (!toBoolean(server.settings?.['enable-rcon']) || !server.rconSecretConfigured) {
      return queries.map((request) => ({
        source: 'live-rcon',
        route: ROUTES.RCON,
        request,
        capturedAt: new Date().toISOString(),
        state: 'skipped',
        text: 'RCON is not enabled with a protected local credential for this server.'
      }));
    }
    if (!this.credentialSecretProvider) {
      return queries.map((request) => ({
        source: 'live-rcon',
        route: ROUTES.RCON,
        request,
        capturedAt: new Date().toISOString(),
        state: 'skipped',
        text: 'The protected RCON credential provider is unavailable in this app build.'
      }));
    }
    const password = await this.credentialSecretProvider('rcon', server.id);
    if (!password) {
      return queries.map((request) => ({
        source: 'live-rcon',
        route: ROUTES.RCON,
        request,
        capturedAt: new Date().toISOString(),
        state: 'skipped',
        text: 'No protected local RCON credential is available for this server.'
      }));
    }
    const results = [];
    for (const request of queries) {
      try {
        results.push(await queryLoopbackRconEvidence({
          port: Number(server.settings['rcon.port']),
          password,
          command: request
        }));
      } catch (error) {
        results.push({
          source: 'live-rcon',
          route: ROUTES.RCON,
          request,
          capturedAt: new Date().toISOString(),
          state: 'failed',
          text: redactOutput(error.message).slice(0, 1024)
        });
      }
    }
    return results;
  }

  async refreshCommandDiscovery(id, input = {}) {
    const server = await this.getServer(id);
    const selection = this.commandDiscoveryRequests(server, input);
    if (!selection.sources.size) throw new Error('Select at least one explicit discovery source before collecting command evidence.');
    if ((selection.sources.has('local-console') || selection.sources.has('rcon')) && !selection.queries.length) {
      throw new Error('Select at least one fixed help, plugins, or Paper query before collecting local-console or RCON evidence.');
    }
    const existing = normalizeCommandDiscoveryState(server.commandDiscovery);
    const next = {
      jarProbes: [...existing.jarProbes],
      liveResponses: [...existing.liveResponses],
      updatedAt: new Date().toISOString()
    };
    if (selection.sources.has('selected-jar')) {
      next.jarProbes.push(...await this.collectSelectedJarDiscovery(server));
    }
    if (selection.sources.has('local-console')) {
      for (const request of selection.queries) next.liveResponses.push(await this.captureLocalConsoleResponse(server.id, request));
    }
    if (selection.sources.has('rcon')) {
      next.liveResponses.push(...await this.collectRconDiscovery(server, selection.queries));
    }
    next.jarProbes = next.jarProbes.slice(-MAX_COMMAND_DISCOVERY_RESPONSES);
    next.liveResponses = next.liveResponses.slice(-MAX_COMMAND_DISCOVERY_RESPONSES);
    const saved = await this.persistCommandDiscovery(id, next);
    this.emit({
      type: 'command-discovery-refreshed',
      serverId: id,
      message: `Captured ${selection.sources.size} explicit command discovery source(s) for ${saved.name}.`
    });
    return {
      server: copyPublicServer(saved),
      discovery: commandDiscoverySummary(saved.commandDiscovery),
      catalog: await this.commandCatalog(id)
    };
  }

  async buildCommandRegistry(server) {
    const runtime = {
      flavor: server.software,
      minecraftVersion: server.minecraftVersion,
      consoleAvailable: this.processes.has(server.id),
      rconAvailable: toBoolean(server.settings?.['enable-rcon']) && Boolean(server.rconSecretConfigured),
      hostLifecycleAvailable: true
    };
    const management = plainManagementRecord(server.management);
    const discoveryStatus = discoveryStatusForManagement(management);
    const rpcDiscover = !management.credentialConfigured && discoveryStatus.state === 'ready'
      ? { methods: discoveryStatus.snapshot.methods }
      : undefined;
    const plugins = await this.pluginDescriptors(server);
    const commandDiscovery = normalizeCommandDiscoveryState(server.commandDiscovery);
    return createCommandCenterRegistry({
      runtime,
      rpcDiscover,
      plugins,
      jarProbes: commandDiscovery.jarProbes,
      liveResponses: commandDiscovery.liveResponses
    });
  }

  async commandCatalog(id) {
    const server = await this.getServer(id);
    return presentRegistry(await this.buildCommandRegistry(server));
  }

  async commandPlan(id, request = {}) {
    const server = await this.getServer(id);
    const registry = await this.buildCommandRegistry(server);
    const actionId = stringValue(request.actionId).trim();
    if (!actionId) throw new Error('Choose a structured command action before requesting a command plan.');
    const routeMap = {
      protocol: ROUTES.PROTOCOL,
      local: ROUTES.LOCAL_CONSOLE,
      rcon: ROUTES.RCON,
      lifecycle: ROUTES.HOST_LIFECYCLE,
      [ROUTES.PROTOCOL]: ROUTES.PROTOCOL,
      [ROUTES.LOCAL_CONSOLE]: ROUTES.LOCAL_CONSOLE,
      [ROUTES.RCON]: ROUTES.RCON,
      [ROUTES.HOST_LIFECYCLE]: ROUTES.HOST_LIFECYCLE
    };
    const route = routeMap[request.route] || ROUTES.LOCAL_CONSOLE;
    const rawCommand = stringValue(request.rawCommand).trim();
    const values = request.values && typeof request.values === 'object' && !Array.isArray(request.values) ? request.values : {};
    const plan = rawCommand
      ? (() => {
        if (route === ROUTES.PROTOCOL || route === ROUTES.HOST_LIFECYCLE) {
          throw new Error('The raw composer is not a management-protocol or host-lifecycle route. Choose the local console or RCON route.');
        }
        const routeAvailable = route === ROUTES.LOCAL_CONSOLE
          ? this.processes.has(server.id)
          : route === ROUTES.RCON
            ? toBoolean(server.settings?.['enable-rcon']) && Boolean(server.rconSecretConfigured)
            : false;
        if (!routeAvailable) {
          throw new Error(route === ROUTES.LOCAL_CONSOLE
            ? 'Start the selected local server before sending a raw tokenized Minecraft command.'
            : 'Enable RCON and save its protected local credential before using the raw RCON route.');
        }
        const raw = composeRawTokenizedCommand(rawCommand);
        return {
          actionId,
          title: 'Tokenized raw Minecraft command',
          form: 'raw-fallback',
          origin: {
            source: 'raw-tokenized-fallback',
            label: 'User-supplied Minecraft command tokens; command existence is not asserted by the registry.'
          },
          risk: 'operational',
          backupRequirement: 'recommended',
          confirmationRequirement: 'review',
          execution: {
            canExecute: true,
            selected: { route, executable: true, state: 'available' },
            protocol: { method: null, executable: false, state: 'not-applicable' },
            fallback: 'The raw composer does not verify command existence or permissions. It sends bounded Minecraft tokens only to the selected available route.'
          },
          ...raw
        };
      })()
      : composeCommand(registry, actionId, values, { formId: request.formId, route });
    if (!plan.execution?.canExecute && !plan.execution?.selected) {
      throw new Error(plan.execution?.fallback || 'The selected command route is not currently available.');
    }
    return plan;
  }

  pruneLifecyclePlans() {
    const now = Date.now();
    for (const plans of [this.backupPlans, this.restorePlans, this.paperUpdatePlans, this.paperRollbackPlans]) {
      for (const [serverId, plan] of plans) {
        if (!plan?.expiresAt || Date.parse(plan.expiresAt) <= now) plans.delete(serverId);
      }
    }
  }

  backupConsistencyPreview(id) {
    return this.processes.has(id)
      ? {
          state: 'requires-local-save-acknowledgement',
          message: 'The server is running. Starting this backup will send save-all and wait for the local managed process to acknowledge it. If no acknowledgement arrives, the backup is refused.'
        }
      : {
          state: 'server-stopped',
          message: 'The server is stopped. No live save acknowledgement is required before the snapshot is copied.'
        };
  }

  async prepareBackupPlan(id) {
    const server = await this.getServer(id);
    const plan = await backupLifecycle.createServerBackupPlan({ server, backupStorageRoot: this.backupStorageDir });
    plan.consistency = this.backupConsistencyPreview(id);
    this.backupPlans.set(id, plan);
    this.pruneLifecyclePlans();
    this.recordLocalEvidence(`backup-plan-${id}`, 'Server backup preview', `Prepared a ${plan.state} bounded local snapshot preview for ${server.name}.`, plan.destination.finalPath);
    this.emit({ type: 'backup-preflight', serverId: id, message: `Prepared a ${plan.state} backup preview for ${server.name}.` });
    return backupLifecycle.publicBackupPlan(plan);
  }

  async executeBackupPlanForServer(server, plan, operationId) {
    const consistency = await this.awaitLocalSaveAcknowledgement(server.id);
    const result = await backupLifecycle.executeServerBackupPlan(plan, {
      onProgress: ({ relativePath, completedFiles, totalFiles }) => {
        this.emit({
          type: 'backup-progress',
          serverId: server.id,
          operationId,
          message: `Snapshotting ${completedFiles}/${totalFiles}: ${relativePath}`
        });
      }
    });
    return { ...result, consistency };
  }

  async createBackup(id, confirmation = {}) {
    const server = await this.getServer(id);
    const plan = this.backupPlans.get(id);
    if (!plan) throw new Error('Prepare a backup preview before starting a local snapshot.');
    if (text(confirmation.digest).trim() !== plan.authority?.digest) throw new Error('The backup request does not match the current preview. Refresh the preview before starting the snapshot.');
    const operationId = this.beginStatusOperation(`backup-${id}-${Date.now()}`, `Create backup for ${server.name}`, 'Waiting for the required local save acknowledgement, then creating a bounded directory snapshot.');
    try {
      const backup = await this.executeBackupPlanForServer(server, plan, operationId);
      this.completeStatusOperation(operationId, 'complete', `Created backup ${backup.backupId} with ${backup.fileCount} files.`);
      this.recordLocalEvidence(`backup-${backup.backupId}`, 'Local server backup', `Created a bounded local snapshot with ${backup.fileCount} files and manifest hashes.`, backup.manifestPath);
      this.emit({ type: 'backup-created', serverId: id, operationId, message: `Created local backup ${backup.backupId}.` });
      this.backupPlans.delete(id);
      return backup;
    } catch (error) {
      this.completeStatusOperation(operationId, 'failed', error.message);
      this.emit({ type: 'backup-failed', serverId: id, operationId, message: error.message });
      throw error;
    }
  }

  async backupOverview(id) {
    const server = await this.getServer(id);
    const backups = await backupLifecycle.listServerBackups({ server, backupStorageRoot: this.backupStorageDir });
    const rollbackPath = stringValue(server.lastPaperUpdate?.rollbackJar).trim();
    const rollbackRoot = path.join(server.serverPath, '.minecraft-server-studio', 'jar-rollbacks');
    const rollbackExists = Boolean(rollbackPath) && pathIsWithin(rollbackRoot, rollbackPath) && await pathExists(rollbackPath);
    const rollback = rollbackExists
      ? { available: true, reason: null }
      : {
          available: false,
          reason: rollbackPath
            ? 'The recorded Paper JAR rollback is unavailable or outside the app-controlled rollback directory.'
            : 'No Paper JAR rollback has been recorded for this server.'
        };
    return {
      serverId: server.id,
      serverStatus: this.processes.has(id) ? 'running' : 'stopped',
      backupStoragePath: backupDirectoryForDisplay(this.backupStorageDir, server),
      backups,
      latestBackup: backups[0] || null,
      rollback,
      lastPaperUpdate: copyPublicPaperUpdate(server.lastPaperUpdate),
      consistency: this.backupConsistencyPreview(id)
    };
  }

  async prepareRestorePlan(id, backupId) {
    const server = await this.getServer(id);
    const backup = await backupLifecycle.findServerBackup({ server, backupStorageRoot: this.backupStorageDir, backupId });
    const plan = backupLifecycle.createServerRestorePlan({ server, backup });
    if (this.processes.has(id)) {
      plan.state = 'blocked';
      plan.blockers = ['Stop the local server before restoring a snapshot. The app will not replace world, configuration, plugin, log, or server JAR state while the server is running.'];
    }
    this.restorePlans.set(id, plan);
    this.pruneLifecyclePlans();
    this.emit({ type: 'restore-preflight', serverId: id, message: `Prepared a ${plan.state} restore preview for backup ${backup.record.backupId}.` });
    return backupLifecycle.publicRestorePlan(plan);
  }

  async persistLifecycleMetadata(id, update) {
    const registry = await this.registry();
    const server = registry.servers.find((candidate) => candidate.id === id);
    if (!server) throw new Error('The selected server no longer exists in the local registry.');
    update(server);
    server.updatedAt = new Date().toISOString();
    await this.saveRegistry(registry);
    return server;
  }

  async restoreBackup(id, confirmation = {}) {
    const server = await this.getServer(id);
    const plan = this.restorePlans.get(id);
    if (!plan) throw new Error('Prepare a restore preview before replacing managed server state.');
    backupLifecycle.assertDestructiveConfirmation(plan, confirmation, 'Snapshot restore');
    if (this.processes.has(id)) throw new Error('Stop the local server before restoring a snapshot. The app will not replace managed server state while it is running.');
    if (plan.state !== 'ready') throw new Error(plan.blockers?.[0] || 'The prepared restore plan is blocked.');
    const operationId = this.beginStatusOperation(`restore-${id}-${Date.now()}`, `Restore backup for ${server.name}`, 'Creating a pre-restore safety snapshot before replacing the reviewed managed server roots.');
    try {
      const safetyPlan = await backupLifecycle.createServerBackupPlan({ server, backupStorageRoot: this.backupStorageDir });
      if (safetyPlan.state !== 'ready') throw new Error(safetyPlan.blockers[0] || 'A pre-restore safety backup could not be prepared.');
      const preRestoreBackup = await this.executeBackupPlanForServer(server, safetyPlan, operationId);
      const restored = await backupLifecycle.restoreServerSnapshot(plan);
      if (plan.targets.includes('server.jar')) {
        await this.persistLifecycleMetadata(id, (record) => { record.lastPaperUpdate = null; });
      }
      this.completeStatusOperation(operationId, 'complete', `Restored backup ${restored.restoredBackupId} after creating safety backup ${preRestoreBackup.backupId}.`);
      this.recordLocalEvidence(`restore-${id}`, 'Local server restore', `Restored ${restored.targets.length} reviewed managed roots after creating pre-restore backup ${preRestoreBackup.backupId}.`, preRestoreBackup.manifestPath);
      this.emit({ type: 'backup-restored', serverId: id, operationId, message: `Restored backup ${restored.restoredBackupId} after a new safety backup was created.` });
      this.restorePlans.delete(id);
      return { ...restored, preRestoreBackup };
    } catch (error) {
      this.completeStatusOperation(operationId, 'failed', error.message);
      this.emit({ type: 'backup-restore-failed', serverId: id, operationId, message: error.message });
      throw error;
    }
  }

  async preparePaperUpdatePlan(id) {
    const server = await this.getServer(id);
    if (server.software !== 'paper') {
      return {
        kind: 'paper-server-update',
        state: 'blocked',
        blockers: ['Paper updates apply only to Paper server definitions. Spigot uses its explicit BuildTools workflow.'],
        backupPreflight: null,
        replacement: { requiresStoppedServer: true, requiresBackupFirst: true, autoUpdatesPlugins: false }
      };
    }
    if (this.processes.has(id)) {
      return {
        kind: 'paper-server-update',
        state: 'blocked',
        blockers: ['Stop the local Paper server before checking or applying a server JAR replacement.'],
        backupPreflight: null,
        replacement: { requiresStoppedServer: true, requiresBackupFirst: true, autoUpdatesPlugins: false }
      };
    }
    const backupPlan = await backupLifecycle.createServerBackupPlan({ server, backupStorageRoot: this.backupStorageDir });
    const plan = await backupLifecycle.createPaperUpdatePlan({ server, backupPlan });
    this.paperUpdatePlans.set(id, plan);
    this.pruneLifecyclePlans();
    this.emit({ type: 'paper-update-preflight', serverId: id, message: `Prepared a ${plan.state} official stable Paper update preview.` });
    return backupLifecycle.publicPaperUpdatePlan(plan);
  }

  async applyPaperUpdate(id, confirmation = {}) {
    const server = await this.getServer(id);
    const plan = this.paperUpdatePlans.get(id);
    if (!plan) throw new Error('Prepare a Paper update preview before replacing server.jar.');
    backupLifecycle.assertDestructiveConfirmation(plan, confirmation, 'Paper server JAR replacement');
    if (this.processes.has(id)) throw new Error('Stop the local Paper server before replacing server.jar.');
    if (plan.state !== 'ready') throw new Error(plan.state === 'up-to-date' ? 'The selected server JAR already matches the latest reviewed stable Paper build.' : (plan.blockers?.[0] || 'The Paper update plan is blocked.'));
    const operationId = this.beginStatusOperation(`paper-update-${id}-${Date.now()}`, `Update Paper for ${server.name}`, 'Creating the required pre-update backup before downloading and validating the official stable server JAR.');
    try {
      const backup = await this.executeBackupPlanForServer(server, plan.backupPlan, operationId);
      const applied = await backupLifecycle.applyPaperUpdatePlan(plan, {
        onProgress: ({ bytes, expectedBytes }) => this.emit({ type: 'paper-update-progress', serverId: id, operationId, message: `Downloading reviewed Paper JAR: ${bytes.toLocaleString()} of ${expectedBytes.toLocaleString()} bytes.` })
      });
      await this.persistLifecycleMetadata(id, (record) => {
        record.lastPaperUpdate = {
          state: 'updated',
          updatedAt: applied.updatedAt,
          build: applied.release.build,
          minecraftVersion: applied.release.minecraftVersion,
          releaseSha256: applied.release.sha256,
          backupId: backup.backupId,
          rollbackJar: applied.rollbackJar
        };
      });
      this.completeStatusOperation(operationId, 'complete', `Updated Paper build ${applied.release.build}; backup ${backup.backupId} and a server JAR rollback record are available.`);
      this.recordLocalEvidence(`paper-update-${id}`, 'Paper update and rollback record', `Promoted official stable Paper build ${applied.release.build} after creating backup ${backup.backupId}.`, applied.rollbackJar);
      this.emit({ type: 'paper-updated', serverId: id, operationId, message: `Updated Paper build ${applied.release.build}; the prior server JAR remains available for rollback.` });
      this.paperUpdatePlans.delete(id);
      return { ...applied, backupReference: backup };
    } catch (error) {
      this.completeStatusOperation(operationId, 'failed', error.message);
      this.emit({ type: 'paper-update-failed', serverId: id, operationId, message: error.message });
      throw error;
    }
  }

  async preparePaperRollbackPlan(id) {
    const server = await this.getServer(id);
    if (server.software !== 'paper') {
      return { kind: 'paper-server-rollback', state: 'blocked', blockers: ['Paper rollback applies only to Paper server definitions.'], backupPreflight: null };
    }
    if (this.processes.has(id)) {
      return { kind: 'paper-server-rollback', state: 'blocked', blockers: ['Stop the local Paper server before replacing server.jar from a rollback record.'], backupPreflight: null };
    }
    const backupPlan = await backupLifecycle.createServerBackupPlan({ server, backupStorageRoot: this.backupStorageDir });
    const plan = await backupLifecycle.createPaperRollbackPlan({ server, lastPaperUpdate: server.lastPaperUpdate, backupPlan });
    this.paperRollbackPlans.set(id, plan);
    this.pruneLifecyclePlans();
    this.emit({ type: 'paper-rollback-preflight', serverId: id, message: `Prepared a ${plan.state} Paper rollback preview.` });
    return backupLifecycle.publicPaperRollbackPlan(plan);
  }

  async applyPaperRollback(id, confirmation = {}) {
    const server = await this.getServer(id);
    const plan = this.paperRollbackPlans.get(id);
    if (!plan) throw new Error('Prepare a Paper rollback preview before replacing server.jar.');
    backupLifecycle.assertDestructiveConfirmation(plan, confirmation, 'Paper server JAR rollback');
    if (this.processes.has(id)) throw new Error('Stop the local Paper server before replacing server.jar from the rollback record.');
    if (plan.state !== 'ready') throw new Error(plan.blockers?.[0] || 'The Paper rollback plan is blocked.');
    const operationId = this.beginStatusOperation(`paper-rollback-${id}-${Date.now()}`, `Rollback Paper for ${server.name}`, 'Creating the required pre-rollback backup before replacing server.jar from the retained rollback record.');
    try {
      const backup = await this.executeBackupPlanForServer(server, plan.backupPlan, operationId);
      const applied = await backupLifecycle.applyPaperRollbackPlan(plan);
      await this.persistLifecycleMetadata(id, (record) => {
        record.lastPaperUpdate = {
          state: 'rolled-back',
          updatedAt: new Date().toISOString(),
          rolledBackAt: applied.rolledBackAt,
          build: null,
          minecraftVersion: record.minecraftVersion,
          releaseSha256: applied.restoredJar.sha256,
          backupId: backup.backupId,
          rollbackJar: applied.rollbackJar
        };
      });
      this.completeStatusOperation(operationId, 'complete', `Restored the retained server JAR and created backup ${backup.backupId}.`);
      this.recordLocalEvidence(`paper-rollback-${id}`, 'Paper rollback record', `Restored the retained Paper server JAR after creating backup ${backup.backupId}.`, applied.rollbackJar);
      this.emit({ type: 'paper-rolled-back', serverId: id, operationId, message: 'Restored the retained Paper server JAR and preserved the replaced JAR as the next rollback record.' });
      this.paperRollbackPlans.delete(id);
      return { ...applied, backupReference: backup };
    } catch (error) {
      this.completeStatusOperation(operationId, 'failed', error.message);
      this.emit({ type: 'paper-rollback-failed', serverId: id, operationId, message: error.message });
      throw error;
    }
  }

  async registry() {
    await fs.mkdir(this.dataDir, { recursive: true });
    try {
      const parsed = JSON.parse(await fs.readFile(this.registryFile, 'utf8'));
      if (!Array.isArray(parsed.servers)) throw new Error('Registry has no server list.');
      return { schema: 1, servers: parsed.servers };
    } catch (error) {
      if (error.code === 'ENOENT') return { schema: 1, servers: [] };
      throw new Error(`Could not read the local server registry: ${error.message}`);
    }
  }

  async saveRegistry(registry) {
    await writeJsonAtomically(this.registryFile, { schema: 1, servers: registry.servers });
  }

  async readManagedJavaRuntimeRecords() {
    await fs.mkdir(this.toolchainDir, { recursive: true });
    let parsed;
    try {
      parsed = JSON.parse(await fs.readFile(this.managedJavaInventoryFile, 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      this.emit({ type: 'dependency-output', dependency: 'java', message: 'The app-managed Java inventory could not be read and will not be used until a new verified runtime is installed.' });
      return [];
    }
    if (!parsed || parsed.schema !== MANAGED_JAVA_INVENTORY_SCHEMA || !Array.isArray(parsed.runtimes) || parsed.runtimes.length > MAX_MANAGED_JAVA_RUNTIMES) {
      this.emit({ type: 'dependency-output', dependency: 'java', message: 'The app-managed Java inventory is unsupported or invalid and will not be used until a new verified runtime is installed.' });
      return [];
    }
    const records = [];
    const identities = new Set();
    for (const candidate of parsed.runtimes) {
      const normalized = normalizeManagedJavaRuntimeRecord(candidate);
      if (!normalized) continue;
      const identity = process.platform === 'win32' ? normalized.path.toLowerCase() : normalized.path;
      if (identities.has(identity)) continue;
      identities.add(identity);
      records.push(normalized);
    }
    return records;
  }

  async writeManagedJavaRuntimeRecords(records) {
    const bounded = records.slice(0, MAX_MANAGED_JAVA_RUNTIMES);
    await writeJsonAtomically(this.managedJavaInventoryFile, {
      schema: MANAGED_JAVA_INVENTORY_SCHEMA,
      runtimes: bounded
    });
    this.managedJavaPaths = new Set(bounded.map((record) => record.path));
  }

  async revalidateManagedJavaInventory() {
    if (!this.managedJavaInventoryRefresh) {
      this.managedJavaInventoryRefresh = this.performManagedJavaInventoryRevalidation().finally(() => {
        this.managedJavaInventoryRefresh = null;
      });
    }
    return this.managedJavaInventoryRefresh;
  }

  async performManagedJavaInventoryRevalidation() {
    const stored = await this.readManagedJavaRuntimeRecords();
    const valid = [];
    for (const record of stored) {
      try {
        if (!(await pathExists(record.path))) continue;
        const probed = await javaRuntime.probeJavaRuntime(record.path);
        if (!probed.launchable || probed.feature !== record.feature || !path.isAbsolute(probed.path)) continue;
        valid.push({ ...record, path: probed.path, verifiedAt: probed.verifiedAt });
      } catch {
        // A previously managed runtime is not eligible until a direct probe succeeds again.
      }
    }
    const changed = valid.length !== stored.length || valid.some((record, index) => record.path !== stored[index]?.path || record.verifiedAt !== stored[index]?.verifiedAt);
    if (changed) await this.writeManagedJavaRuntimeRecords(valid);
    else this.managedJavaPaths = new Set(valid.map((record) => record.path));
    return valid;
  }

  async rememberManagedJavaRuntime(record) {
    const normalized = normalizeManagedJavaRuntimeRecord(record);
    if (!normalized) throw new Error('The verified portable Java runtime could not be recorded because its metadata is incomplete.');
    const existing = await this.readManagedJavaRuntimeRecords();
    const identity = process.platform === 'win32' ? normalized.path.toLowerCase() : normalized.path;
    const next = [normalized, ...existing.filter((candidate) => (process.platform === 'win32' ? candidate.path.toLowerCase() : candidate.path) !== identity)];
    await this.writeManagedJavaRuntimeRecords(next);
    return normalized;
  }

  async officialJavaInstallPlan(feature) {
    const portableSource = await javaRuntime.resolveOfficialJavaPortableSource(feature);
    return javaRuntime.createJavaInstallPlan(feature, { portableSource });
  }

  async listServers() {
    const registry = await this.registry();
    return registry.servers.map((server) => ({
      ...copyPublicServer(server),
      status: this.processes.has(server.id) ? 'running' : 'stopped'
    }));
  }

  async getServer(id) {
    const registry = await this.registry();
    const server = registry.servers.find((candidate) => candidate.id === id);
    if (!server) throw new Error('The selected server no longer exists in the local registry.');
    return server;
  }

  async createServer(draft) {
    const requestedRoot = stringValue(draft.rootPath).trim();
    if (!requestedRoot) throw new Error('Choose a server root folder with the Browse control.');
    const rootPath = path.resolve(requestedRoot);
    if (!path.isAbsolute(rootPath)) throw new Error('Choose an absolute server root folder.');
    const name = stringValue(draft.name).trim();
    if (!name || name.length > 80) throw new Error('Server name must be between 1 and 80 characters.');
    const software = stringValue(draft.software).toLowerCase();
    if (!['paper', 'spigot'].includes(software)) throw new Error('Choose either Paper or Spigot.');
    const minecraftVersion = stringValue(draft.minecraftVersion).trim();
    if (!validVersion(minecraftVersion)) throw new Error('Choose a Minecraft version in numeric form, such as 1.21.4.');
    const memoryGb = parseMemoryGb(draft.memoryGb ?? 4);
    const directoryName = safeSlug(draft.directoryName || name);
    const serverPath = path.join(rootPath, directoryName);
    if (await pathExists(serverPath)) {
      throw new Error(`The server folder already exists: ${serverPath}`);
    }

    await fs.mkdir(serverPath, { recursive: true });
    const now = new Date().toISOString();
    const settings = normalizeProperties({ ...draft.settings, 'server-port': draft.port ?? draft.settings?.['server-port'] });
    settings['rcon.password'] = '';
    const server = {
      id: crypto.randomUUID(),
      name,
      software,
      minecraftVersion,
      serverPath,
      memoryGb,
      javaPath: stringValue(draft.javaPath).trim(),
      launchProfile: normalizeLaunchProfile(draft.launchProfile),
      eulaAccepted: Boolean(draft.eulaAccepted),
      settings,
      gameRules: normalizeGameRules(draft.gameRules),
      gameRuleStatus: {},
      pluginInstallations: [],
      management: {
        endpoint: '',
        allowInsecureLoopback: false,
        credentialConfigured: false,
        state: 'not-configured',
        discoveredAt: null,
        expiresAt: null,
        capabilities: [],
        discovery: null
      },
      commandDiscovery: normalizeCommandDiscoveryState(),
      createdAt: now,
      updatedAt: now
    };
    server.gameRuleStatus = initialGameRuleStatus(server);
    await this.writeServerFiles(server, { initializeProperties: true, writeEula: true });
    const registry = await this.registry();
    registry.servers.push(server);
    await this.saveRegistry(registry);
    this.emit({ type: 'server-created', serverId: server.id, message: `Created ${server.name}.` });
    return copyPublicServer(server);
  }

  async writeServerFiles(server, options = {}) {
    await fs.mkdir(server.serverPath, { recursive: true });
    const propertyPath = path.join(server.serverPath, 'server.properties');
    const existingProperties = await pathExists(propertyPath);
    const suppliedUpdates = options.propertyUpdates && typeof options.propertyUpdates === 'object' && !Array.isArray(options.propertyUpdates)
      ? { ...options.propertyUpdates }
      : {};
    const initializeProperties = options.initializeProperties === true || !existingProperties;
    const propertyUpdates = initializeProperties ? { ...normalizeProperties(server.settings) } : suppliedUpdates;
    const rconWasTouched = initializeProperties
      || options.materializeRconSecret === true
      || Object.prototype.hasOwnProperty.call(suppliedUpdates, 'enable-rcon')
      || Object.prototype.hasOwnProperty.call(suppliedUpdates, 'rcon.password');
    if (rconWasTouched) {
      if (toBoolean(server.settings?.['enable-rcon']) && server.rconSecretConfigured) {
        if (!this.credentialSecretProvider) throw new Error('RCON is enabled but the protected credential provider is unavailable. Disable RCON or save its secret through the desktop app.');
        const rconSecret = await this.credentialSecretProvider('rcon', server.id);
        if (!rconSecret) throw new Error('RCON is enabled but no protected RCON password is available. Save the password in the Network tab before starting the server.');
        propertyUpdates['rcon.password'] = rconSecret;
      } else if (!toBoolean(server.settings?.['enable-rcon'])) {
        propertyUpdates['rcon.password'] = '';
      }
    }
    const propertyResult = await configPluginSafety.updateServerPropertiesFile({
      serverPath: server.serverPath,
      knownKeys: [...ALLOWED_PROPERTY_KEYS],
      updates: propertyUpdates
    });
    const eulaPath = path.join(server.serverPath, 'eula.txt');
    if (options.writeEula === true || !(await pathExists(eulaPath))) {
      await fs.writeFile(
        eulaPath,
        `# EULA accepted with Minecraft Server Studio on ${new Date().toISOString()}\neula=${server.eulaAccepted ? 'true' : 'false'}\n`,
        'utf8'
      );
    }
    return propertyResult;
  }

  async updateServer(id, patch) {
    const registry = await this.registry();
    const index = registry.servers.findIndex((server) => server.id === id);
    if (index < 0) throw new Error('The selected server no longer exists in the local registry.');
    const existing = registry.servers[index];
    const propertyPatch = patch?.settings && typeof patch.settings === 'object' && !Array.isArray(patch.settings)
      ? { ...patch.settings }
      : null;
    const gameRulePatch = patch?.gameRules && typeof patch.gameRules === 'object' && !Array.isArray(patch.gameRules)
      ? { ...patch.gameRules }
      : null;
    const eulaChanged = patch.eulaAccepted !== undefined;
    if (patch.name !== undefined) {
      const name = stringValue(patch.name).trim();
      if (!name || name.length > 80) throw new Error('Server name must be between 1 and 80 characters.');
      existing.name = name;
    }
    if (patch.memoryGb !== undefined) existing.memoryGb = parseMemoryGb(patch.memoryGb);
    if (patch.javaPath !== undefined) existing.javaPath = stringValue(patch.javaPath).trim();
    if (patch.launchProfile !== undefined) existing.launchProfile = normalizeLaunchProfile(patch.launchProfile);
    if (patch.rconSecretConfigured !== undefined) existing.rconSecretConfigured = Boolean(patch.rconSecretConfigured);
    if (patch.eulaAccepted !== undefined) existing.eulaAccepted = Boolean(patch.eulaAccepted);
    let changedPropertyUpdates = {};
    if (propertyPatch) {
      const previousSettings = normalizeProperties(existing.settings);
      const nextSettings = normalizeProperties({ ...previousSettings, ...propertyPatch });
      changedPropertyUpdates = Object.fromEntries(
        Object.keys(propertyPatch)
          .filter((key) => ALLOWED_PROPERTY_KEYS.has(key) && stringValue(nextSettings[key]) !== stringValue(previousSettings[key]))
          .map((key) => [key, nextSettings[key]])
      );
      existing.settings = nextSettings;
      existing.settings['rcon.password'] = '';
    }
    if (patch.management) {
      existing.management = normalizeManagementForStorage(existing.management, patch.management);
    }
    existing.updatedAt = new Date().toISOString();
    await this.writeServerFiles(existing, {
      propertyUpdates: changedPropertyUpdates,
      materializeRconSecret: patch.rconSecretConfigured === true,
      writeEula: eulaChanged
    });
    await this.saveRegistry(registry);
    this.emit({ type: 'server-updated', serverId: id, message: `Saved configuration for ${existing.name}.` });
    if (gameRulePatch) return this.applyGameRules(id, gameRulePatch);
    return copyPublicServer(existing);
  }

  isServerRunning(id) {
    return this.processes.has(id);
  }

  async applyGameRules(id, values, options = {}) {
    const registry = await this.registry();
    const server = registry.servers.find((candidate) => candidate.id === id);
    if (!server) throw new Error('The selected server no longer exists in the local registry.');
    const requested = configPluginSafety.selectedManagedGameRuleValues(values);
    const names = Object.keys(requested);
    if (!names.length) return { server: copyPublicServer(server), application: [] };
    server.gameRules = normalizeGameRules({ ...server.gameRules, ...requested });
    const statuses = { ...copyGameRuleStatus(server.gameRuleStatus) };
    const sendable = [];
    for (const name of names) {
      const compatibility = configPluginSafety.gameRuleCompatibility(server.minecraftVersion, name);
      if (!compatibility.supported) {
        statuses[name] = {
          value: Boolean(server.gameRules[name]),
          state: 'saved-version-incompatible',
          transport: 'none',
          selectedVersion: server.minecraftVersion,
          detail: compatibility.reason,
          updatedAt: new Date().toISOString()
        };
        continue;
      }
      sendable.push({ name, value: Boolean(server.gameRules[name]), compatibility });
    }

    let transport = 'none';
    let sendBatch = null;
    if (this.processes.has(id)) {
      transport = 'local-console';
      sendBatch = async (commands) => this.sendConsoleCommands(id, commands);
    } else if (options.transport === 'rcon' && typeof options.sendCommand === 'function') {
      transport = 'rcon';
      sendBatch = async (commands) => this.enqueueConsoleWork(id, async () => {
        for (const command of commands) await options.sendCommand(command);
      });
    }

    if (sendable.length && sendBatch) {
      const commands = sendable.map((entry) => `gamerule ${entry.name} ${entry.value ? 'true' : 'false'}`);
      try {
        await sendBatch(commands);
        for (const entry of sendable) {
          statuses[entry.name] = {
            value: entry.value,
            state: transport === 'rcon' ? 'sent-rcon' : 'sent-local-console',
            transport,
            selectedVersion: server.minecraftVersion,
            detail: `Sent through the ${transport === 'rcon' ? 'RCON' : 'local console'} transport; server-side confirmation remains visible in console output.`,
            updatedAt: new Date().toISOString()
          };
        }
      } catch (error) {
        const detail = redactOutput(error.message).slice(0, 512);
        for (const entry of sendable) {
          statuses[entry.name] = {
            value: entry.value,
            state: 'failed',
            transport,
            selectedVersion: server.minecraftVersion,
            detail: `The requested live command was not confirmed: ${detail}`,
            updatedAt: new Date().toISOString()
          };
        }
      }
    } else {
      for (const entry of sendable) {
        statuses[entry.name] = {
          value: entry.value,
          state: 'saved-no-live-transport',
          transport: 'none',
          selectedVersion: server.minecraftVersion,
          detail: 'Saved locally only. Start this managed server to use its serialized local console, or configure an explicit RCON route for a separately running server. The management protocol is not used until a discovered descriptor provides a parameter schema for this operation.',
          updatedAt: new Date().toISOString()
        };
      }
    }
    server.gameRuleStatus = statuses;
    server.updatedAt = new Date().toISOString();
    await this.saveRegistry(registry);
    this.emit({
      type: 'gamerules-updated',
      serverId: id,
      message: sendable.length && sendBatch
        ? `Queued ${sendable.length} supported game rule command(s) through ${transport}.`
        : `Saved ${names.length} game rule value(s) with no live transport claim.`
    });
    return {
      server: copyPublicServer(server),
      application: names.map((name) => ({ name, ...statuses[name] }))
    };
  }

  async inspectDependencies(serverId = null) {
    const selectedServer = serverId ? await this.getServer(serverId) : null;
    const javaRequirement = selectedServer ? javaRuntime.describeJavaRequirementForServer(selectedServer) : null;
    const inspected = {};
    for (const [key, dependency] of Object.entries(DEPENDENCIES)) {
      const requiredFeature = key === 'java' && javaRequirement?.status === 'known' ? javaRequirement.feature : null;
      const resolved = await this.findDependency(key, dependency, requiredFeature, {
        configuredPath: key === 'java' ? selectedServer?.javaPath : null
      });
      inspected[key] = {
        id: key,
        label: dependency.label,
        available: resolved.available,
        path: resolved.path,
        version: key === 'java' && resolved.feature ? 'Java ' + resolved.feature : (resolved.available ? await getCommandVersion(resolved.path || dependency.command, dependency.versionArgs) : null),
        source: resolved.source || null,
        requiredFeature,
        requirementState: key === 'java' && javaRequirement ? javaRequirement.status : null,
        requirementMessage: key === 'java' && javaRequirement ? javaRequirement.message : null,
        installable: key !== 'java' || !javaRequirement || javaRequirement.status === 'known',
        detectedFeatures: key === 'java' ? (resolved.detectedFeatures || []) : undefined
      };
    }
    const winget = await commandExists('winget');
    const chocolatey = await commandExists('choco');
    return { dependencies: inspected, installers: { winget: winget.available, chocolatey: chocolatey.available }, javaRequirement };
  }

  async javaRuntimeCandidates(options = {}) {
    const managed = await this.revalidateManagedJavaInventory();
    const installed = await knownJavaInstallationCandidates(this.dataDir);
    return javaRuntime.discoverJavaRuntimeCandidates({
      configuredPath: options.configuredPath,
      explicitCandidates: [
        ...managed.map((record) => ({ path: record.path, source: 'app-managed runtime' })),
        ...installed.map((candidate) => ({ path: candidate, source: 'bounded installed location' }))
      ]
    });
  }

  async findJavaDependency(requiredFeature = null, configuredPath = null) {
    const candidates = await this.javaRuntimeCandidates({ configuredPath });
    const detectedFeatures = [];
    for (const candidate of candidates) {
      try {
        const probed = await javaRuntime.probeJavaRuntime(candidate.path);
        if (!probed.launchable || !Number.isSafeInteger(probed.feature)) continue;
        if (!detectedFeatures.includes(probed.feature)) detectedFeatures.push(probed.feature);
        if (requiredFeature === null || probed.feature === requiredFeature) {
          return { available: true, path: probed.path, source: candidate.source, feature: probed.feature, detectedFeatures };
        }
      } catch {
        // Continue searching bounded candidates; an unusable executable is not a Java runtime.
      }
    }
    return { available: false, path: null, source: null, feature: null, detectedFeatures };
  }

  async findDependency(id, dependency = DEPENDENCIES[id], javaFeature = null, options = {}) {
    if (id === 'java') {
      return this.findJavaDependency(javaFeature, options.configuredPath);
    }
    const fromPath = await commandExists(dependency.command);
    if (fromPath.available) return { ...fromPath, source: 'PATH' };
    const portable = PORTABLE_TOOLCHAIN[id];
    if (portable) {
      const executable = await findFileRecursively(
        path.join(this.toolchainDir, portable.destination),
        portable.executableNames.map((name) => name.toLowerCase())
      );
      if (executable) return { available: true, path: executable, source: 'portable toolchain' };
    }
    const likelyLocations = [path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Git'), path.join(process.env.LOCALAPPDATA || this.dataDir, 'Programs', 'Git')];
    const names = ['git.exe'];
    for (const location of likelyLocations) {
      const executable = await findFileRecursively(location, names);
      if (executable) return { available: true, path: executable, source: 'installed location' };
    }
    return { available: false, path: null, source: null };
  }

  async installPortableJavaRuntime(javaFeature) {
    if (!javaRuntime.SUPPORTED_JAVA_FEATURES.includes(Number(javaFeature))) {
      throw new Error('The selected server does not have a supported automatic Java requirement. No portable Java runtime will be guessed.');
    }
    const installPlan = await this.officialJavaInstallPlan(javaFeature);
    const portable = managedJavaPortableSpec(javaFeature, installPlan.portable);
    const source = await portable.source();
    const downloads = path.join(this.toolchainDir, 'downloads');
    const archive = path.join(downloads, 'java-' + javaFeature + '-' + source.sha256.slice(0, 16) + '-' + source.archiveName);
    let destination = path.join(this.toolchainDir, portable.destination);
    await fs.mkdir(downloads, { recursive: true });

    const destinationExists = await pathExists(destination);
    const existingExecutable = await findFileRecursively(destination, ['java.exe', 'java'], 5);
    if (existingExecutable) {
      try {
        const existing = await javaRuntime.probeJavaRuntime(existingExecutable);
        if (existing.launchable && existing.feature === Number(javaFeature)) {
          await this.rememberManagedJavaRuntime({
            feature: Number(javaFeature),
            path: existing.path,
            source,
            installedAt: new Date().toISOString(),
            verifiedAt: existing.verifiedAt
          });
          return { available: true, path: existing.path, source: 'app-managed runtime' };
        }
      } catch {
        // Keep a failed historical directory untouched and stage a new isolated recovery candidate.
      }
    }
    if (destinationExists) {
      this.emit({ type: 'dependency-output', dependency: 'java', message: 'A prior incomplete portable Java directory was retained; the new verified runtime will use an isolated recovery destination.' });
      destination += '.repair-' + crypto.randomUUID();
    }

    const staging = destination + '.staging-' + crypto.randomUUID();
    let promoted = false;
    try {
      await fs.rm(archive, { force: true });
      await fs.mkdir(staging, { recursive: true });
      this.emit({ type: 'dependency-progress', dependency: 'java', message: 'Installing the selected Java feature into the app-managed runtime area.' });
      await downloadVerifiedPortableJavaArchive(source, archive, (message) => this.emit({ type: 'dependency-output', dependency: 'java', message }));
      await extractPortableJavaArchive(archive, staging, (line) => this.emit({ type: 'dependency-output', dependency: 'java', message: line }));
      const stagedExecutable = await findFileRecursively(staging, ['java.exe', 'java'], 5);
      if (!stagedExecutable) throw new Error('Portable Java extraction completed without a Java executable.');
      const stagedRuntime = await javaRuntime.probeJavaRuntime(stagedExecutable);
      if (!stagedRuntime.launchable || stagedRuntime.feature !== Number(javaFeature)) {
        throw new Error('The extracted Java runtime did not verify as Java ' + javaFeature + '.');
      }
      const relativeExecutable = path.relative(staging, stagedExecutable);
      if (!relativeExecutable || path.isAbsolute(relativeExecutable) || relativeExecutable.split(path.sep).includes('..')) {
        throw new Error('The portable Java archive exposed an executable outside its private staging directory.');
      }
      await fs.rename(staging, destination);
      promoted = true;
      const executable = path.join(destination, relativeExecutable);
      const runtime = await javaRuntime.probeJavaRuntime(executable);
      if (!runtime.launchable || runtime.feature !== Number(javaFeature)) {
        throw new Error('The promoted portable Java runtime did not pass its final direct version probe.');
      }
      await this.rememberManagedJavaRuntime({
        feature: Number(javaFeature),
        path: runtime.path,
        source,
        installedAt: new Date().toISOString(),
        verifiedAt: runtime.verifiedAt
      });
      this.emit({ type: 'dependency-progress', dependency: 'java', message: 'The verified Java ' + javaFeature + ' runtime is now stored in the app-managed inventory.' });
      return { available: true, path: runtime.path, source: 'app-managed runtime' };
    } catch (error) {
      if (promoted) {
        await fs.rm(destination, { recursive: true, force: true }).catch(() => {});
      }
      throw error;
    } finally {
      await fs.rm(staging, { recursive: true, force: true }).catch(() => {});
    }
  }

  async installPortableDependency(id, javaFeature = null) {
    if (id === 'java') return this.installPortableJavaRuntime(javaFeature);
    const portable = PORTABLE_TOOLCHAIN[id];
    if (!portable) throw new Error(`No portable fallback is registered for ${id}.`);
    const source = await portable.source();
    const downloads = path.join(this.toolchainDir, 'downloads');
    const archive = path.join(downloads, portable.archiveName);
    const destination = path.join(this.toolchainDir, portable.destination);
    await fs.mkdir(downloads, { recursive: true });
    await fs.rm(destination, { recursive: true, force: true });
    await fs.mkdir(destination, { recursive: true });
    this.emit({ type: 'dependency-progress', dependency: id, message: `Installing ${DEPENDENCIES[id].label} into the app's private toolchain.` });
    await downloadFile(source.url, archive, source.sha256, (message) => this.emit({ type: 'dependency-output', dependency: id, message }));
    await expandZip(archive, destination, (line) => this.emit({ type: 'dependency-output', dependency: id, message: line }));
    const installed = await this.findDependency(id, DEPENDENCIES[id]);
    if (!installed.available) throw new Error(`The portable ${DEPENDENCIES[id].label} extraction completed but its executable was not found.`);
    return installed;
  }

  async installDependencies(ids = Object.keys(DEPENDENCIES), serverId = null) {
    const requested = [...new Set(ids)].filter((id) => DEPENDENCIES[id]);
    if (!requested.length) throw new Error('Choose at least one supported dependency to install.');
    const requestedServer = serverId ? await this.getServer(serverId) : null;
    const javaRequirement = requestedServer ? javaRuntime.describeJavaRequirementForServer(requestedServer) : null;
    const javaFeature = javaRequirement ? (javaRequirement.status === 'known' ? javaRequirement.feature : null) : 21;
    const javaInstallPlan = requested.includes('java') && javaFeature ? await this.officialJavaInstallPlan(javaFeature) : null;
    const results = [];
    for (const id of requested) {
      if (id === 'java' && !javaFeature) {
        results.push({ id, status: 'blocked', error: javaRequirement?.message || 'The selected Java requirement is unknown, so no automatic Java runtime will be chosen.' });
        continue;
      }
      const dependency = id === 'java'
        ? javaInstallerDependencyForFeature(javaFeature, javaInstallPlan.portable)
        : DEPENDENCIES[id];
      const before = await this.findDependency(id, dependency, id === 'java' ? javaFeature : null, {
        configuredPath: id === 'java' ? requestedServer?.javaPath : null
      });
      if (before.available) {
        results.push({ id, status: 'already-installed', path: before.path });
        continue;
      }
      let installed = false;
      let lastError = 'No supported package installer is available.';
      for (const installer of dependency.installers) {
        const available = await commandExists(installer.command);
        if (!available.available) continue;
        this.emit({ type: 'dependency-progress', dependency: id, message: `Installing ${dependency.label} with ${installer.command}.` });
        try {
          const result = await runCommand(available.path || installer.command, installer.args, (line) => {
            this.emit({ type: 'dependency-output', dependency: id, message: line });
          });
          if (result.code === 0) {
            installed = true;
            break;
          }
          lastError = redactOutput(result.stderr || result.stdout || `${installer.command} exited ${result.code}.`);
        } catch (error) {
          lastError = error.message;
        }
      }
      let after = await this.findDependency(id, dependency, id === 'java' ? javaFeature : null, {
        configuredPath: id === 'java' ? requestedServer?.javaPath : null
      });
      if (!after.available) {
        try {
          after = await this.installPortableDependency(id, id === 'java' ? javaFeature : null);
          installed = true;
        } catch (error) {
          lastError = error.message;
        }
      }
      if (!installed || !after.available) results.push({ id, status: 'failed', error: lastError });
      else results.push({ id, status: 'installed', path: after.path, source: after.source });
    }
    return { results, inspection: await this.inspectDependencies(serverId) };
  }

  async paperVersions() {
    const metadata = await fetchJson(`${PAPER_API}`);
    return (metadata.versions || []).filter(validVersion).reverse();
  }

  async inspectJavaRuntime(candidate, server = null) {
    const executable = stringValue(candidate).trim();
    if (!executable) throw new Error('Choose a Java executable before requesting a runtime inspection.');
    const probed = await javaRuntime.probeJavaRuntime(executable);
    const required = server ? javaRuntime.describeJavaRequirementForServer(server) : null;
    const compatible = Boolean(required && required.status === 'known' && probed.launchable && probed.feature === required.feature);
    return {
      path: probed.path,
      feature: probed.feature,
      launchable: probed.launchable,
      requiredFeature: required?.feature || null,
      compatibility: compatible ? 'confirmed' : 'not-confirmed',
      requirementSource: required?.source || null,
      requirementState: required?.status || null,
      error: probed.error ? redactOutput(probed.error).slice(0, 512) : null,
      verifiedAt: probed.verifiedAt
    };
  }

  async runtimeInventory(id, options = {}) {
    const server = await this.getServer(id);
    const requirement = javaRuntime.describeJavaRequirementForServer(server);
    const managed = await this.revalidateManagedJavaInventory();
    const installed = await knownJavaInstallationCandidates(this.dataDir);
    const runtimeCandidates = await javaRuntime.discoverJavaRuntimeCandidates({
      configuredPath: server.javaPath,
      explicitCandidates: [
        ...managed.map((record) => ({ path: record.path, source: 'app-managed runtime' })),
        ...installed.map((candidate) => ({ path: candidate, source: 'bounded installed location' }))
      ]
    });
    const runtimes = [];
    for (const candidate of runtimeCandidates) {
      try {
        const inspected = await this.inspectJavaRuntime(candidate.path, server);
        runtimes.push({ ...inspected, source: candidate.source, compatible: inspected.compatibility === 'confirmed' });
      } catch (error) {
        runtimes.push({
          path: candidate.path,
          source: candidate.source,
          feature: null,
          launchable: false,
          compatibility: 'not-confirmed',
          compatible: false,
          error: redactOutput(error.message).slice(0, 512),
          verifiedAt: new Date().toISOString()
        });
      }
    }
    const installPlan = requirement.status === 'known' && options.includeInstallPlan !== false
      ? await this.officialJavaInstallPlan(requirement.feature)
      : null;
    return { requirement, runtimes, installPlan };
  }

  async resolveJava(server) {
    const requirement = javaRuntime.javaRequirementForServer(server);
    let candidate;
    if (server.javaPath) {
      if (!path.isAbsolute(server.javaPath)) throw new Error('The configured Java path must be absolute. Choose it with the Browse Java control.');
      candidate = path.resolve(server.javaPath);
      if (!(await pathExists(candidate))) {
        throw new Error('The configured Java path does not exist. Select an installed Java runtime or clear the custom path.');
      }
    } else {
      const inventory = await this.runtimeInventory(server.id, { includeInstallPlan: false });
      const compatible = inventory.runtimes.find((runtime) => runtime.compatible && path.isAbsolute(runtime.path));
      if (!compatible) {
        throw new Error(`Java ${requirement.feature} is required for this server. Use the in-app dependency installer before setting up or starting it.`);
      }
      candidate = compatible.path;
    }
    const runtime = await this.inspectJavaRuntime(candidate, server);
    if (!runtime.launchable || runtime.feature !== requirement.feature) {
      const detected = runtime.feature ? `Java ${runtime.feature}` : 'an unrecognized Java version';
      throw new Error(`${server.software === 'paper' ? 'Paper' : 'Spigot BuildTools'} ${server.minecraftVersion} requires Java ${requirement.feature}; the selected runtime reports ${detected}. Choose a matching runtime or use the in-app installer.`);
    }
    if (!path.isAbsolute(candidate)) throw new Error('The selected Java runtime must resolve to an absolute executable path. Refresh the runtime inventory or use Browse Java.');
    return candidate;
  }

  async provisionServer(id) {
    const server = await this.getServer(id);
    const java = await this.resolveJava(server);
    const jarPath = path.join(server.serverPath, 'server.jar');
    if (await pathExists(jarPath)) {
      return { server: copyPublicServer(server), jarPath, reused: true };
    }
    if (server.software === 'paper') {
      await this.provisionPaper(server, jarPath);
    } else {
      throw new Error('Prepare and explicitly execute the isolated BuildTools plan in the desktop BuildTools tab before setting up a Spigot server.');
    }
    this.emit({ type: 'server-provisioned', serverId: id, message: `${server.software === 'paper' ? 'Paper' : 'Spigot'} is ready for ${server.name}.` });
    return { server: copyPublicServer(server), jarPath, reused: false };
  }

  async provisionPaper(server, jarPath) {
    const metadata = await fetchJson(`${PAPER_API}/versions/${encodeURIComponent(server.minecraftVersion)}/builds`);
    const build = [...(metadata.builds || [])].reverse().find((candidate) => candidate.downloads?.application?.name);
    if (!build) throw new Error(`Paper does not currently publish a downloadable build for Minecraft ${server.minecraftVersion}.`);
    const application = build.downloads.application;
    const url = `${PAPER_API}/versions/${encodeURIComponent(server.minecraftVersion)}/builds/${build.build}/downloads/${encodeURIComponent(application.name)}`;
    await downloadFile(url, jarPath, application.sha256, (message) => this.emit({ type: 'provision-output', serverId: server.id, message }));
  }

  async provisionSpigot(server, java, jarPath) {
    const git = await this.findDependency('git');
    if (!git.available) {
      throw new Error('Spigot setup requires Git for BuildTools. Use the in-app dependency installer before trying again.');
    }
    const buildTools = path.join(server.serverPath, 'BuildTools.jar');
    await downloadFile(SPIGOT_BUILDTOOLS_URL, buildTools, null, (message) => this.emit({ type: 'provision-output', serverId: server.id, message }));
    this.emit({ type: 'provision-output', serverId: server.id, message: `Building Spigot ${server.minecraftVersion}; this can take several minutes.` });
    const result = await runCommand(java, ['-jar', buildTools, '--rev', server.minecraftVersion, '--output-dir', server.serverPath], (line) => {
      this.emit({ type: 'provision-output', serverId: server.id, message: line });
    });
    if (result.code !== 0) {
      throw new Error(`Spigot BuildTools failed: ${redactOutput(result.stderr || result.stdout).slice(-1000)}`);
    }
    const files = await fs.readdir(server.serverPath);
    const generated = files
      .filter((file) => /^spigot-.*\.jar$/i.test(file) && !/remapped/i.test(file))
      .sort()
      .pop();
    if (!generated) throw new Error('Spigot BuildTools completed but did not produce a Spigot server JAR.');
    await fs.rename(path.join(server.serverPath, generated), jarPath);
  }

  async startServer(id) {
    if (this.processes.has(id)) throw new Error('This server is already running in Minecraft Server Studio.');
    const promotions = await this.promoteStagedPlugins(id);
    if (promotions.blocked.length) {
      throw new Error(`Resolve staged plugin safety checks before starting the server: ${promotions.blocked.join(' ')}`);
    }
    const server = await this.getServer(id);
    if (!server.eulaAccepted) throw new Error('Accept the Minecraft EULA in the General tab before starting this server.');
    const { jarPath } = await this.provisionServer(id);
    const java = await this.resolveJava(server);
    const runtime = await this.inspectJavaRuntime(java, server);
    const preflight = await javaRuntime.createJavaLaunchPreflight({
      requirement: javaRuntime.javaRequirementForServer(server),
      runtime,
      serverJar: jarPath,
      memoryGb: server.memoryGb,
      profile: normalizeLaunchProfile(server.launchProfile),
      serverArgs: ['nogui'],
      diagnosticsDirectory: path.join(server.serverPath, '.minecraft-server-studio', 'diagnostics')
    });
    if (preflight.state !== 'ready') throw new Error(preflight.issues[0].message);
    const launch = preflight.launch;
    if (launch.diagnosticsDirectory) await fs.mkdir(launch.diagnosticsDirectory, { recursive: true });
    const child = spawn(launch.executable, launch.args, {
      cwd: server.serverPath,
      shell: false,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    const processEntry = {
      child,
      startedAt: new Date().toISOString(),
      stopping: false,
      javaPath: java,
      launchTokens: launch.args,
      pid: child.pid || null,
      saveWaiters: new Set()
    };
    this.processes.set(id, processEntry);
    const forward = (stream, channel) => stream.on('data', (chunk) => {
      for (const line of chunk.toString().split(/\r?\n/)) {
        if (line.trim()) {
          this.recordCommandDiscoveryOutput(id, channel, line);
          this.observeServerOutput(id, line);
          this.recordCommandDiscoveryOutput(id, channel, line);
          this.emit({ type: 'server-output', serverId: id, channel, message: redactOutput(line) });
        }
      }
    });
    forward(child.stdout, 'stdout');
    forward(child.stderr, 'stderr');
    child.once('error', (error) => {
      this.rejectPendingSaveWaiters(id, new Error('The local server process reported an error before it acknowledged save-all.'));
      this.emit({ type: 'server-output', serverId: id, channel: 'stderr', message: error.message });
    });
    child.once('close', (code, signal) => {
      this.rejectPendingSaveWaiters(id, new Error('The local server stopped before it acknowledged save-all.'));
      this.processes.delete(id);
      this.emit({ type: 'server-state', serverId: id, status: 'stopped', exitCode: code, signal: signal || null });
    });
    this.emit({ type: 'server-state', serverId: id, status: 'running', startedAt: processEntry.startedAt });
    try {
      await this.applyGameRules(id, server.gameRules);
    } catch (error) {
      this.emit({
        type: 'gamerules-application-failed',
        serverId: id,
        message: `The server started, but its saved game-rule delivery state could not be recorded: ${redactOutput(error.message).slice(0, 512)}`
      });
    }
    return { id, status: 'running', startedAt: processEntry.startedAt };
  }

  async stopServer(id) {
    const running = this.processes.get(id);
    if (!running) throw new Error('This server is not running in Minecraft Server Studio.');
    if (running.stopping) return { id, status: 'stopping' };
    running.stopping = true;
    running.child.stdin.write('stop\n');
    this.emit({ type: 'server-state', serverId: id, status: 'stopping' });
    setTimeout(() => {
      if (this.processes.has(id)) {
        running.child.kill();
        this.emit({ type: 'server-output', serverId: id, channel: 'stderr', message: 'Server did not stop within 20 seconds; the Java process was terminated.' });
      }
    }, 20_000).unref();
    return { id, status: 'stopping' };
  }

  async enqueueConsoleWork(id, work) {
    if (typeof work !== 'function') throw new Error('A serialized console operation must be a function.');
    const previous = this.consoleQueues.get(id) || Promise.resolve();
    const queued = previous.catch(() => undefined).then(work);
    this.consoleQueues.set(id, queued);
    try {
      return await queued;
    } finally {
      if (this.consoleQueues.get(id) === queued) this.consoleQueues.delete(id);
    }
  }

  writeConsoleCommand(id, command) {
    const running = this.processes.get(id);
    const text = stringValue(command).replace(/[\r\n]/g, '').trim();
    if (!running) throw new Error('Start the server in Minecraft Server Studio before using its local console.');
    if (!text || text.length > 1024) throw new Error('Console commands must contain between 1 and 1024 characters.');
    running.child.stdin.write(`${text}\n`);
    this.emit({ type: 'console-command', serverId: id, message: `> ${text}` });
    return { id, accepted: true, command: text };
  }

  observeServerOutput(id, line) {
    const running = this.processes.get(id);
    if (!running?.saveWaiters?.size) return;
    const normalized = stringValue(line);
    if (!/(?:saved the game|save complete|saved .*chunks|saved .*world)/i.test(normalized)) return;
    for (const waiter of [...running.saveWaiters]) {
      clearTimeout(waiter.timer);
      running.saveWaiters.delete(waiter);
      waiter.resolve({ state: 'acknowledged', line: redactOutput(normalized).slice(0, 512), acknowledgedAt: new Date().toISOString() });
    }
  }

  rejectPendingSaveWaiters(id, error) {
    const running = this.processes.get(id);
    if (!running?.saveWaiters?.size) return;
    for (const waiter of [...running.saveWaiters]) {
      clearTimeout(waiter.timer);
      running.saveWaiters.delete(waiter);
      waiter.reject(error);
    }
  }

  async awaitLocalSaveAcknowledgement(id) {
    const running = this.processes.get(id);
    if (!running) return { state: 'not-running', message: 'The server is stopped; no live save acknowledgement is required.' };
    if (!running.child?.stdin?.writable) {
      throw new Error('The local server process cannot accept save-all. The app refuses a consistency-sensitive backup while it is running.');
    }
    const acknowledgement = new Promise((resolve, reject) => {
      const waiter = {
        resolve,
        reject,
        timer: setTimeout(() => {
          running.saveWaiters.delete(waiter);
          reject(new Error('The local server did not acknowledge save-all within 12 seconds. The app refused the consistency-sensitive backup while the server remains running.'));
        }, 12_000)
      };
      running.saveWaiters.add(waiter);
    });
    try {
      running.child.stdin.write('save-all\n');
    } catch (error) {
      this.rejectPendingSaveWaiters(id, new Error(`The local server could not accept save-all: ${error.message}`));
      throw new Error('The local server could not accept save-all. The app refused the consistency-sensitive backup while the server remains running.');
    }
    this.emit({ type: 'backup-save-requested', serverId: id, message: 'Requested save-all and waiting for the local server acknowledgement before copying a consistency-sensitive backup.' });
    return acknowledgement;
  }

  async sendConsoleCommand(id, command) {
    return this.enqueueConsoleWork(id, async () => this.writeConsoleCommand(id, command));
  }

  async sendConsoleCommands(id, commands) {
    const list = Array.isArray(commands) ? commands : [];
    if (!list.length || list.length > 32) throw new Error('A serialized game-rule command batch must contain between 1 and 32 commands.');
    return this.enqueueConsoleWork(id, async () => {
      const accepted = [];
      for (const command of list) accepted.push(this.writeConsoleCommand(id, command));
      return { id, accepted };
    });
  }

  async installPlugin(id, sourcePath) {
    const plan = await this.planPluginInstallation(id, sourcePath);
    if (plan.blockers.length) throw new Error(`Plugin installation was not staged: ${plan.blockers.join(' ')}`);
    const server = await this.getServer(id);
    const running = this.processes.has(id);
    const destinationDirectory = running ? this.pluginStagingDirectory(server) : path.join(server.serverPath, 'plugins');
    const staged = await configPluginSafety.stageAndVerifyPluginJar({
      sourcePath,
      destinationDirectory,
      fileName: plan.destination.fileName,
      expectedSha256: plan.source.sha256
    });
    const record = {
      id: crypto.randomUUID(),
      state: running ? 'staged' : 'promoted',
      fileName: plan.destination.fileName,
      sha256: plan.source.sha256,
      descriptor: staged.inspection.descriptor,
      plannedAt: new Date().toISOString(),
      promotedAt: running ? null : new Date().toISOString(),
      lastBlockedReason: '',
      rollback: {
        action: running ? 'discard-staged-plugin-file' : 'remove-created-plugin-file',
        fileName: plan.destination.fileName,
        requiresConfirmation: true
      }
    };
    const registry = await this.registry();
    const index = registry.servers.findIndex((candidate) => candidate.id === id);
    if (index < 0) throw new Error('The selected server no longer exists in the local registry.');
    const target = registry.servers[index];
    target.pluginInstallations = [...normalizePluginRecords(target.pluginInstallations), record].slice(-256);
    target.updatedAt = new Date().toISOString();
    await this.saveRegistry(registry);
    this.emit({
      type: running ? 'plugin-staged' : 'plugin-promoted',
      serverId: id,
      message: running
        ? `Staged ${plan.destination.fileName} outside the live plugins folder. It will be revalidated and promoted only while the server is stopped.`
        : `Promoted ${plan.destination.fileName} with a SHA-256 and descriptor rollback record.`
    });
    return {
      state: record.state,
      plan,
      destination: running ? null : staged.path,
      stagedPath: running ? staged.path : null,
      rollback: record.rollback
    };
  }

  async promoteStagedPlugins(id) {
    if (this.processes.has(id)) throw new Error('Stop the selected server before promoting staged plugin JARs.');
    const registry = await this.registry();
    const index = registry.servers.findIndex((candidate) => candidate.id === id);
    if (index < 0) throw new Error('The selected server no longer exists in the local registry.');
    const server = registry.servers[index];
    const records = normalizePluginRecords(server.pluginInstallations);
    const stagedRecords = records.filter((record) => record.state === 'staged');
    if (!stagedRecords.length) return { promoted: [], blocked: [] };
    const stagingDirectory = this.pluginStagingDirectory(server);
    const promoted = [];
    const blocked = [];
    let installed = await this.inspectInstalledPluginJars(server);
    for (const record of stagedRecords) {
      const stagedPath = path.resolve(stagingDirectory, record.fileName);
      const destinationPath = this.pluginDestinationPath(server, record.fileName);
      if (!pathInside(stagingDirectory, stagedPath) || path.dirname(stagedPath) !== stagingDirectory) {
        record.lastBlockedReason = 'The staged plugin path was not contained in the app-managed staging location.';
        blocked.push(record.lastBlockedReason);
        continue;
      }
      try {
        const source = await configPluginSafety.inspectPluginJar(stagedPath);
        if (source.sha256 !== record.sha256) throw new Error('The staged plugin SHA-256 no longer matches the reviewed record.');
        const pendingFileNames = records
          .filter((candidate) => candidate.state === 'staged' && candidate.id !== record.id)
          .map((candidate) => candidate.fileName);
        const plan = configPluginSafety.createPluginInstallationPlan({
          server,
          source,
          installed,
          pendingFileNames,
          serverRunning: false
        });
        if (plan.destination.fileName !== record.fileName) throw new Error('The staged plugin descriptor no longer resolves to its recorded destination file name.');
        if (plan.blockers.length) throw new Error(plan.blockers.join(' '));
        const promotedResult = await configPluginSafety.promoteVerifiedPluginJar({
          stagedPath,
          destinationPath,
          expectedSha256: record.sha256
        });
        record.state = 'promoted';
        record.promotedAt = new Date().toISOString();
        record.lastBlockedReason = '';
        record.descriptor = promotedResult.inspection.descriptor;
        record.rollback = {
          action: 'remove-created-plugin-file',
          fileName: record.fileName,
          requiresConfirmation: true
        };
        installed = [...installed, { state: 'installed', fileName: record.fileName, ...promotedResult.inspection }];
        promoted.push(record.fileName);
        this.emit({ type: 'plugin-promoted', serverId: id, message: `Promoted staged plugin ${record.fileName} while the server was stopped.` });
      } catch (error) {
        record.lastBlockedReason = redactOutput(error.message).slice(0, 512);
        blocked.push(`${record.fileName}: ${record.lastBlockedReason}`);
      }
    }
    server.pluginInstallations = records;
    server.updatedAt = new Date().toISOString();
    await this.saveRegistry(registry);
    return { promoted, blocked };
  }

  async listPlugins(id) {
    const server = await this.getServer(id);
    const records = normalizePluginRecords(server.pluginInstallations);
    const installed = await this.inspectInstalledPluginJars(server);
    const recordByFile = new Map(records.filter((record) => record.state === 'promoted').map((record) => [record.fileName.toLocaleLowerCase('en-US'), record]));
    const result = installed.map((item) => {
      const record = recordByFile.get(item.fileName.toLocaleLowerCase('en-US')) || null;
      return {
        state: 'installed',
        fileName: item.fileName,
        sha256: item.sha256 || record?.sha256 || null,
        descriptor: item.descriptor || record?.descriptor || null,
        inspectionError: item.inspectionError || null,
        rollback: record?.rollback || null
      };
    });
    for (const record of records.filter((candidate) => candidate.state === 'staged')) {
      result.push({
        state: 'staged',
        fileName: record.fileName,
        sha256: record.sha256,
        descriptor: record.descriptor,
        inspectionError: record.lastBlockedReason || null,
        rollback: record.rollback
      });
    }
    return result.sort((left, right) => `${left.state}:${left.fileName}`.localeCompare(`${right.state}:${right.fileName}`));
  }

  async rconCommand(id, command) {
    const server = await this.getServer(id);
    if (!toBoolean(server.settings['enable-rcon'])) throw new Error('Enable RCON in the Network tab before using remote CLI commands.');
    throw new Error('RCON commands require the main-process protected credential route. Use the desktop IPC RCON action so the password is never stored in settings or logs.');
  }
}

function rconPacket(id, type, body) {
  const payload = Buffer.from(String(body), 'utf8');
  const packet = Buffer.alloc(14 + payload.length);
  packet.writeInt32LE(packet.length - 4, 0);
  packet.writeInt32LE(id, 4);
  packet.writeInt32LE(type, 8);
  payload.copy(packet, 12);
  return packet;
}

function sendRconCommand({ host, port, password, command }) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('RCON port must be between 1 and 65535.');
  if (!command || command.length > 1024) throw new Error('RCON command must contain between 1 and 1024 characters.');
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    let buffer = Buffer.alloc(0);
    let authenticated = false;
    let settled = false;
    let timer;
    const close = (callback) => (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      callback(value);
    };
    const fail = close(reject);
    const succeed = close(resolve);
    timer = setTimeout(() => fail(new Error('RCON did not respond within 10 seconds.')), 10_000);
    socket.once('connect', () => socket.write(rconPacket(1, 3, password)));
    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length >= 4) {
        const length = buffer.readInt32LE(0);
        if (length < 10 || buffer.length < length + 4) return;
        const packet = buffer.subarray(0, length + 4);
        buffer = buffer.subarray(length + 4);
        const packetId = packet.readInt32LE(4);
        const type = packet.readInt32LE(8);
        const body = packet.subarray(12, packet.length - 2).toString('utf8');
        if (!authenticated && type === 2) {
          if (packetId === -1) {
            fail(new Error('RCON rejected the configured password.'));
            return;
          }
          authenticated = true;
          socket.write(rconPacket(2, 2, command));
        } else if (authenticated && packetId === 2) {
          succeed(body);
        }
      }
    });
    socket.once('error', (error) => {
      fail(new Error(`RCON connection failed: ${error.message}`));
    });
  });
}

module.exports = {
  ALLOWED_PROPERTY_KEYS,
  DEFAULT_PROPERTIES,
  DEFAULT_GAMERULES,
  ServerManager,
  normalizeGameRules,
  normalizeProperties
};
