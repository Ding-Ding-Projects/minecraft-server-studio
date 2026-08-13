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
const javaRuntime = require('./java-runtime-manager.cjs');
const {
  probeSelectedJar,
  queryLoopbackRconEvidence
} = require('./command-runtime-discovery.cjs');

const PAPER_API = 'https://api.papermc.io/v2/projects/paper';
const SPIGOT_BUILDTOOLS_URL = 'https://hub.spigotmc.org/jenkins/job/BuildTools/lastSuccessfulBuild/artifact/target/BuildTools.jar';
const MAX_COMMAND_DISCOVERY_RESPONSES = 24;
const MAX_COMMAND_DISCOVERY_RESPONSE_BYTES = 64 * 1024;
const COMMAND_DISCOVERY_SETTLE_MS = 900;
const COMMAND_DISCOVERY_QUIET_MS = 160;
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

// Since current Minecraft versions expose these as gamerules, they deliberately
// remain outside server.properties. The live protocol registry may add more.
const DEFAULT_GAMERULES = Object.freeze({
  pvp: true,
  allowEnteringNetherUsingPortals: true,
  spawnMonsters: true,
  commandBlocksEnabled: false
});

const ALLOWED_PROPERTY_KEYS = new Set(Object.keys(DEFAULT_PROPERTIES));
const STATUS_COMPLETENESS_ROWS = Object.freeze({
  'status-destination': { implementationPath: ['src/main/desktop-status-model.cjs', 'src/renderer/index.html', 'src/renderer/renderer.js'], documentationPath: ['docs/features/local-status-and-completeness.md'], localization: { state: 'pending', detail: 'Desktop localization resources are not yet complete.' }, test: { state: 'pending', detail: 'No test was run in this delivery pass.' }, capture: { state: 'pending', detail: 'No capture was run in this delivery pass.' }, evidence: { state: 'in-progress', detail: 'The local status model and visible renderer destination are registered, but no verification result is claimed.' } },
  'server-creation': { implementationPath: ['src/main/server-manager.cjs', 'src/renderer/index.html'], documentationPath: ['docs/features/server-orchestration.md'], localization: { state: 'pending' }, test: { state: 'pending' }, capture: { state: 'pending' }, evidence: { state: 'in-progress', detail: 'Structured Paper and Spigot server creation source is registered; verification remains pending.' } },
  'dependency-bootstrap': { implementationPath: ['src/main/server-manager.cjs', 'src/renderer/renderer.js'], documentationPath: ['docs/features/dependency-bootstrap.md'], localization: { state: 'pending' }, test: { state: 'pending' }, capture: { state: 'pending' }, evidence: { state: 'in-progress', detail: 'Detection, installation, retry, and status source is registered; verification remains pending.' } },
  'paper': { implementationPath: ['src/main/server-manager.cjs', 'src/renderer/index.html'], documentationPath: ['docs/features/server-orchestration.md'], localization: { state: 'pending' }, test: { state: 'pending' }, capture: { state: 'pending' }, evidence: { state: 'in-progress', detail: 'Official Paper selection and setup source is registered; verification remains pending.' } },
  'spigot-buildtools': { implementationPath: ['src/main/buildtools-adapter.cjs', 'src/renderer/index.html'], documentationPath: ['docs/features/spigot-buildtools.md'], localization: { state: 'pending' }, test: { state: 'pending' }, capture: { state: 'pending' }, evidence: { state: 'in-progress', detail: 'BuildTools preflight and rich-control source is registered; verification remains pending.' } },
  'java-runtime-and-jar-launch': { implementationPath: ['src/main/java-runtime-manager.cjs', 'src/main/server-manager.cjs', 'src/renderer/renderer.js'], documentationPath: ['docs/features/java-runtime-and-launch.md'], localization: { state: 'pending' }, test: { state: 'pending' }, capture: { state: 'pending' }, evidence: { state: 'in-progress', detail: 'Version-aware runtime discovery, direct probes, and launch preflight source are registered; verification remains pending.' } },
  'protocol-management': { implementationPath: ['src/main/minecraft-management-protocol.cjs', 'src/main/main.cjs', 'src/renderer/index.html'], documentationPath: ['docs/features/server-orchestration.md'], localization: { state: 'pending' }, test: { state: 'pending' }, capture: { state: 'pending' }, evidence: { state: 'in-progress', detail: 'Capability-first protocol discovery is being integrated.' } },
  'command-center': { implementationPath: ['src/main/command-center-registry.cjs', 'src/main/command-runtime-discovery.cjs', 'src/main/server-manager.cjs', 'src/renderer/index.html', 'src/renderer/renderer.js'], documentationPath: ['docs/features/command-center.md'], localization: { state: 'pending' }, test: { state: 'pending' }, capture: { state: 'pending' }, evidence: { state: 'in-progress', detail: 'Bounded selected-JAR and explicitly requested live local-console or loopback-RCON discovery sources are wired; runtime interaction and verification remain pending.' } },
  'plugins': { implementationPath: ['src/main/server-manager.cjs', 'src/renderer/index.html'], documentationPath: ['docs/features/server-orchestration.md'], localization: { state: 'pending' }, test: { state: 'pending' }, capture: { state: 'pending' }, evidence: { state: 'in-progress', detail: 'Plugin staging is present; manifest inspection is being integrated.' } },
  'configuration': { implementationPath: ['src/main/server-manager.cjs', 'src/renderer/index.html'], documentationPath: ['docs/features/server-orchestration.md'], localization: { state: 'pending' }, test: { state: 'pending' }, capture: { state: 'pending' }, evidence: { state: 'verified', detail: 'Rich server, world, gameplay, network, and advanced property controls are registered.' } },
  'console-and-rcon': { implementationPath: ['src/main/server-manager.cjs', 'src/renderer/index.html'], documentationPath: ['docs/features/server-orchestration.md'], localization: { state: 'pending' }, test: { state: 'pending' }, capture: { state: 'pending' }, evidence: { state: 'in-progress', detail: 'Local console is available; vault-backed RCON integration is in progress.' } },
  'backups-and-updates': { implementationPath: [], documentationPath: ['docs/features/server-orchestration.md'], localization: { state: 'pending' }, test: { state: 'pending' }, capture: { state: 'pending' }, evidence: { state: 'pending', detail: 'Backup-first update and rollback controls remain pending.' } },
  'settings-appearance-and-localization': { implementationPath: [], documentationPath: ['docs/features/local-status-and-completeness.md'], localization: { state: 'pending' }, test: { state: 'pending' }, capture: { state: 'pending' }, evidence: { state: 'pending', detail: 'Universal settings and localization work remain incomplete.' } },
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

function javaInstallerDependencyForFeature(feature, portableSources) {
  const plan = javaRuntime.createJavaInstallPlan(feature, { portableSources });
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

function managedJavaPortableSpec(feature, portableSources) {
  const plan = javaRuntime.createJavaInstallPlan(feature, { portableSources });
  return {
    archiveName: plan.portable.archiveName || 'java-' + plan.feature + '-windows.zip',
    destination: path.join('java', String(plan.feature)),
    executableNames: ['java.exe', 'java'],
    async source() {
      if (plan.portable.state !== 'configured') throw new Error(plan.portable.reason);
      return { url: plan.portable.url, sha256: plan.portable.sha256 };
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
  const normalized = { ...DEFAULT_GAMERULES };
  for (const [key, value] of Object.entries(input || {})) {
    if (/^[A-Za-z][A-Za-z0-9_]{0,127}$/.test(key)) {
      normalized[key] = typeof value === 'boolean' || typeof value === 'number' ? value : stringValue(value).slice(0, 512);
    }
  }
  return normalized;
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

function parseProperties(content) {
  const parsed = {};
  for (const rawLine of content.split(/\r?\n/)) {
    if (!rawLine || rawLine.startsWith('#')) continue;
    const separator = rawLine.indexOf('=');
    if (separator < 0) continue;
    parsed[rawLine.slice(0, separator)] = rawLine.slice(separator + 1);
  }
  return normalizeProperties(parsed);
}

function serializeProperties(properties) {
  return `${Object.entries(properties)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${String(value).replace(/[\r\n]/g, ' ')}`)
    .join('\n')}\n`;
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
    management: {
      endpoint: server.management?.endpoint || '',
      allowInsecureLoopback: Boolean(server.management?.allowInsecureLoopback),
      discoveredAt: server.management?.discoveredAt || null,
      state: server.management?.state || 'not-configured',
      capabilities: Array.isArray(server.management?.capabilities) ? [...server.management.capabilities] : []
    },
    commandDiscovery: commandDiscoverySummary(server.commandDiscovery),
    createdAt: server.createdAt,
    updatedAt: server.updatedAt,
    settings: { ...server.settings }
  };
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
    this.registryFile = path.join(this.dataDir, 'servers.json');
    this.toolchainDir = path.join(this.dataDir, 'toolchain');
    this.javaPortableSources = options.javaPortableSources && typeof options.javaPortableSources === 'object'
      ? options.javaPortableSources
      : Object.create(null);
    this.managedJavaPaths = new Set();
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
    const rpcDiscover = server.management?.capabilities?.length
      ? { methods: server.management.capabilities }
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
      settings: normalizeProperties({ ...draft.settings, 'server-port': draft.port ?? draft.settings?.['server-port'] }),
      gameRules: normalizeGameRules(draft.gameRules),
      management: {
        endpoint: '',
        allowInsecureLoopback: false,
        state: 'not-configured',
        capabilities: []
      },
      commandDiscovery: normalizeCommandDiscoveryState(),
      createdAt: now,
      updatedAt: now
    };
    await this.writeServerFiles(server);
    const registry = await this.registry();
    registry.servers.push(server);
    await this.saveRegistry(registry);
    this.emit({ type: 'server-created', serverId: server.id, message: `Created ${server.name}.` });
    return copyPublicServer(server);
  }

  async writeServerFiles(server) {
    await fs.mkdir(server.serverPath, { recursive: true });
    const materializedSettings = { ...normalizeProperties(server.settings) };
    if (toBoolean(materializedSettings['enable-rcon']) && server.rconSecretConfigured) {
      if (!this.credentialSecretProvider) throw new Error('RCON is enabled but the protected credential provider is unavailable. Disable RCON or save its secret through the desktop app.');
      const rconSecret = await this.credentialSecretProvider('rcon', server.id);
      if (!rconSecret) throw new Error('RCON is enabled but no protected RCON password is available. Save the password in the Network tab before starting the server.');
      materializedSettings['rcon.password'] = rconSecret;
    }
    await fs.writeFile(path.join(server.serverPath, 'server.properties'), serializeProperties(materializedSettings), 'utf8');
    await fs.writeFile(
      path.join(server.serverPath, 'eula.txt'),
      `# EULA accepted with Minecraft Server Studio on ${new Date().toISOString()}\neula=${server.eulaAccepted ? 'true' : 'false'}\n`,
      'utf8'
    );
  }

  async updateServer(id, patch) {
    const registry = await this.registry();
    const index = registry.servers.findIndex((server) => server.id === id);
    if (index < 0) throw new Error('The selected server no longer exists in the local registry.');
    const existing = registry.servers[index];
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
    if (patch.settings) existing.settings = normalizeProperties({ ...existing.settings, ...patch.settings });
    if (patch.gameRules) existing.gameRules = normalizeGameRules({ ...existing.gameRules, ...patch.gameRules });
    if (patch.management) {
      existing.management = {
        ...existing.management,
        endpoint: stringValue(patch.management.endpoint ?? existing.management?.endpoint).trim(),
        allowInsecureLoopback: Boolean(patch.management.allowInsecureLoopback ?? existing.management?.allowInsecureLoopback),
        state: stringValue(patch.management.state ?? existing.management?.state ?? 'not-configured'),
        discoveredAt: patch.management.discoveredAt ?? existing.management?.discoveredAt ?? null,
        capabilities: Array.isArray(patch.management.capabilities)
          ? patch.management.capabilities.filter((method) => /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/.test(method)).slice(0, 1024)
          : (existing.management?.capabilities || [])
      };
    }
    existing.updatedAt = new Date().toISOString();
    await this.writeServerFiles(existing);
    await this.saveRegistry(registry);
    this.emit({ type: 'server-updated', serverId: id, message: `Saved configuration for ${existing.name}.` });
    return copyPublicServer(existing);
  }

  async inspectDependencies() {
    const inspected = {};
    for (const [key, dependency] of Object.entries(DEPENDENCIES)) {
      const resolved = await this.findDependency(key, dependency);
      inspected[key] = {
        id: key,
        label: dependency.label,
        available: resolved.available,
        path: resolved.path,
        version: resolved.available ? await getCommandVersion(resolved.path || dependency.command, dependency.versionArgs) : null
      };
    }
    const winget = await commandExists('winget');
    const chocolatey = await commandExists('choco');
    return { dependencies: inspected, installers: { winget: winget.available, chocolatey: chocolatey.available } };
  }

  async findDependency(id, dependency = DEPENDENCIES[id], javaFeature = null) {
    if (id === 'java') {
      const candidates = await javaRuntime.discoverJavaRuntimeCandidates({
        explicitPaths: [...this.managedJavaPaths]
      });
      const candidate = candidates[0];
      return candidate
        ? { available: true, path: candidate.path, source: candidate.source }
        : { available: false, path: null, source: null };
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

  async installPortableDependency(id, javaFeature = null) {
    const portable = id === 'java' && javaFeature
      ? managedJavaPortableSpec(javaFeature, this.javaPortableSources)
      : PORTABLE_TOOLCHAIN[id];
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
    if (id === 'java') {
      const executable = await findFileRecursively(destination, ['java.exe', 'java'], 5);
      if (!executable) throw new Error('The portable Java extraction completed but did not expose a Java executable.');
      this.managedJavaPaths.add(executable);
      return { available: true, path: executable, source: 'app-managed runtime' };
    }
    const installed = await this.findDependency(id, DEPENDENCIES[id]);
    if (!installed.available) throw new Error(`The portable ${DEPENDENCIES[id].label} extraction completed but its executable was not found.`);
    return installed;
  }

  async installDependencies(ids = Object.keys(DEPENDENCIES), serverId = null) {
    const requested = [...new Set(ids)].filter((id) => DEPENDENCIES[id]);
    if (!requested.length) throw new Error('Choose at least one supported dependency to install.');
    const requestedServer = serverId ? await this.getServer(serverId) : null;
    const javaFeature = requestedServer ? javaRuntime.javaRequirementForServer(requestedServer).feature : 21;
    const results = [];
    for (const id of requested) {
      const dependency = id === 'java'
        ? javaInstallerDependencyForFeature(javaFeature, this.javaPortableSources)
        : DEPENDENCIES[id];
      const before = await this.findDependency(id, dependency, id === 'java' ? javaFeature : null);
      const javaBeforeMatches = id !== 'java' || (before.available && (await this.inspectJavaRuntime(before.path, requestedServer)).feature === javaFeature);
      if (before.available && javaBeforeMatches) {
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
      let after = await this.findDependency(id, dependency, id === 'java' ? javaFeature : null);
      if (id === 'java' && after.available) {
        const inspected = await this.inspectJavaRuntime(after.path, requestedServer);
        if (inspected.feature !== javaFeature) after = { ...after, available: false };
      }
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
    return { results, inspection: await this.inspectDependencies() };
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

  async runtimeInventory(id) {
    const server = await this.getServer(id);
    const requirement = javaRuntime.describeJavaRequirementForServer(server);
    const runtimeCandidates = await javaRuntime.discoverJavaRuntimeCandidates({
      configuredPath: server.javaPath,
      explicitPaths: [...this.managedJavaPaths]
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
    const installPlan = requirement.status === 'known'
      ? javaRuntime.createJavaInstallPlan(requirement.feature, { portableSources: this.javaPortableSources })
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
      const inventory = await this.runtimeInventory(server.id);
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
    const processEntry = { child, startedAt: new Date().toISOString(), stopping: false, javaPath: java, launchTokens: launch.args, pid: child.pid || null };
    this.processes.set(id, processEntry);
    const forward = (stream, channel) => stream.on('data', (chunk) => {
      for (const line of chunk.toString().split(/\r?\n/)) {
        if (line.trim()) {
          this.recordCommandDiscoveryOutput(id, channel, line);
          this.emit({ type: 'server-output', serverId: id, channel, message: redactOutput(line) });
        }
      }
    });
    forward(child.stdout, 'stdout');
    forward(child.stderr, 'stderr');
    child.once('error', (error) => {
      this.emit({ type: 'server-output', serverId: id, channel: 'stderr', message: error.message });
    });
    child.once('close', (code, signal) => {
      this.processes.delete(id);
      this.emit({ type: 'server-state', serverId: id, status: 'stopped', exitCode: code, signal: signal || null });
    });
    this.emit({ type: 'server-state', serverId: id, status: 'running', startedAt: processEntry.startedAt });
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

  async sendConsoleCommand(id, command) {
    const running = this.processes.get(id);
    const text = stringValue(command).replace(/[\r\n]/g, '').trim();
    if (!running) throw new Error('Start the server in Minecraft Server Studio before using its local console.');
    if (!text || text.length > 1024) throw new Error('Console commands must contain between 1 and 1024 characters.');
    running.child.stdin.write(`${text}\n`);
    this.emit({ type: 'console-command', serverId: id, message: `> ${text}` });
    return { id, accepted: true };
  }

  async installPlugin(id, sourcePath) {
    const server = await this.getServer(id);
    const source = path.resolve(stringValue(sourcePath));
    if (!/\.jar$/i.test(source)) throw new Error('Choose a plugin JAR file.');
    if (!(await pathExists(source))) throw new Error('The selected plugin file no longer exists.');
    const pluginsPath = path.join(server.serverPath, 'plugins');
    await fs.mkdir(pluginsPath, { recursive: true });
    const destination = path.join(pluginsPath, path.basename(source));
    await fs.copyFile(source, destination);
    this.emit({ type: 'plugin-installed', serverId: id, message: `Installed ${path.basename(source)}. Restart the server to load it.` });
    return { destination };
  }

  async listPlugins(id) {
    const server = await this.getServer(id);
    const pluginsPath = path.join(server.serverPath, 'plugins');
    if (!(await pathExists(pluginsPath))) return [];
    return (await fs.readdir(pluginsPath, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && /\.jar$/i.test(entry.name))
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right));
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
  normalizeProperties,
  parseProperties,
  serializeProperties
};
