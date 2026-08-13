#!/usr/bin/env node
const { spawn } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');
const { ServerManager } = require('../main/server-manager.cjs');

const dataDir = process.env.MSS_DATA_DIR || path.join(process.env.APPDATA || os.homedir(), 'Minecraft Server Studio', 'servers');
const RCON_GATEWAY_PATH = path.join(__dirname, 'rcon-gateway.cjs');
const RCON_GATEWAY_MAX_OUTPUT_BYTES = 256 * 1024;
const RCON_GATEWAY_TIMEOUT_MS = 15_000;
const CREDENTIAL_INPUT_NAME_PATTERN = /(?:^|[._-])(password|secret|token)(?:$|[._-])/i;
const GATEWAY_ENVIRONMENT_KEYS = Object.freeze([
  'APPDATA', 'LOCALAPPDATA', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH',
  'SystemRoot', 'WINDIR', 'ComSpec', 'Path', 'PATHEXT', 'TEMP', 'TMP',
  'USERNAME', 'USERDOMAIN', 'USERDOMAIN_ROAMINGPROFILE', 'LOGONSERVER',
  'SESSIONNAME', 'OS', 'PROCESSOR_ARCHITECTURE', 'PROCESSOR_ARCHITEW6432',
  'NUMBER_OF_PROCESSORS', 'ProgramData', 'ProgramFiles', 'ProgramFiles(x86)',
  'ProgramW6432', 'PUBLIC'
]);
const manager = new ServerManager({
  dataDir,
  onEvent(event) {
    if (event.message) process.stdout.write(`${event.at} ${redactCliOutput(event.message)}\n`);
    if (event.type === 'server-state') process.stdout.write(`${event.at} Server ${event.serverId} is ${event.status}.\n`);
  }
});

function usage(exitCode = 0) {
  const text = `Minecraft Server Studio CLI

Usage:
  mss list
  mss versions
  mss install-deps [java] [git]
  mss create --name <name> --root <folder> --software <paper|spigot> --version <version> [--memory <GB>] [--port <port>] [--accept-eula]
  mss setup <server-id>
  mss start <server-id>
  mss command <server-id> <Minecraft command>
  mss stop <server-id>
  mss plugins <server-id>
  mss plugin-install <server-id> <plugin.jar>
  mss config <server-id> --set <property=value> [--set <property=value>]

Notes:
  The CLI uses the same local registry as the desktop application. start keeps the CLI attached to the server process. command and stop use a one-shot local desktop credential gateway for loopback RCON. Configure and save the protected RCON password in the desktop app's Network tab first; the CLI never accepts a password flag, environment value, or registry setting.
`;
  process.stdout.write(text);
  process.exitCode = exitCode;
}

function redactCliOutput(value) {
  return String(value || '')
    .replace(/(password|token|secret)\s*(?:=|:)\s*\S+/gi, '$1=[redacted]')
    .slice(0, 128 * 1024);
}

function sanitizeCliValue(value) {
  if (Array.isArray(value)) return value.map(sanitizeCliValue);
  if (!value || typeof value !== 'object') return value;
  const result = {};
  for (const [key, entry] of Object.entries(value)) {
    // An older CLI could write this value into servers.json. Never repeat it
    // through a CLI JSON response, even when reading a legacy profile.
    if (key === 'rcon.password') continue;
    result[key] = sanitizeCliValue(entry);
  }
  return result;
}

function writeJson(value) {
  process.stdout.write(`${JSON.stringify(sanitizeCliValue(value), null, 2)}\n`);
}

function environmentValue(name) {
  const match = Object.entries(process.env).find(([key]) => key.toLowerCase() === name.toLowerCase());
  return match?.[1];
}

function gatewayEnvironment() {
  const environment = {};
  for (const key of GATEWAY_ENVIRONMENT_KEYS) {
    const value = environmentValue(key);
    if (typeof value === 'string' && value) environment[key] = value;
  }
  // The child must launch as Electron main process, never as Node. The
  // allowlist above deliberately excludes RCON/configuration environment data.
  return environment;
}

function electronExecutable() {
  let executable;
  try {
    executable = require('electron');
  } catch {
    throw new Error('The local Electron runtime is unavailable. Run the desktop app installation or restore its bundled runtime before using CLI RCON commands.');
  }
  if (typeof executable !== 'string' || !path.isAbsolute(executable)) {
    throw new Error('The local Electron runtime is unavailable. Run the desktop app installation or restore its bundled runtime before using CLI RCON commands.');
  }
  return executable;
}

function desktopRconConfigurationMessage() {
  return 'Open the desktop app on this Windows account, enable RCON in the Network tab, and save its protected password for this server before using CLI command or stop.';
}

