'use strict';

// This process is intentionally launched only by the local CLI through the
// installed Electron runtime. It reads the app-private safeStorage record and
// sends one loopback RCON command without returning the credential to Node.

const net = require('node:net');
const path = require('node:path');
const { app, safeStorage } = require('electron');
const { CredentialVault } = require('../main/credential-vault.cjs');
const { ServerManager } = require('../main/server-manager.cjs');

const REQUEST_VERSION = 1;
const LOCAL_RCON_HOST = '127.0.0.1';
const LIMITS = Object.freeze({
  requestBytes: 16 * 1024,
  dataDirectoryChars: 4096,
  serverIdChars: 160,
  commandChars: 1024,
  packetBytes: 128 * 1024,
  responseChars: 128 * 1024,
  timeoutMs: 10_000
});
const SERVER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

app.setName('Minecraft Server Studio');

function fail(message) {
  const error = new Error(message);
  error.publicMessage = message;
  return error;
}

function isPlainRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertExactKeys(value, keys) {
  if (!isPlainRecord(value)) throw fail('The local desktop RCON gateway received an invalid request.');
  const received = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (received.length !== expected.length || received.some((key, index) => key !== expected[index])) {
    throw fail('The local desktop RCON gateway received an invalid request.');
  }
}

function normalizeRequest(value) {
  assertExactKeys(value, ['version', 'serverId', 'dataDir', 'command']);
  if (value.version !== REQUEST_VERSION) throw fail('The local desktop RCON gateway received an unsupported request.');
  if (typeof value.serverId !== 'string' || !value.serverId || value.serverId.length > LIMITS.serverIdChars || !SERVER_ID_PATTERN.test(value.serverId)) {
    throw fail('The selected server identifier is invalid. Use a server listed by the desktop app.');
  }
  if (typeof value.dataDir !== 'string' || !value.dataDir.trim() || value.dataDir.length > LIMITS.dataDirectoryChars || /[\u0000-\u001f]/.test(value.dataDir)) {
    throw fail('The local server registry path is invalid.');
  }
  const dataDir = path.resolve(value.dataDir);
  if (!path.isAbsolute(dataDir) || dataDir === path.parse(dataDir).root || (process.platform === 'win32' && dataDir.startsWith('\\\\'))) {
    throw fail('CLI RCON requires a local application registry path.');
  }
  if (typeof value.command !== 'string' || !value.command.trim() || value.command.length > LIMITS.commandChars || /[\u0000-\u001f]/.test(value.command)) {
    throw fail('RCON commands must contain between 1 and 1024 printable characters.');
  }
  return Object.freeze({
    serverId: value.serverId,
    dataDir,
    command: value.command.trim()
  });
}

function readRequest() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;
    process.stdin.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > LIMITS.requestBytes) {
        reject(fail('The local desktop RCON gateway request is too large.'));
        process.stdin.destroy();
        return;
      }
      chunks.push(Buffer.from(chunk));
    });
    process.stdin.once('error', () => reject(fail('The local desktop RCON gateway could not read its request.')));
    process.stdin.once('end', () => {
      try {
        if (bytes === 0) throw fail('The local desktop RCON gateway received an empty request.');
        resolve(normalizeRequest(JSON.parse(Buffer.concat(chunks).toString('utf8'))));
      } catch (error) {
        reject(error?.publicMessage ? error : fail('The local desktop RCON gateway received an invalid request.'));
      }
    });
  });
}

function rconPacket(id, type, body) {
  const payload = Buffer.from(body, 'utf8');
  const packet = Buffer.alloc(14 + payload.length);
  packet.writeInt32LE(packet.length - 4, 0);
  packet.writeInt32LE(id, 4);
  packet.writeInt32LE(type, 8);
  payload.copy(packet, 12);
  return packet;
}

