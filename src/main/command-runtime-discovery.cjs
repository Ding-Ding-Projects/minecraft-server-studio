'use strict';

/**
 * Bounded local evidence collection for Command Center runtime discovery.
 *
 * The adapter intentionally has a very small execution surface:
 * - exactly two direct Java JAR probes: --help and --version;
 * - optional queries to an already-running loopback RCON endpoint;
 * - no shell, no server lifecycle operation, no file writes, and no credential
 *   logging or result persistence.
 *
 * A JAR remains executable code controlled by its publisher. Supplying only
 * help/version arguments prevents this adapter from issuing a server start
 * command, but cannot prove how an arbitrary JAR will interpret those flags.
 */

const fs = require('node:fs/promises');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');

const LIMITS = Object.freeze({
  pathChars: 16_384,
  javaExecutableBytes: 32_768,
  jarBytes: 2 * 1024 * 1024 * 1024,
  probeTimeoutMs: 8_000,
  probeMinimumTimeoutMs: 1_000,
  probeMaximumTimeoutMs: 15_000,
  probeKillGraceMs: 1_000,
  probeStreamBytes: 48 * 1024,
  probeTotalBytes: 96 * 1024,
  rconTimeoutMs: 6_000,
  rconMinimumTimeoutMs: 1_000,
  rconMaximumTimeoutMs: 15_000,
  rconPasswordBytes: 8 * 1024,
  rconFrameBytes: 64 * 1024,
  rconBufferedBytes: 68 * 1024,
  rconFrames: 16,
  rconResponseBytes: 64 * 1024
});

const RCON_DISCOVERY_COMMANDS = Object.freeze(['help', 'plugins', 'paper']);
const LOOPBACK_RCON_HOSTS = new Set(['127.0.0.1', '::1']);
const PROBE_FLAGS = Object.freeze(['--help', '--version']);

const SAFETY_CONSTRAINTS = Object.freeze({
  jarProbes: Object.freeze({
    invocations: Object.freeze([
      Object.freeze(['-jar', '<selected-jar>', '--help']),
      Object.freeze(['-jar', '<selected-jar>', '--version'])
    ]),
    shell: false,
    windowsHide: true,
    adapterWritesFiles: false,
    adapterServerLifecycleOperation: false,
    outputIsBounded: true,
    timeoutIsBounded: true,
    warning: 'The adapter does not issue a server lifecycle command. An arbitrary selected JAR can still interpret --help or --version unexpectedly, so its behavior is reported as unverified evidence rather than a support claim.'
  }),
  rcon: Object.freeze({
    hosts: Object.freeze(['127.0.0.1', '::1']),
    commands: RCON_DISCOVERY_COMMANDS,
    startsServer: false,
    retainsPassword: false,
    logsPassword: false,
    responseIsBounded: true,
    timeoutIsBounded: true,
    warning: 'The adapter connects only to an existing loopback RCON endpoint, accepts only fixed discovery queries, and returns at most one bounded response frame.'
  })
});

function discoveryError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function asText(value) {
  return value === undefined || value === null ? '' : String(value);
}

function boundedInteger(value, fallback, minimum, maximum, label) {
  if (value === undefined || value === null) return fallback;
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw discoveryError('RUNTIME_DISCOVERY_LIMIT_INVALID', label + ' must be a whole number between ' + minimum + ' and ' + maximum + '.');
  }
  return value;
}

function hasUnsafePathCharacter(value) {
  return /[\0\r\n]/.test(value);
}

function normalizeAbsolutePath(value, label) {
  const candidate = asText(value).trim();
  if (!candidate) throw discoveryError('RUNTIME_DISCOVERY_PATH_REQUIRED', 'Choose a ' + label + ' path before collecting runtime evidence.');
  if (candidate.length > LIMITS.pathChars || hasUnsafePathCharacter(candidate)) {
    throw discoveryError('RUNTIME_DISCOVERY_PATH_INVALID', 'The selected ' + label + ' path is outside the supported safety bounds.');
  }
  if (!path.isAbsolute(candidate)) {
    throw discoveryError('RUNTIME_DISCOVERY_PATH_ABSOLUTE', 'Choose an absolute local ' + label + ' path so discovery does not depend on the process working directory.');
  }
  return path.resolve(candidate);
}