function runDesktopRconGateway({ serverId, command }) {
  const executable = electronExecutable();
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [RCON_GATEWAY_PATH], {
      cwd: path.dirname(RCON_GATEWAY_PATH),
      env: gatewayEnvironment(),
      shell: false,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'ignore']
    });
    let stdout = Buffer.alloc(0);
    let settled = false;
    let timer;
    const settle = (handler) => (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      handler(value);
    };
    const fail = settle(reject);
    const succeed = settle(resolve);
    const append = (current, chunk) => {
      if (current.length + chunk.length > RCON_GATEWAY_MAX_OUTPUT_BYTES) {
        child.kill();
        fail(new Error('The local desktop RCON gateway returned too much data.'));
        return null;
      }
      return Buffer.concat([current, chunk]);
    };
    child.stdout.on('data', (chunk) => {
      const next = append(stdout, Buffer.from(chunk));
      if (next) stdout = next;
    });
    child.stdin.once('error', () => fail(new Error('The local desktop RCON gateway could not receive its request.')));
    child.once('error', () => {
      fail(new Error('The local desktop RCON gateway could not start. Run the desktop app installation before using CLI RCON commands.'));
    });
    child.once('close', (code) => {
      if (settled) return;
      let result;
      try {
        result = JSON.parse(stdout.toString('utf8').trim());
      } catch {
        fail(new Error(code === 0
          ? 'The local desktop RCON gateway returned an invalid response.'
          : desktopRconConfigurationMessage()));
        return;
      }
      if (!result || typeof result !== 'object' || Array.isArray(result) || result.version !== 1 || typeof result.ok !== 'boolean') {
        fail(new Error('The local desktop RCON gateway returned an invalid response.'));
        return;
      }
      if (!result.ok) {
        if (Object.keys(result).length !== 3 || typeof result.error !== 'string') {
          fail(new Error('The local desktop RCON gateway returned an invalid response.'));
          return;
        }
        fail(new Error(redactCliOutput(result.error) || desktopRconConfigurationMessage()));
        return;
      }
      if (Object.keys(result).length !== 3 || typeof result.response !== 'string') {
        fail(new Error('The local desktop RCON gateway returned an invalid response.'));
        return;
      }
      // The gateway deliberately owns the decrypted password and emits only a
      // bounded redacted command response to this standalone process.
      succeed(redactCliOutput(result.response));
    });
    timer = setTimeout(() => {
      child.kill();
      fail(new Error('The local desktop RCON gateway did not finish within 15 seconds.'));
    }, RCON_GATEWAY_TIMEOUT_MS);
    const request = JSON.stringify({ version: 1, serverId, dataDir, command });
    child.stdin.end(request, 'utf8');
  });
}

function parseOptions(values) {
  const options = { set: [] };
  const positional = [];
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith('--')) {
      positional.push(value);
      continue;
    }
    const key = value.slice(2);
    if (CREDENTIAL_INPUT_NAME_PATTERN.test(key)) {
      throw new Error('The CLI does not accept credential options. Save the protected RCON password in the desktop app Network tab.');
    }
    if (key === 'accept-eula') {
      options.acceptEula = true;
      continue;
    }
    const next = values[index + 1];
    if (!next || next.startsWith('--')) throw new Error(`Missing a value for --${key}.`);
    index += 1;
    if (key === 'set') options.set.push(next);
    else options[key] = next;
  }
  return { options, positional };
}

async function run() {
  const [command, ...rest] = process.argv.slice(2);
  if (!command || ['help', '--help', '-h'].includes(command)) return usage();
  const { options, positional } = parseOptions(rest);
  if (command === 'list') {
    const servers = await manager.listServers();
    writeJson(servers);
    return;
  }
  if (command === 'versions') {
    process.stdout.write(`${(await manager.paperVersions()).join('\n')}\n`);
    return;
  }
  if (command === 'install-deps') {
    const result = await manager.installDependencies(positional.length ? positional : undefined);
    writeJson(result);
    return;
  }
  if (command === 'create') {
    const server = await manager.createServer({
      name: options.name,
      directoryName: options.directory || options.name,
      rootPath: options.root,
      software: options.software || 'paper',
      minecraftVersion: options.version,
      memoryGb: options.memory || 4,
      eulaAccepted: options.acceptEula,
      port: options.port || 25565,
      settings: { 'server-port': options.port || 25565, 'query.port': options.port || 25565 }
    });
    writeJson(server);
    return;
  }
  const id = positional.shift();
  if (!id) throw new Error(`A server ID is required for '${command}'.`);
  if (command === 'setup') {
    writeJson(await manager.provisionServer(id));
    return;
  }
  if (command === 'start') {
    await manager.startServer(id);
    process.stdout.write('Server is running. Press Ctrl+C to request a graceful stop.\n');
    process.once('SIGINT', async () => {
      await manager.stopServer(id).catch(() => {});
      process.exit(0);
    });
    await new Promise(() => {});
    return;
  }
  if (command === 'command' || command === 'stop') {
    const text = command === 'stop' ? 'stop' : positional.join(' ');
    if (!text.trim()) throw new Error('Provide a Minecraft command after the server ID.');
    const response = await runDesktopRconGateway({ serverId: id, command: text });
    process.stdout.write(`${response || '(no RCON output)'}\n`);
    return;
  }
  if (command === 'plugins') {
    writeJson(await manager.listPlugins(id));
    return;
  }
  if (command === 'plugin-install') {
    const source = positional.shift();
    if (!source) throw new Error('Provide the local plugin JAR path.');
    writeJson(await manager.installPlugin(id, source));
    return;
  }
  if (command === 'config') {
    const settings = Object.fromEntries(options.set.map((pair) => {
      const separator = pair.indexOf('=');
      if (separator < 1) throw new Error('Each --set value must use property=value.');
      const key = pair.slice(0, separator);
      if (CREDENTIAL_INPUT_NAME_PATTERN.test(key.trim())) {
        throw new Error('The CLI does not accept an RCON password. Save the protected password in the desktop app Network tab.');
      }
      return [key, pair.slice(separator + 1)];
    }));
    writeJson(await manager.updateServer(id, { settings }));
    return;
  }
  throw new Error(`Unknown command '${command}'.`);
}

run().catch((error) => {
  process.stderr.write(`Minecraft Server Studio CLI error: ${error.message}\n`);
  process.exitCode = 1;
});