function escapeRegularExpression(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function redactResponse(value, secret) {
  let result = String(value || '')
    .replace(/(password|token|secret)\s*(?:=|:)\s*\S+/gi, '$1=[redacted]');
  if (secret) result = result.replace(new RegExp(escapeRegularExpression(secret), 'g'), '[redacted]');
  return result.slice(0, LIMITS.responseChars);
}

function sendLoopbackRconCommand({ port, password, command }) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw fail('RCON port must be between 1 and 65535. Configure it in the desktop app Network tab.');
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: LOCAL_RCON_HOST, port });
    let buffer = Buffer.alloc(0);
    let authenticated = false;
    let settled = false;
    let timer;
    const finish = (handler) => (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      handler(value);
    };
    const succeed = finish(resolve);
    const rejectWith = finish(reject);
    timer = setTimeout(() => rejectWith(fail('RCON did not respond within 10 seconds.')), LIMITS.timeoutMs);
    socket.once('connect', () => socket.write(rconPacket(1, 3, password)));
    socket.on('data', (chunk) => {
      if (settled) return;
      if (buffer.length + chunk.length > LIMITS.packetBytes + 4) {
        rejectWith(fail('RCON returned more data than this CLI route accepts.'));
        return;
      }
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length >= 4) {
        const length = buffer.readInt32LE(0);
        if (length < 10 || length > LIMITS.packetBytes) {
          rejectWith(fail('RCON returned an invalid packet.'));
          return;
        }
        if (buffer.length < length + 4) return;
        const packet = buffer.subarray(0, length + 4);
        buffer = buffer.subarray(length + 4);
        const packetId = packet.readInt32LE(4);
        const type = packet.readInt32LE(8);
        if (!authenticated && type === 2) {
          if (packetId === -1) {
            rejectWith(fail('RCON rejected the protected password. Re-save it in the desktop app Network tab before retrying.'));
            return;
          }
          if (packetId !== 1) {
            rejectWith(fail('RCON returned an unexpected authentication response.'));
            return;
          }
          authenticated = true;
          socket.write(rconPacket(2, 2, command));
          continue;
        }
        if (authenticated && packetId === 2) {
          succeed(redactResponse(packet.subarray(12, packet.length - 2).toString('utf8'), password));
        }
      }
    });
    socket.once('error', () => rejectWith(fail('RCON connection failed. Confirm that this local server is running and that RCON is enabled.')));
  });
}

function desktopConfigurationMessage() {
  return 'Open the desktop app on this Windows account, enable RCON in the Network tab, and save its protected password for this server before using CLI command or stop.';
}

function sameLocalPath(left, right) {
  const normalizedLeft = path.normalize(path.resolve(left));
  const normalizedRight = path.normalize(path.resolve(right));
  return process.platform === 'win32'
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

function isLocalServerPath(value) {
  if (typeof value !== 'string' || !value.trim() || /[\u0000-\u001f]/.test(value)) return false;
  const resolved = path.resolve(value);
  if (!path.isAbsolute(resolved) || resolved === path.parse(resolved).root) return false;
  return process.platform !== 'win32' || !resolved.startsWith('\\\\');
}

async function executeRequest(request) {
  const desktopDataDir = path.join(app.getPath('userData'), 'servers');
  if (!sameLocalPath(request.dataDir, desktopDataDir)) {
    throw fail('CLI command and stop use only the desktop app default local registry. Remove MSS_DATA_DIR, then configure this server in the desktop app before retrying.');
  }
  const manager = new ServerManager({ dataDir: request.dataDir });
  let server;
  try {
    server = await manager.getServer(request.serverId);
  } catch {
    throw fail('The selected server is not available in the local desktop registry. Use mss list, then configure the server in the desktop app.');
  }
  if (!isLocalServerPath(server.serverPath)) throw fail('CLI RCON supports only a local server profile. Recreate or repair this server through the desktop app before retrying.');
  if (server.settings?.['enable-rcon'] !== 'true' || server.rconSecretConfigured !== true) throw fail(desktopConfigurationMessage());

  const vault = new CredentialVault({
    dataDir: path.join(app.getPath('userData'), 'credential-vault'),
    safeStorage
  });
  if (vault.getStatus().state !== 'ready') {
    throw fail('The desktop app protected credential storage is unavailable on this Windows account. Open the desktop app and repair its protected storage before using CLI RCON commands.');
  }

  let password = null;
  try {
    password = vault.read(vault.createKey('minecraft-server-studio', `rcon:${server.id}`));
  } catch {
    throw fail(desktopConfigurationMessage());
  }
  if (!password) throw fail(desktopConfigurationMessage());
  try {
    return await sendLoopbackRconCommand({
      port: Number(server.settings?.['rcon.port']),
      password,
      command: request.command
    });
  } finally {
    password = null;
  }
}

function emit(result, code) {
  process.stdout.write(`${JSON.stringify(result)}\n`, () => app.exit(code));
}

async function main() {
  try {
    const request = await readRequest();
    await app.whenReady();
    const response = await executeRequest(request);
    emit({ version: REQUEST_VERSION, ok: true, response }, 0);
  } catch (error) {
    emit({
      version: REQUEST_VERSION,
      ok: false,
      error: String(error?.publicMessage || 'The local desktop RCON gateway could not complete the command.')
        .replace(/(password|token|secret)\s*(?:=|:)\s*\S+/gi, '$1=[redacted]')
        .slice(0, 1024)
    }, 1);
  }
}

void main();