async function regularFileAt(value, label) {
  const resolved = normalizeAbsolutePath(value, label);
  let metadata;
  try {
    metadata = await fs.lstat(resolved);
  } catch {
    throw discoveryError('RUNTIME_DISCOVERY_PATH_MISSING', 'The selected ' + label + ' file is no longer available.');
  }
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw discoveryError('RUNTIME_DISCOVERY_PATH_NOT_FILE', 'The selected ' + label + ' path must be a regular local file.');
  }
  return { path: resolved, metadata };
}

async function validateSelectedJarPath(value) {
  const selected = await regularFileAt(value, 'server JAR');
  if (!/\.jar$/i.test(selected.path)) {
    throw discoveryError('RUNTIME_DISCOVERY_JAR_EXTENSION', 'Choose a local .jar file for runtime discovery.');
  }
  if (selected.metadata.size < 4 || selected.metadata.size > LIMITS.jarBytes) {
    throw discoveryError('RUNTIME_DISCOVERY_JAR_SIZE', 'The selected server JAR is empty or exceeds the discovery size limit.');
  }
  let handle;
  try {
    handle = await fs.open(selected.path, 'r');
    const header = Buffer.alloc(4);
    const read = await handle.read(header, 0, header.length, 0);
    if (read.bytesRead !== header.length || header[0] !== 0x50 || header[1] !== 0x4b) {
      throw discoveryError('RUNTIME_DISCOVERY_JAR_SIGNATURE', 'The selected .jar file does not begin with a ZIP/JAR signature.');
    }
  } finally {
    if (handle) await handle.close();
  }
  return Object.freeze({ path: selected.path, bytes: selected.metadata.size });
}

async function validateJavaExecutableInput(value) {
  const selected = await regularFileAt(value, 'Java executable');
  const name = path.basename(selected.path).toLowerCase();
  if (name !== 'java' && name !== 'java.exe') {
    throw discoveryError('RUNTIME_DISCOVERY_JAVA_NAME', 'Choose the direct java or java.exe executable, not a shell wrapper.');
  }
  if (selected.metadata.size < 1 || selected.metadata.size > LIMITS.javaExecutableBytes * 4_096) {
    throw discoveryError('RUNTIME_DISCOVERY_JAVA_SIZE', 'The selected Java executable is outside the discovery size bounds.');
  }
  return Object.freeze({ path: selected.path, bytes: selected.metadata.size });
}

function createProbeConfiguration(options) {
  const input = options || {};
  const timeoutMs = boundedInteger(
    input.timeoutMs,
    LIMITS.probeTimeoutMs,
    LIMITS.probeMinimumTimeoutMs,
    LIMITS.probeMaximumTimeoutMs,
    'Probe timeout'
  );
  const streamBytes = boundedInteger(
    input.streamBytes,
    LIMITS.probeStreamBytes,
    1_024,
    LIMITS.probeStreamBytes,
    'Per-stream output limit'
  );
  const totalBytes = boundedInteger(
    input.totalBytes,
    LIMITS.probeTotalBytes,
    streamBytes,
    LIMITS.probeTotalBytes,
    'Total output limit'
  );
  return Object.freeze({ timeoutMs, streamBytes, totalBytes });
}

function appendBoundedOutput(state, channel, chunk) {
  const source = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
  const current = channel === 'stdout' ? state.stdout : state.stderr;
  const streamRemaining = Math.max(0, state.streamBytes - current.length);
  const totalRemaining = Math.max(0, state.totalBytes - state.total);
  const allowed = Math.min(source.length, streamRemaining, totalRemaining);
  if (allowed > 0) {
    const slice = Buffer.from(source.subarray(0, allowed));
    if (channel === 'stdout') state.stdout = Buffer.concat([state.stdout, slice], state.stdout.length + slice.length);
    else state.stderr = Buffer.concat([state.stderr, slice], state.stderr.length + slice.length);
    state.total += slice.length;
  }
  const limitReached = state.total >= state.totalBytes || state.stdout.length >= state.streamBytes || state.stderr.length >= state.streamBytes;
  if (allowed < source.length || limitReached) {
    state.outputLimited = true;
    if (channel === 'stdout') state.stdoutTruncated = true;
    else state.stderrTruncated = true;
  }
  return state.outputLimited;
}

