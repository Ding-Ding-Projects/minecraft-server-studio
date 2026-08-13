'use strict';

/**
 * Main-process-only adapter for the shared Status Hub agent API.
 *
 * The renderer can configure a non-secret endpoint and request a status refresh,
 * but it never receives an enrollment token, session key, response envelope, or
 * inbox reply text. Both credentials are persisted only through CredentialVault.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const path = require('node:path');

const CONFIG_VERSION = 1;
const MAX_CONFIG_BYTES = 8 * 1024;
const MAX_REQUEST_BYTES = 64 * 1024;
const MAX_RESPONSE_BYTES = 64 * 1024;
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_SECRET_CHARS = 4_096;
const SESSION_ID_PATTERN = /^mss-[a-f0-9]{24}$/;
const CONNECTION_STATES = Object.freeze([
  'unconfigured',
  'credential-unavailable',
  'connecting',
  'connected',
  'failed'
]);
const INBOX_STATES = Object.freeze([
  'not-polled',
  'polled-empty',
  'replies-observed',
  'failed'
]);
const VAULT_SERVICE = 'minecraft-server-studio';
const ENROLLMENT_TOKEN_ACCOUNT = 'status-hub-ingest-token';
const MAX_HUB_EVIDENCE_ITEMS = 8;
const MAX_HUB_NEXT_GATES = 8;

function bridgeError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function isPlainRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(record, keys) {
  if (!isPlainRecord(record)) return false;
  const received = Object.keys(record).sort();
  const expected = [...keys].sort();
  return received.length === expected.length && received.every((key, index) => key === expected[index]);
}

function text(value, maximum = 1024) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maximum);
}

function safeTimestamp(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function safeInteger(value, maximum = Number.MAX_SAFE_INTEGER) {
  return Number.isSafeInteger(value) && value >= 0 && value <= maximum ? value : null;
}

function numericLoopbackHost(hostname) {
  const normalized = String(hostname || '').toLowerCase();
  return normalized === '127.0.0.1' || normalized === '::1' || normalized === '[::1]';
}

function parseEndpoint(value, allowInsecureLoopback) {
  const source = text(value, 1024);
  if (!source) throw bridgeError('CONFIG_ENDPOINT_REQUIRED', 'A Status Hub endpoint is required before the bridge can connect.');
  let parsed;
  try {
    parsed = new URL(source);
  } catch {
    throw bridgeError('CONFIG_ENDPOINT_INVALID', 'The Status Hub endpoint is not a valid URL.');
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw bridgeError('CONFIG_ENDPOINT_INVALID', 'The Status Hub endpoint cannot include credentials, query values, or a fragment.');
  }
  if (parsed.protocol === 'http:') {
    if (allowInsecureLoopback !== true || !numericLoopbackHost(parsed.hostname)) {
      throw bridgeError('CONFIG_ENDPOINT_INSECURE', 'HTTP is permitted only for explicitly enabled numeric loopback development endpoints.');
    }
  } else if (parsed.protocol !== 'https:') {
    throw bridgeError('CONFIG_ENDPOINT_PROTOCOL', 'The Status Hub endpoint must use HTTPS.');
  }
  parsed.pathname = `${parsed.pathname.replace(/\/+$/, '')}/`;
  return parsed;
}

function publicEndpoint(parsed) {
  if (!(parsed instanceof URL)) return '';
  const pathName = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/$/, '');
  return `${parsed.origin}${pathName}`;
}

function randomSessionId() {
  return `mss-${crypto.randomBytes(12).toString('hex')}`;
}

function validateStoredConfiguration(value) {
  if (!exactKeys(value, ['allowInsecureLoopback', 'endpoint', 'sessionId', 'version'])) {
    throw bridgeError('CONFIG_CORRUPT', 'The saved Status Hub bridge configuration is invalid.');
  }
  if (value.version !== CONFIG_VERSION || typeof value.allowInsecureLoopback !== 'boolean' || !SESSION_ID_PATTERN.test(value.sessionId || '')) {
    throw bridgeError('CONFIG_CORRUPT', 'The saved Status Hub bridge configuration is invalid.');
  }
  const endpoint = parseEndpoint(value.endpoint, value.allowInsecureLoopback);
  return Object.freeze({
    version: CONFIG_VERSION,
    endpoint: endpoint.href,
    endpointLabel: publicEndpoint(endpoint),
    allowInsecureLoopback: value.allowInsecureLoopback,
    sessionId: value.sessionId
  });
}

function normalizeConfigurationInput(value) {
  if (!isPlainRecord(value) || !exactKeys(value, ['allowInsecureLoopback', 'endpoint'])) {
    throw bridgeError('CONFIG_INPUT_INVALID', 'Status Hub bridge settings are invalid.');
  }
  const endpointValue = text(value.endpoint, 1024);
  if (!endpointValue) return null;
  const allowInsecureLoopback = value.allowInsecureLoopback === true;
  const endpoint = parseEndpoint(endpointValue, allowInsecureLoopback);
  return Object.freeze({ endpoint: endpoint.href, endpointLabel: publicEndpoint(endpoint), allowInsecureLoopback });
}

function createPublicStatus(value = {}) {
  const source = isPlainRecord(value) ? value : {};
  const state = CONNECTION_STATES.includes(source.state) ? source.state : 'unconfigured';
  const inboxState = INBOX_STATES.includes(source.inboxState) ? source.inboxState : 'not-polled';
  return Object.freeze({
    state,
    endpoint: text(source.endpoint, 1024),
    allowInsecureLoopback: source.allowInsecureLoopback === true,
    localFallback: true,
    detail: text(source.detail, 1024),
    lastAcceptedRegistrationAt: safeTimestamp(source.lastAcceptedRegistrationAt),
    lastAcceptedUpdateAt: safeTimestamp(source.lastAcceptedUpdateAt),
    lastAcceptedPollAt: safeTimestamp(source.lastAcceptedPollAt),
    inboxState,
    observedReplyCount: safeInteger(source.observedReplyCount, 5_000) || 0,
    latestReplySequence: safeInteger(source.latestReplySequence),
    lastFailureCode: text(source.lastFailureCode, 96)
  });
}

function statusHubErrorFromResponse(statusCode) {
  if (statusCode === 401 || statusCode === 403) return bridgeError('HUB_AUTHENTICATION_FAILED', 'The shared Status Hub rejected the protected bridge credential.');
  if (statusCode === 429) return bridgeError('HUB_RATE_LIMITED', 'The shared Status Hub is rate limiting this bridge. Try again later.');
  if (statusCode >= 500) return bridgeError('HUB_UNAVAILABLE', 'The shared Status Hub is unavailable right now.');
  return bridgeError('HUB_REJECTED', 'The shared Status Hub rejected the bridge request.');
}

function publicFailure(error) {
  const code = text(error?.code, 96) || 'BRIDGE_FAILED';
  const messageByCode = {
    CONFIG_CORRUPT: 'The saved bridge configuration is invalid. Local status remains available.',
    CONFIG_ENDPOINT_INVALID: 'The bridge endpoint is invalid. Local status remains available.',
    CONFIG_ENDPOINT_INSECURE: 'The bridge rejected an insecure endpoint. Local status remains available.',
    CONFIG_ENDPOINT_PROTOCOL: 'The bridge endpoint must use HTTPS. Local status remains available.',
    CONFIG_WRITE_FAILED: 'The bridge settings could not be saved. Local status remains available.',
    CREDENTIAL_UNAVAILABLE: 'A protected bridge credential is unavailable. No external request was sent.',
    HUB_AUTHENTICATION_FAILED: 'The shared Status Hub rejected a protected credential. No delivery claim was made.',
    HUB_RATE_LIMITED: 'The shared Status Hub is rate limiting this bridge. No delivery claim was made.',
    HUB_UNAVAILABLE: 'The shared Status Hub is unavailable. Local status remains available.',
    HUB_REJECTED: 'The shared Status Hub rejected the request. No delivery claim was made.',
    RESPONSE_INVALID: 'The shared Status Hub returned an invalid response. No delivery claim was made.',
    RESPONSE_TOO_LARGE: 'The shared Status Hub response exceeded the allowed size. No delivery claim was made.',
    REQUEST_TIMEOUT: 'The shared Status Hub request timed out. Local status remains available.',
    REQUEST_NETWORK_FAILED: 'The shared Status Hub could not be reached. Local status remains available.',
    REPLY_CURSOR_INVALID: 'The shared Status Hub inbox cursor could not be resynchronized. No reply delivery claim was made.'
  };
  return Object.freeze({ code, detail: messageByCode[code] || 'The bridge failed safely. Local status remains available.' });
}

function requestJson(url, { method, headers = {}, body = null }) {
  const payload = body === null ? null : JSON.stringify(body);
  if (payload !== null && Buffer.byteLength(payload, 'utf8') > MAX_REQUEST_BYTES) {
    return Promise.reject(bridgeError('REQUEST_TOO_LARGE', 'The Status Hub request exceeds the allowed size.'));
  }
  const transport = url.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (handler) => (value) => {
      if (settled) return;
      settled = true;
      handler(value);
    };
    const succeed = finish(resolve);
    const fail = finish(reject);
    const requestHeaders = {
      accept: 'application/json',
      ...headers
    };
    if (payload !== null) {
      requestHeaders['content-type'] = 'application/json; charset=utf-8';
      requestHeaders['content-length'] = String(Buffer.byteLength(payload, 'utf8'));
    }
    const request = transport.request(url, { method, headers: requestHeaders, timeout: REQUEST_TIMEOUT_MS }, (response) => {
      const chunks = [];
      let size = 0;
      response.on('data', (chunk) => {
        size += chunk.length;
        if (size > MAX_RESPONSE_BYTES) {
          response.destroy();
          fail(bridgeError('RESPONSE_TOO_LARGE', 'The Status Hub response exceeds the allowed size.'));
          return;
        }
        chunks.push(chunk);
      });
      response.once('error', () => fail(bridgeError('REQUEST_NETWORK_FAILED', 'The Status Hub connection ended unexpectedly.')));
      response.once('end', () => {
        if (settled) return;
        const contentType = String(response.headers['content-type'] || '').toLowerCase();
        if (!contentType.startsWith('application/json')) {
          return fail(bridgeError('RESPONSE_INVALID', 'The Status Hub response is not JSON.'));
        }
        let parsed;
        try {
          parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        } catch {
          return fail(bridgeError('RESPONSE_INVALID', 'The Status Hub response is not valid JSON.'));
        }
        succeed({ statusCode: Number(response.statusCode) || 0, headers: response.headers, body: parsed });
      });
    });
    request.once('timeout', () => request.destroy(bridgeError('REQUEST_TIMEOUT', 'The Status Hub request timed out.')));
    request.once('error', (error) => {
      if (error?.code === 'REQUEST_TIMEOUT') return fail(error);
      fail(bridgeError('REQUEST_NETWORK_FAILED', 'The Status Hub could not be reached.'));
    });
    if (payload !== null) request.write(payload, 'utf8');
    request.end();
  });
}

function endpointPath(configuration, relative) {
  const base = new URL(configuration.endpoint);
  return new URL(relative.replace(/^\//, ''), base);
}

function mapOperationState(value) {
  return ({
    running: 'running',
    waiting: 'waiting',
    blocked: 'blocked',
    complete: 'landed',
    failed: 'failed',
    cancelled: 'failed',
    idle: 'waiting'
  })[value] || 'waiting';
}

function publicHubUrl(value) {
  const candidate = text(value, 800);
  if (!candidate) return '';
  try {
    const parsed = new URL(candidate);
    if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) return '';
    return parsed.href;
  } catch {
    return '';
  }
}

function statusEvidence(localSnapshot) {
  const records = Array.isArray(localSnapshot?.localEvidence) ? localSnapshot.localEvidence : [];
  return records.slice(0, MAX_HUB_EVIDENCE_ITEMS).map((record, index) => {
    const label = text(record?.title, 160);
    const url = publicHubUrl(record?.url);
    const state = ['pending', 'running', 'verified', 'failed'].includes(record?.state) ? record.state : 'pending';
    if (!label || !url) return null;
    return { id: text(record?.id, 60) || `evidence-${index + 1}`, label, url, state };
  }).filter(Boolean);
}

function statusNextGates(localSnapshot) {
  const records = Array.isArray(localSnapshot?.nextSteps) ? localSnapshot.nextSteps : [];
  const values = records
    .slice(0, MAX_HUB_NEXT_GATES)
    .map((record) => text(record?.label, 240))
    .filter(Boolean);
  values.push('Accepted Status Hub transport response', 'Local desktop status fallback');
  return [...new Set(values)].slice(0, MAX_HUB_NEXT_GATES);
}

function validHubSession(response, sessionId) {
  return isPlainRecord(response?.body)
    && isPlainRecord(response.body.session)
    && response.body.session.id === sessionId;
}

class SharedStatusHubClient {
  constructor(options = {}) {
    if (!isPlainRecord(options)) throw bridgeError('CONFIG_INPUT_INVALID', 'Status Hub bridge options are invalid.');
    this.dataDir = this._normalizeDataDirectory(options.dataDir);
    this.configPath = path.join(this.dataDir, 'status-hub-bridge.json');
    this.credentialVault = options.credentialVault || null;
    this.onStateChange = typeof options.onStateChange === 'function' ? options.onStateChange : () => {};
    this.sessionTitle = text(options.sessionTitle, 160) || 'Minecraft Server Studio desktop status';
    this.repository = text(options.repository, 240) || 'Ding-Ding-Projects/minecraft-server-studio';
    this.agentLabel = text(options.agentLabel, 100) || 'minecraft-server-studio-desktop';
    this.configuration = null;
    this.registrationAccepted = false;
    this.replyCursor = 0;
    this.inFlight = null;
    this.status = createPublicStatus({
      state: 'unconfigured',
      detail: 'No Status Hub bridge endpoint is configured. Local status remains available.',
      inboxState: 'not-polled'
    });
    this._loadConfigurationIntoMemory();
  }

  getStatus() {
    return createPublicStatus(this.status);
  }

  getConfigurationForRenderer() {
    if (!this.configuration) return Object.freeze({ endpoint: '', allowInsecureLoopback: false });
    return Object.freeze({
      endpoint: this.configuration.endpointLabel,
      allowInsecureLoopback: this.configuration.allowInsecureLoopback
    });
  }

  configure(input) {
    const normalized = normalizeConfigurationInput(input);
    if (!normalized) {
      this._clearConfiguration();
      return this._setStatus({
        state: 'unconfigured',
        endpoint: '',
        allowInsecureLoopback: false,
        detail: 'No Status Hub bridge endpoint is configured. Local status remains available.',
        inboxState: 'not-polled',
        observedReplyCount: 0,
        latestReplySequence: null,
        lastFailureCode: ''
      });
    }
    const previousConfiguration = this.configuration;
    const endpointChanged = Boolean(previousConfiguration)
      && (previousConfiguration.endpoint !== normalized.endpoint || previousConfiguration.allowInsecureLoopback !== normalized.allowInsecureLoopback);
    const nextConfiguration = Object.freeze({
      version: CONFIG_VERSION,
      endpoint: normalized.endpoint,
      endpointLabel: normalized.endpointLabel,
      allowInsecureLoopback: normalized.allowInsecureLoopback,
      sessionId: endpointChanged || !previousConfiguration?.sessionId ? randomSessionId() : previousConfiguration.sessionId
    });
    try {
      this._writeConfiguration(nextConfiguration);
    } catch (error) {
      this.configuration = previousConfiguration;
      throw error;
    }
    this.configuration = nextConfiguration;
    if (endpointChanged && previousConfiguration?.sessionId && this._vaultIsProtected()) {
      try {
        this.credentialVault.deleteByKey(this._sessionKey(previousConfiguration.sessionId));
      } catch {
        // The retired protected credential is not required by the newly saved endpoint.
      }
    }
    this.registrationAccepted = false;
    this.replyCursor = 0;
    return this._refreshCredentialState('Bridge settings were saved. Connect only when protected enrollment credentials are available.');
  }

  async synchronize(localSnapshot) {
    if (this.inFlight) return this.inFlight;
    this.inFlight = this._synchronize(localSnapshot).finally(() => { this.inFlight = null; });
    return this.inFlight;
  }

  _normalizeDataDirectory(value) {
    if (typeof value !== 'string' || !value || value.length > 4096 || /[\u0000-\u001f]/.test(value)) {
      throw bridgeError('CONFIG_DIRECTORY_INVALID', 'Status Hub bridge storage requires a private application-data directory.');
    }
    const resolved = path.resolve(value);
    if (resolved === path.parse(resolved).root) {
      throw bridgeError('CONFIG_DIRECTORY_INVALID', 'Status Hub bridge storage requires a private application-data directory.');
    }
    return resolved;
  }

  _loadConfigurationIntoMemory() {
    if (!fs.existsSync(this.configPath)) return;
    try {
      const stat = fs.statSync(this.configPath);
      if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_CONFIG_BYTES) throw bridgeError('CONFIG_CORRUPT', 'The saved Status Hub bridge configuration is invalid.');
      this.configuration = validateStoredConfiguration(JSON.parse(fs.readFileSync(this.configPath, 'utf8')));
      this._refreshCredentialState('A bridge endpoint is saved, but Connect has not been selected and no external session has been accepted.');
    } catch (error) {
      this.configuration = null;
      const failure = publicFailure(error);
      this._setStatus({ state: 'failed', detail: failure.detail, lastFailureCode: failure.code });
    }
  }

  _writeConfiguration(configuration) {
    const record = {
      version: CONFIG_VERSION,
      endpoint: configuration.endpoint,
      allowInsecureLoopback: configuration.allowInsecureLoopback,
      sessionId: configuration.sessionId
    };
    const serialized = JSON.stringify(record);
    const temporary = `${this.configPath}.${process.pid}.${crypto.randomBytes(8).toString('hex')}.tmp`;
    try {
      fs.mkdirSync(this.dataDir, { recursive: true, mode: 0o700 });
      const descriptor = fs.openSync(temporary, 'wx', 0o600);
      try {
        fs.writeFileSync(descriptor, serialized, 'utf8');
        fs.fsyncSync(descriptor);
      } finally {
        fs.closeSync(descriptor);
      }
      fs.renameSync(temporary, this.configPath);
    } catch {
      try { if (fs.existsSync(temporary)) fs.rmSync(temporary, { force: true }); } catch { /* best-effort encrypted-free temp cleanup */ }
      throw bridgeError('CONFIG_WRITE_FAILED', 'The bridge settings could not be saved.');
    }
  }

  _clearConfiguration() {
    const previous = this.configuration;
    this.configuration = null;
    this.registrationAccepted = false;
    this.replyCursor = 0;
    try {
      if (fs.existsSync(this.configPath)) fs.rmSync(this.configPath, { force: false });
    } catch {
      this.configuration = previous;
      throw bridgeError('CONFIG_WRITE_FAILED', 'The bridge settings could not be removed.');
    }
    if (previous?.sessionId && this._vaultIsProtected()) {
      try {
        this.credentialVault.deleteByKey(this._sessionKey(previous.sessionId));
      } catch {
        // Configuration is removed even when a protected credential cleanup is deferred.
      }
    }
  }

  _vaultIsProtected() {
    try {
      const status = this.credentialVault?.getStatus?.();
      return status?.state === 'ready' && status?.mode === 'protected';
    } catch {
      return false;
    }
  }

  _enrollmentKey() {
    return this.credentialVault.createKey(VAULT_SERVICE, ENROLLMENT_TOKEN_ACCOUNT);
  }

  _sessionKey(sessionId) {
    return this.credentialVault.createKey(VAULT_SERVICE, `status-hub-session:${sessionId}`);
  }

  _readCredentials() {
    if (!this.configuration || !this._vaultIsProtected()) {
      throw bridgeError('CREDENTIAL_UNAVAILABLE', 'A protected Status Hub enrollment credential is unavailable.');
    }
    let enrollmentToken;
    let sessionKey;
    try {
      enrollmentToken = this.credentialVault.read(this._enrollmentKey());
      if (!this._safeSecret(enrollmentToken)) throw bridgeError('CREDENTIAL_UNAVAILABLE', 'A protected Status Hub enrollment credential is unavailable.');
      sessionKey = this.credentialVault.read(this._sessionKey(this.configuration.sessionId));
      if (!this._safeSecret(sessionKey)) {
        sessionKey = crypto.randomBytes(32).toString('base64url');
        this.credentialVault.save(this._sessionKey(this.configuration.sessionId), sessionKey);
      }
    } catch (error) {
      if (error?.code === 'CREDENTIAL_UNAVAILABLE') throw error;
      throw bridgeError('CREDENTIAL_UNAVAILABLE', 'A protected Status Hub enrollment credential is unavailable.');
    }
    return { enrollmentToken, sessionKey };
  }

  _safeSecret(value) {
    return typeof value === 'string' && value.length > 0 && value.length <= MAX_SECRET_CHARS && !/[\u0000-\u001f\u007f]/.test(value);
  }

  _refreshCredentialState(detail) {
    if (!this.configuration) {
      return this._setStatus({
        state: 'unconfigured',
        endpoint: '',
        allowInsecureLoopback: false,
        detail: 'No Status Hub bridge endpoint is configured. Local status remains available.',
        inboxState: 'not-polled',
        observedReplyCount: 0,
        latestReplySequence: null,
        lastFailureCode: ''
      });
    }
    try {
      this._readCredentials();
    } catch {
      return this._setStatus({
        state: 'credential-unavailable',
        endpoint: this.configuration.endpointLabel,
        allowInsecureLoopback: this.configuration.allowInsecureLoopback,
        detail: 'A protected Status Hub enrollment credential is unavailable. No external request was sent.',
        inboxState: 'not-polled',
        observedReplyCount: 0,
        latestReplySequence: null,
        lastFailureCode: 'CREDENTIAL_UNAVAILABLE'
      });
    }
    return this._setStatus({
      state: 'unconfigured',
      endpoint: this.configuration.endpointLabel,
      allowInsecureLoopback: this.configuration.allowInsecureLoopback,
      detail: detail || 'The bridge is configured but Connect has not been selected and no external session has been accepted.',
      inboxState: 'not-polled',
      observedReplyCount: 0,
      latestReplySequence: null,
      lastFailureCode: ''
    });
  }

  _setStatus(patch) {
    this.status = createPublicStatus({ ...this.status, ...patch });
    try { this.onStateChange(this.getStatus()); } catch { /* status observers cannot affect the bridge */ }
    return this.getStatus();
  }

  _statusPayload(localSnapshot) {
    const local = isPlainRecord(localSnapshot) ? localSnapshot : {};
    const localState = text(local.currentState, 64) || 'idle';
    const safeEvidence = statusEvidence(local);
    return {
      id: this.configuration.sessionId,
      title: this.sessionTitle,
      repository: this.repository,
      agent: this.agentLabel,
      status: mapOperationState(localState),
      summary: `Desktop local status is ${localState}.`,
      assumption: 'The local desktop status destination remains the fallback.',
      verifiedBaseline: 'No external Status Hub delivery is inferred without accepted transport responses.',
      evidence: safeEvidence,
      nextGates: statusNextGates(local)
    };
  }

  _headers(credentials) {
    return {
      'x-agent-ingest-token': credentials.enrollmentToken,
      'x-session-key': credentials.sessionKey
    };
  }

  async _synchronize(localSnapshot) {
    if (!this.configuration) return this._refreshCredentialState();
    let credentials;
    try {
      credentials = this._readCredentials();
    } catch (error) {
      const failure = publicFailure(error);
      return this._setStatus({
        state: 'credential-unavailable',
        endpoint: this.configuration.endpointLabel,
        allowInsecureLoopback: this.configuration.allowInsecureLoopback,
        detail: failure.detail,
        lastFailureCode: failure.code
      });
    }
    this._setStatus({
      state: 'connecting',
      endpoint: this.configuration.endpointLabel,
      allowInsecureLoopback: this.configuration.allowInsecureLoopback,
      detail: 'A bounded Status Hub registration and status refresh is in progress. No delivery claim exists yet.',
      lastFailureCode: ''
    });
    try {
      const payload = this._statusPayload(localSnapshot);
      if (!this.registrationAccepted) await this._register(payload, credentials);
      await this._update(payload, credentials);
      await this._pollReplies(credentials);
      return this._setStatus({
        state: 'connected',
        endpoint: this.configuration.endpointLabel,
        allowInsecureLoopback: this.configuration.allowInsecureLoopback,
        detail: 'The shared Status Hub accepted this bridge response. Local status remains the fallback; observed replies are not delivered to chat by this app.',
        lastFailureCode: ''
      });
    } catch (error) {
      const failure = publicFailure(error);
      return this._setStatus({
        state: 'failed',
        endpoint: this.configuration.endpointLabel,
        allowInsecureLoopback: this.configuration.allowInsecureLoopback,
        detail: failure.detail,
        inboxState: error?.code === 'REPLY_CURSOR_INVALID' ? 'failed' : this.status.inboxState,
        lastFailureCode: failure.code
      });
    }
  }

  async _register(payload, credentials) {
    const response = await requestJson(endpointPath(this.configuration, 'api/agent/sessions'), {
      method: 'POST',
      headers: this._headers(credentials),
      body: payload
    });
    if (response.statusCode !== 200) throw statusHubErrorFromResponse(response.statusCode);
    if (!validHubSession(response, this.configuration.sessionId)) throw bridgeError('RESPONSE_INVALID', 'The Status Hub registration response is invalid.');
    this.registrationAccepted = true;
    this._setStatus({
      lastAcceptedRegistrationAt: new Date().toISOString(),
      detail: 'The shared Status Hub accepted registration. Publishing the current desktop status now.'
    });
  }

  async _update(payload, credentials) {
    const response = await requestJson(endpointPath(this.configuration, `api/agent/sessions/${encodeURIComponent(this.configuration.sessionId)}`), {
      method: 'PATCH',
      headers: this._headers(credentials),
      body: payload
    });
    if (response.statusCode !== 200) throw statusHubErrorFromResponse(response.statusCode);
    if (!validHubSession(response, this.configuration.sessionId)) throw bridgeError('RESPONSE_INVALID', 'The Status Hub update response is invalid.');
    this._setStatus({
      lastAcceptedUpdateAt: new Date().toISOString(),
      detail: 'The shared Status Hub accepted the current desktop status. Polling the inbox metadata now.'
    });
  }

  async _pollReplies(credentials, retryAfterExpiredCursor = true) {
    const requestedAfter = this.replyCursor;
    const query = `api/agent/sessions/${encodeURIComponent(this.configuration.sessionId)}/replies?after=${requestedAfter}`;
    const response = await requestJson(endpointPath(this.configuration, query), {
      method: 'GET',
      headers: this._headers(credentials)
    });
    if (response.statusCode === 409 && retryAfterExpiredCursor) {
      const oldest = Number(response.headers['x-status-hub-oldest-sequence']);
      if (!Number.isSafeInteger(oldest) || oldest < 1) throw bridgeError('REPLY_CURSOR_INVALID', 'The Status Hub inbox cursor cannot be resynchronized.');
      this.replyCursor = oldest - 1;
      return this._pollReplies(credentials, false);
    }
    if (response.statusCode !== 200) throw statusHubErrorFromResponse(response.statusCode);
    const body = response.body;
    if (!isPlainRecord(body)
      || !Number.isSafeInteger(body.after)
      || body.after !== requestedAfter
      || !Number.isSafeInteger(body.latest)
      || body.latest < body.after
      || !Array.isArray(body.replies)
      || body.replies.length > 5_000) {
      throw bridgeError('RESPONSE_INVALID', 'The Status Hub inbox response is invalid.');
    }
    let previousSequence = requestedAfter;
    for (const reply of body.replies) {
      if (!isPlainRecord(reply)
        || reply.type !== 'reply'
        || reply.sessionId !== this.configuration.sessionId
        || !Number.isSafeInteger(reply.seq)
        || reply.seq <= previousSequence
        || reply.seq > body.latest) {
        throw bridgeError('RESPONSE_INVALID', 'The Status Hub inbox response is invalid.');
      }
      previousSequence = reply.seq;
    }
    this.replyCursor = body.latest;
    this._setStatus({
      lastAcceptedPollAt: new Date().toISOString(),
      inboxState: body.replies.length ? 'replies-observed' : 'polled-empty',
      observedReplyCount: body.replies.length,
      latestReplySequence: body.latest,
      detail: body.replies.length
        ? 'The Hub inbox poll was accepted and reply metadata was observed. This app did not deliver reply text to chat.'
        : 'The Hub inbox poll was accepted and no new replies were observed.'
    });
  }
}

module.exports = {
  CONFIG_VERSION,
  CONNECTION_STATES,
  ENROLLMENT_TOKEN_ACCOUNT,
  INBOX_STATES,
  SharedStatusHubClient,
  createPublicStatus,
  parseEndpoint
};
