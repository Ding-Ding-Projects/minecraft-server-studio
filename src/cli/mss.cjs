#!/usr/bin/env node
const os = require('node:os');
const path = require('node:path');
const { ServerManager } = require('../main/server-manager.cjs');

const dataDir = process.env.MSS_DATA_DIR || path.join(process.env.APPDATA || os.homedir(), 'Minecraft Server Studio', 'servers');
const manager = new ServerManager({
  dataDir,
  onEvent(event) {
    if (event.message) process.stdout.write(`${event.at} ${event.message}\n`);
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
  The CLI uses the same local registry as the desktop application. start keeps the CLI attached to the server process. command and stop use RCON, which must be enabled in the Network tab with a password.
`;
  process.stdout.write(text);
  process.exitCode = exitCode;
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
    process.stdout.write(`${JSON.stringify(servers, null, 2)}\n`);
    return;
  }
  if (command === 'versions') {
    process.stdout.write(`${(await manager.paperVersions()).join('\n')}\n`);
    return;
  }
  if (command === 'install-deps') {
    const result = await manager.installDependencies(positional.length ? positional : undefined);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
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
    process.stdout.write(`${JSON.stringify(server, null, 2)}\n`);
    return;
  }
  const id = positional.shift();
  if (!id) throw new Error(`A server ID is required for '${command}'.`);
  if (command === 'setup') {
    process.stdout.write(`${JSON.stringify(await manager.provisionServer(id), null, 2)}\n`);
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
    const response = await manager.rconCommand(id, text);
    process.stdout.write(`${response || '(no RCON output)'}\n`);
    return;
  }
  if (command === 'plugins') {
    process.stdout.write(`${JSON.stringify(await manager.listPlugins(id), null, 2)}\n`);
    return;
  }
  if (command === 'plugin-install') {
    const source = positional.shift();
    if (!source) throw new Error('Provide the local plugin JAR path.');
    process.stdout.write(`${JSON.stringify(await manager.installPlugin(id, source), null, 2)}\n`);
    return;
  }
  if (command === 'config') {
    const settings = Object.fromEntries(options.set.map((pair) => {
      const separator = pair.indexOf('=');
      if (separator < 1) throw new Error(`Use --set property=value, received '${pair}'.`);
      return [pair.slice(0, separator), pair.slice(separator + 1)];
    }));
    process.stdout.write(`${JSON.stringify(await manager.updateServer(id, { settings }), null, 2)}\n`);
    return;
  }
  throw new Error(`Unknown command '${command}'.`);
}

run().catch((error) => {
  process.stderr.write(`Minecraft Server Studio CLI error: ${error.message}\n`);
  process.exitCode = 1;
});