function probeEvidenceFromState(flag, context, state, terminal) {
  const stdout = state.stdout.toString('utf8');
  const stderr = state.stderr.toString('utf8');
  return Object.freeze({
    kind: 'java-jar-probe',
    collectedAt: new Date().toISOString(),
    provenance: Object.freeze({
      adapter: 'command-runtime-discovery',
      javaExecutable: context.javaExecutable,
      jarPath: context.jarPath,
      argv: Object.freeze(['-jar', context.jarPath, flag]),
      shell: false,
      windowsHide: true,
      commandPurpose: 'bounded JAR runtime evidence'
    }),
    stdout,
    stderr,
    stdoutBytes: state.stdout.length,
    stderrBytes: state.stderr.length,
    totalOutputBytes: state.total,
    stdoutTruncated: state.stdoutTruncated,
    stderrTruncated: state.stderrTruncated,
    outputLimited: state.outputLimited,
    started: terminal.started,
    exitCode: terminal.exitCode,
    signal: terminal.signal,
    timedOut: terminal.timedOut,
    spawnError: terminal.spawnError || null
  });
}

function runBoundedJarProbe(context, flag, configuration) {
  if (!PROBE_FLAGS.includes(flag)) {
    throw discoveryError('RUNTIME_DISCOVERY_PROBE_DENIED', 'Only the fixed --help and --version JAR probes are permitted.');
  }
  return new Promise((resolve) => {
    const state = {
      stdout: Buffer.alloc(0),
      stderr: Buffer.alloc(0),
      streamBytes: configuration.streamBytes,
      totalBytes: configuration.totalBytes,
      total: 0,
      stdoutTruncated: false,
      stderrTruncated: false,
      outputLimited: false
    };
    let child = null;
    let settled = false;
    let timedOut = false;
    let terminationTimer = null;
    let probeTimer = null;

    const finish = (terminal) => {
      if (settled) return;
      settled = true;
      if (probeTimer) clearTimeout(probeTimer);
      if (terminationTimer) clearTimeout(terminationTimer);
      resolve(probeEvidenceFromState(flag, context, state, terminal));
    };

    const terminate = (reason) => {
      if (!child || settled) return;
      if (reason === 'timeout') timedOut = true;
      try {
        child.kill();
      } catch {
        // The child may already have exited between output and termination.
      }
      if (!terminationTimer) {
        terminationTimer = setTimeout(() => {
          finish({
            started: true,
            exitCode: null,
            signal: null,
            timedOut,
            spawnError: reason === 'output-limit' ? 'The JAR probe exceeded its bounded output limit.' : 'The JAR probe did not exit after its bounded timeout.'
          });
        }, LIMITS.probeKillGraceMs);
      }
    };

    try {
      child = spawn(context.javaExecutable, ['-jar', context.jarPath, flag], {
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      });
    } catch (error) {
      finish({
        started: false,
        exitCode: null,
        signal: null,
        timedOut: false,
        spawnError: asText(error && error.message) || 'Unable to start the direct Java probe.'
      });
      return;
    }

    probeTimer = setTimeout(() => terminate('timeout'), configuration.timeoutMs);
    child.stdout.on('data', (chunk) => {
      if (appendBoundedOutput(state, 'stdout', chunk)) terminate('output-limit');
    });
    child.stderr.on('data', (chunk) => {
      if (appendBoundedOutput(state, 'stderr', chunk)) terminate('output-limit');
    });
    child.once('error', (error) => finish({
      started: false,
      exitCode: null,
      signal: null,
      timedOut: false,
      spawnError: asText(error && error.message) || 'Unable to start the direct Java probe.'
    }));
    child.once('close', (code, signal) => finish({
      started: true,
      exitCode: Number.isInteger(code) ? code : null,
      signal: signal || null,
      timedOut,
      spawnError: state.outputLimited ? 'The JAR probe exceeded its bounded output limit.' : timedOut ? 'The JAR probe timed out.' : null
    }));
  });
}

