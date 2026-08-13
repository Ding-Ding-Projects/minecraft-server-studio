const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const PAPER_API = 'https://api.papermc.io/v2/projects/paper';
const SPIGOT_BUILDTOOLS_URL = 'https://hub.spigotmc.org/jenkins/job/BuildTools/lastSuccessfulBuild/artifact/target/BuildTools.jar';
const DEFAULT_PROPERTIES = Object.freeze({
  'accepts-transfers': 'false',
  'allow-flight': 'false',
  'allow-nether': 'true',
  'broadcast-console-to-ops': 'true',
  'broadcast-rcon-to-ops': 'true',
  'bug-report-link': '',
  'debug': 'false',
  'difficulty': 'easy',
  'enable-command-block': 'false',
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
  'pvp': 'true',
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
  'spawn-monsters': 'true',
  'spawn-npcs': 'true',
  'spawn-protection': '16',
  'sync-chunk-writes': 'true',
  'text-filtering-config': '',
  'use-native-transport': 'true',
  'view-distance': '10',
  'white-list': 'false'
});

const ALLOWED_PROPERTY_KEYS = new Set(Object.keys(DEFAULT_PROPERTIES));
const DEPENDENCIES = Object.freeze({
  java: {
    label: 'Eclipse Temurin 21 JDK',
    command: 'java',
    versionArgs: ['-version'],
    installers: [
      { command: 'winget', args: ['install', '--id', 'EclipseAdoptium.Temurin.21.JDK', '--exact', '--accept-package-agreements', '--accept-source-agreements'] },
      { command: 'choco', args: ['install', 'temurin21', '-y'] }
    ]
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
    archiveName: 'temurin-21.zip',
    destination: 'java',
    async source() {
      const metadata = await fetchJson('https://api.adoptium.net/v3/assets/latest/21/hotspot?architecture=x64&heap_size=normal&image_type=jdk&jvm_impl=hotspot&os=windows&vendor=eclipse');
      const packageInfo = metadata?.[0]?.binary?.package;
      if (!packageInfo?.link) throw new Error('The official Eclipse Adoptium service did not return a Windows JDK package.');
      return { url: packageInfo.link, sha256: packageInfo.checksum || null };
    },
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

function normalizeProperties(input = {}) {
  const normalized = { ...DEFAULT_PROPERTIES };
  for (const [key, value] of Object.entries(input)) {
    if (ALLOWED_PROPERTY_KEYS.has(key)) {
      normalized[key] = stringValue(value);
    }
  }
  return normalized;
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
    eulaAccepted: Boolean(server.eulaAccepted),
    createdAt: server.createdAt,
    updatedAt: server.updatedAt,
    settings: { ...server.settings }
  };
}

class ServerManager {
  constructor(options = {}) {
    this.dataDir = options.dataDir || path.join(os.homedir(), '.minecraft-server-studio');
    this.onEvent = options.onEvent || (() => {});
    this.processes = new Map();
    this.registryFile = path.join(this.dataDir, 'servers.json');
    this.toolchainDir = path.join(this.dataDir, 'toolchain');
  }

  emit(event) {
    this.onEvent({ at: new Date().toISOString(), ...event });
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
      eulaAccepted: Boolean(draft.eulaAccepted),
      settings: normalizeProperties({ ...draft.settings, 'server-port': draft.port ?? draft.settings?.['server-port'] }),
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
    await fs.writeFile(path.join(server.serverPath, 'server.properties'), serializeProperties(server.settings), 'utf8');
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
    if (patch.eulaAccepted !== undefined) existing.eulaAccepted = Boolean(patch.eulaAccepted);
    if (patch.settings) existing.settings = normalizeProperties({ ...existing.settings, ...patch.settings });
    existing.updatedAt = new Date().toISOString();
    await this.writeServerFiles(existing);
    await this.saveRegistry(registry);
    this.emit({ type: 'server-updated', serverId: id, message: `Saved configuration for ${existing.name}.` });
    return copyPublicServer(existing);
  }

  async inspectDependencies() {
    const inspected = {};
    for (const [key, dependency] of Object.entries(DEPENDENCIES)) {
      const resolved = await this.findDependency(id, dependency);
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

  async findDependency(id, dependency = DEPENDENCIES[id]) {
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
    const likelyLocations = id === 'java'
      ? [path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Eclipse Adoptium'), path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Java')]
      : [path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Git'), path.join(process.env.LOCALAPPDATA || this.dataDir, 'Programs', 'Git')];
    const names = id === 'java' ? ['java.exe'] : ['git.exe'];
    for (const location of likelyLocations) {
      const executable = await findFileRecursively(location, names);
      if (executable) return { available: true, path: executable, source: 'installed location' };
    }
    return { available: false, path: null, source: null };
  }

  async installPortableDependency(id) {
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
    const installed = await this.findDependency(id);
    if (!installed.available) throw new Error(`The portable ${DEPENDENCIES[id].label} extraction completed but its executable was not found.`);
    return installed;
  }

  async installDependencies(ids = Object.keys(DEPENDENCIES)) {
    const requested = [...new Set(ids)].filter((id) => DEPENDENCIES[id]);
    if (!requested.length) throw new Error('Choose at least one supported dependency to install.');
    const results = [];
    for (const id of requested) {
      const dependency = DEPENDENCIES[id];
      const before = await this.findDependency(id, dependency);
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
      let after = await this.findDependency(id, dependency);
      if (!after.available) {
        try {
          after = await this.installPortableDependency(id);
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

  async resolveJava(server) {
    if (server.javaPath) {
      const candidate = path.resolve(server.javaPath);
      if (await pathExists(candidate)) return candidate;
      throw new Error('The configured Java path does not exist. Select an installed Java runtime or clear the custom path.');
    }
    const java = await this.findDependency('java');
    if (!java.available) {
      throw new Error('Java 21 is required. Use the in-app dependency installer before setting up or starting this server.');
    }
    return java.path || 'java';
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
      await this.provisionSpigot(server, java, jarPath);
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
    const memory = parseMemoryGb(server.memoryGb);
    const child = spawn(java, [`-Xms${memory}G`, `-Xmx${memory}G`, '-jar', jarPath, 'nogui'], {
      cwd: server.serverPath,
      shell: false,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    const processEntry = { child, startedAt: new Date().toISOString(), stopping: false };
    this.processes.set(id, processEntry);
    const forward = (stream, channel) => stream.on('data', (chunk) => {
      for (const line of chunk.toString().split(/\r?\n/)) {
        if (line.trim()) this.emit({ type: 'server-output', serverId: id, channel, message: redactOutput(line) });
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
    const password = stringValue(server.settings['rcon.password']);
    if (!password) throw new Error('Set an RCON password in the Network tab before using remote CLI commands.');
    return sendRconCommand({
      host: '127.0.0.1',
      port: Number(server.settings['rcon.port']),
      password,
      command: stringValue(command)
    });
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
  ServerManager,
  normalizeProperties,
  parseProperties,
  serializeProperties
};
  'initial-disabled-packs': '',
  'initial-enabled-packs': 'vanilla',