function conservativeRuntimeHints(evidence) {
  const transcript = Array.isArray(evidence)
    ? evidence.map((entry) => asText(entry && entry.stdout) + '\n' + asText(entry && entry.stderr)).join('\n')
    : asText(evidence);
  const lower = transcript.toLowerCase();
  const flavors = [];
  if (/\bpaper(?:clip)?\b/.test(lower)) flavors.push('paper');
  if (/\bspigot\b|\bcraftbukkit\b/.test(lower)) flavors.push('spigot');
  const versions = [];
  const contextPattern = /(?:paper|spigot|craftbukkit|minecraft)[^\r\n]{0,96}?\b(1\.\d{1,2}(?:\.\d{1,2})?)\b/gi;
  for (const match of transcript.matchAll(contextPattern)) {
    const version = match[1];
    if (!versions.includes(version) && versions.length < 8) versions.push(version);
  }
  return Object.freeze({
    classification: 'unverified-hint',
    flavorHints: Object.freeze(flavors),
    minecraftVersionHints: Object.freeze(versions),
    warning: 'These strings are local probe hints only. They do not prove server flavor, version compatibility, command availability, or support.'
  });
}

async function collectJarRuntimeEvidence(input) {
  const source = input || {};
  const [java, jar] = await Promise.all([
    validateJavaExecutableInput(source.javaExecutable),
    validateSelectedJarPath(source.jarPath)
  ]);
  const configuration = createProbeConfiguration(source);
  const context = Object.freeze({ javaExecutable: java.path, jarPath: jar.path });
  const help = await runBoundedJarProbe(context, '--help', configuration);
  const version = await runBoundedJarProbe(context, '--version', configuration);
  return Object.freeze({
    kind: 'jar-runtime-evidence',
    collectedAt: new Date().toISOString(),
    provenance: Object.freeze({
      adapter: 'command-runtime-discovery',
      javaExecutable: java.path,
      javaBytes: java.bytes,
      jarPath: jar.path,
      jarBytes: jar.bytes,
      probes: Object.freeze(['--help', '--version'])
    }),
    constraints: SAFETY_CONSTRAINTS.jarProbes,
    probes: Object.freeze({ help, version }),
    hints: conservativeRuntimeHints([help, version])
  });
}

function normalizeRconDiscoveryCommand(value) {
  const command = asText(value || 'help').trim().toLowerCase();
  if (!RCON_DISCOVERY_COMMANDS.includes(command)) {
    throw discoveryError('RUNTIME_DISCOVERY_RCON_COMMAND_DENIED', 'RCON discovery accepts only the fixed help, plugins, or paper query.');
  }
  return command;
}

function normalizeLoopbackRconHost(value) {
  const host = asText(value || '127.0.0.1').trim();
  if (!LOOPBACK_RCON_HOSTS.has(host)) {
    throw discoveryError('RUNTIME_DISCOVERY_RCON_LOOPBACK', 'RCON discovery connects only to an existing loopback endpoint.');
  }
  return host;
}

function normalizeRconPort(value) {
  if (!Number.isInteger(value) || value < 1 || value > 65_535) {
    throw discoveryError('RUNTIME_DISCOVERY_RCON_PORT', 'RCON port must be a whole number from 1 through 65535.');
  }
  return value;
}

function requireRconPassword(value) {
  if (typeof value !== 'string' || !value) {
    throw discoveryError('RUNTIME_DISCOVERY_RCON_PASSWORD_REQUIRED', 'A protected RCON password is required for a local discovery query.');
  }
  if (Buffer.byteLength(value, 'utf8') > LIMITS.rconPasswordBytes) {
    throw discoveryError('RUNTIME_DISCOVERY_RCON_PASSWORD_BOUNDS', 'The protected RCON password is outside this discovery adapter\'s safety bounds.');
  }
  return value;
}

function rconPacket(id, type, body) {
  const payload = Buffer.from(body, 'utf8');
  if (payload.length > LIMITS.rconFrameBytes - 10) {
    payload.fill(0);
    throw discoveryError('RUNTIME_DISCOVERY_RCON_PACKET_BOUNDS', 'The local RCON discovery packet exceeds the protocol safety limit.');
  }
  const packet = Buffer.alloc(14 + payload.length);
  packet.writeInt32LE(packet.length - 4, 0);
  packet.writeInt32LE(id, 4);
  packet.writeInt32LE(type, 8);
  payload.copy(packet, 12);
  payload.fill(0);
  return packet;
}

function rconEvidence(input, terminal) {
  return Object.freeze({
    kind: 'loopback-rcon-discovery',
    collectedAt: new Date().toISOString(),
    provenance: Object.freeze({
      adapter: 'command-runtime-discovery',
      transport: 'rcon',
      host: input.host,
      port: input.port,
      command: input.command,
      existingEndpointOnly: true
    }),
    constraints: SAFETY_CONSTRAINTS.rcon,
    outcome: terminal.outcome,
    response: terminal.response || null,
    responseBytes: terminal.responseBytes || 0,
    frameCount: terminal.frameCount || 0,
    timedOut: Boolean(terminal.timedOut),
    error: terminal.error || null
  });
}

function collectLoopbackRconEvidence(input) {
  const source = input || {};
  const settings = Object.freeze({
    host: normalizeLoopbackRconHost(source.host),
    port: normalizeRconPort(source.port),
    command: normalizeRconDiscoveryCommand(source.command),
    timeoutMs: boundedInteger(
      source.timeoutMs,
      LIMITS.rconTimeoutMs,
      LIMITS.rconMinimumTimeoutMs,
      LIMITS.rconMaximumTimeoutMs,
      'RCON timeout'
    )
  });
  const password = requireRconPassword(source.password);
  return new Promise((resolve) => {
    const authenticationId = 0x4d535301;
    const queryId = 0x4d535302;
    let socket;
    let settled = false;
    let authenticated = false;
    let inbound = Buffer.alloc(0);
    let frameCount = 0;
    let timer = null;
    let authenticationPacket = null;
    let queryPacket = null;

    const finish = (terminal) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (authenticationPacket) authenticationPacket.fill(0);
      if (queryPacket) queryPacket.fill(0);
      inbound.fill(0);
      inbound = Buffer.alloc(0);
      if (socket) socket.destroy();
      resolve(rconEvidence(settings, terminal));
    };

    const fail = (outcome, error, timedOut) => finish({
      outcome,
      response: null,
      responseBytes: 0,
      frameCount,
      timedOut: Boolean(timedOut),
      error
    });

    const succeed = (response) => finish({
      outcome: 'response',
      response,
      responseBytes: Buffer.byteLength(response, 'utf8'),
      frameCount,
      timedOut: false,
      error: null
    });

    const writePacket = (packet) => {
      if (!socket || settled) return;
      socket.write(packet, () => packet.fill(0));
    };

    try {
      socket = net.createConnection({ host: settings.host, port: settings.port });
    } catch {
      fail('connection-error', 'The local RCON endpoint could not be opened.', false);
      return;
    }

    timer = setTimeout(() => fail('timeout', 'The local RCON endpoint did not respond within the bounded timeout.', true), settings.timeoutMs);
    socket.setNoDelay(true);
    socket.once('connect', () => {
      if (settled) return;
      authenticationPacket = rconPacket(authenticationId, 3, password);
      writePacket(authenticationPacket);
    });
    socket.once('error', () => fail('connection-error', 'The local RCON endpoint rejected or closed the discovery connection.', false));
    socket.once('close', () => {
      if (!settled) fail('connection-closed', 'The local RCON endpoint closed the discovery connection before returning a response.', false);
    });
    socket.on('data', (chunk) => {
      if (settled) return;
      const sourceChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      if (inbound.length + sourceChunk.length > LIMITS.rconBufferedBytes) {
        fail('frame-limit', 'The local RCON response exceeded the bounded frame buffer.', false);
        return;
      }
      inbound = Buffer.concat([inbound, sourceChunk], inbound.length + sourceChunk.length);
      while (!settled && inbound.length >= 4) {
        const declared = inbound.readInt32LE(0);
        if (declared < 10 || declared > LIMITS.rconFrameBytes) {
          fail('frame-limit', 'The local RCON endpoint returned an invalid or oversized frame.', false);
          return;
        }
        const fullLength = declared + 4;
        if (inbound.length < fullLength) return;
        const frame = Buffer.from(inbound.subarray(0, fullLength));
        inbound = Buffer.from(inbound.subarray(fullLength));
        frameCount += 1;
        if (frameCount > LIMITS.rconFrames) {
          frame.fill(0);
          fail('frame-limit', 'The local RCON endpoint returned too many discovery frames.', false);
          return;
        }
        if (frame[frame.length - 1] !== 0 || frame[frame.length - 2] !== 0) {
          frame.fill(0);
          fail('frame-invalid', 'The local RCON endpoint returned a malformed frame terminator.', false);
          return;
        }
        const id = frame.readInt32LE(4);
        const type = frame.readInt32LE(8);
        if (!authenticated && type === 2) {
          frame.fill(0);
          if (id === -1) {
            fail('authentication-failed', 'The local RCON endpoint did not accept the protected credential.', false);
            return;
          }
          if (id !== authenticationId) {
            fail('frame-invalid', 'The local RCON endpoint returned an unexpected authentication frame.', false);
            return;
          }
          authenticated = true;
          queryPacket = rconPacket(queryId, 2, settings.command);
          writePacket(queryPacket);
          continue;
        }
        if (authenticated && id === queryId && (type === 0 || type === 2)) {
          const body = frame.subarray(12, frame.length - 2);
          if (body.length > LIMITS.rconResponseBytes) {
            frame.fill(0);
            fail('response-limit', 'The local RCON response exceeded the discovery response limit.', false);
            return;
          }
          const response = body.toString('utf8');
          frame.fill(0);
          succeed(response);
          return;
        }
        frame.fill(0);
      }
    });
  });
}

function joinedProbeText(probe) {
  const pieces = [asText(probe && probe.stdout), asText(probe && probe.stderr)].filter(Boolean);
  return pieces.join('\n');
}

function conservativeJarFlags(text) {
  const flags = [];
  for (const match of asText(text).matchAll(/--[A-Za-z0-9][A-Za-z0-9-]*/g)) {
    if (!flags.includes(match[0])) flags.push(match[0]);
    if (flags.length >= 128) break;
  }
  return Object.freeze(flags);
}

function publicJarProbeRequest(probe) {
  return Object.freeze({
    javaPath: probe.provenance.javaExecutable,
    jarPath: probe.provenance.jarPath,
    argv: probe.provenance.argv
  });
}

function publicJarProbeRecord(probe) {
  const text = joinedProbeText(probe);
  const failed = !probe.started || probe.timedOut || Boolean(probe.spawnError);
  return Object.freeze({
    probe: probe.provenance.argv[2],
    state: failed ? 'failed' : 'captured',
    source: 'local-jar-probe',
    request: publicJarProbeRequest(probe),
    capturedAt: probe.collectedAt,
    exitCode: probe.exitCode,
    timedOut: probe.timedOut,
    truncated: probe.outputLimited,
    text,
    metadata: Object.freeze({
      stdout: probe.stdout,
      stderr: probe.stderr,
      stdoutBytes: probe.stdoutBytes,
      stderrBytes: probe.stderrBytes,
      totalOutputBytes: probe.totalOutputBytes,
      signal: probe.signal,
      spawnError: probe.spawnError,
      provenance: probe.provenance,
      hints: conservativeRuntimeHints([probe]),
      constraints: SAFETY_CONSTRAINTS.jarProbes
    }),
    flags: conservativeJarFlags(text)
  });
}

function failedJarProbeRecords(error) {
  const message = asText(error && error.message) || 'The selected Java executable or server JAR could not be prepared for direct evidence collection.';
  return Object.freeze(PROBE_FLAGS.map((flag) => Object.freeze({
    probe: flag,
    state: 'failed',
    source: 'local-jar-probe',
    request: Object.freeze({ javaPath: null, jarPath: null, argv: Object.freeze(['-jar', '<unavailable>', flag]) }),
    capturedAt: new Date().toISOString(),
    exitCode: null,
    timedOut: false,
    truncated: false,
    text: '',
    metadata: Object.freeze({ error: message, constraints: SAFETY_CONSTRAINTS.jarProbes }),
    flags: Object.freeze([])
  })));
}

/**
 * Parent-friendly JAR evidence shape for the Command Center registry.
 *
 * The wrapper deliberately accepts javaPath rather than resolving Java through
 * PATH. Invalid inputs become two failed evidence records so the caller can
 * render both requested probes without fabricating a successful result.
 */
async function probeSelectedJar(input) {
  const source = input || {};
  try {
    const evidence = await collectJarRuntimeEvidence({
      javaExecutable: source.javaPath,
      jarPath: source.jarPath,
      timeoutMs: source.timeoutMs,
      streamBytes: source.streamBytes,
      totalBytes: source.totalBytes
    });
    return Object.freeze({
      probes: Object.freeze([
        publicJarProbeRecord(evidence.probes.help),
        publicJarProbeRecord(evidence.probes.version)
      ]),
      hints: evidence.hints,
      constraints: evidence.constraints
    });
  } catch (error) {
    return Object.freeze({
      probes: failedJarProbeRecords(error),
      hints: Object.freeze({
        classification: 'unavailable',
        flavorHints: Object.freeze([]),
        minecraftVersionHints: Object.freeze([]),
        warning: 'No JAR runtime hints were collected because direct probe preparation failed.'
      }),
      constraints: SAFETY_CONSTRAINTS.jarProbes
    });
  }
}

function failedRconProbeRecord(input, error) {
  const requested = asText(input && input.command ? input.command : 'help').trim().toLowerCase();
  const safeCommand = RCON_DISCOVERY_COMMANDS.includes(requested)
    ? requested
    : null;
  return Object.freeze({
    route: 'rcon',
    source: 'local-rcon-probe',
    request: safeCommand,
    capturedAt: new Date().toISOString(),
    state: 'failed',
    exitCode: null,
    timedOut: false,
    truncated: false,
    text: '',
    metadata: Object.freeze({
      error: asText(error && error.message) || 'The local RCON discovery query could not be prepared.',
      constraints: SAFETY_CONSTRAINTS.rcon
    })
  });
}

/**
 * Query an existing IPv4 loopback RCON endpoint with one fixed discovery
 * command. The password is used only to construct the authenticated packet;
 * it is intentionally absent from all returned fields and error text.
 */
async function queryLoopbackRconEvidence(input) {
  const source = input || {};
  try {
    const evidence = await collectLoopbackRconEvidence({
      host: '127.0.0.1',
      port: source.port,
      password: source.password,
      command: source.command,
      timeoutMs: source.timeoutMs
    });
    const truncated = evidence.outcome === 'response-limit' || evidence.outcome === 'frame-limit';
    return Object.freeze({
      route: 'rcon',
      source: 'local-rcon-probe',
      request: evidence.provenance.command,
      capturedAt: evidence.collectedAt,
      state: evidence.outcome === 'response' ? 'captured' : 'failed',
      exitCode: null,
      timedOut: evidence.timedOut,
      truncated,
      text: evidence.response || '',
      metadata: Object.freeze({
        outcome: evidence.outcome,
        responseBytes: evidence.responseBytes,
        frameCount: evidence.frameCount,
        error: evidence.error,
        provenance: evidence.provenance,
        constraints: evidence.constraints
      })
    });
  } catch (error) {
    return failedRconProbeRecord(source, error);
  }
}

module.exports = {
  LIMITS,
  RCON_DISCOVERY_COMMANDS,
  SAFETY_CONSTRAINTS,
  validateSelectedJarPath,
  validateJavaExecutableInput,
  conservativeRuntimeHints,
  collectJarRuntimeEvidence,
  normalizeRconDiscoveryCommand,
  collectLoopbackRconEvidence,
  probeSelectedJar,
  queryLoopbackRconEvidence
};
