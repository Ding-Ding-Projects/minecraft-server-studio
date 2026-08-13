'use strict';

// Main-process-only, bounded schedule-source adapter.  The renderer can save
// non-secret endpoint configuration and ask for a refresh, but never receives
// a bearer value, raw network payload, DNS result, redirect location, or
// arbitrary request route.

const dns = require('node:dns');
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');

const EXTERNAL_SCHEDULE_SOURCE_VERSION = 1;
const SOURCE_TYPES = Object.freeze(['local', 'https-api', 'home-assistant']);
const EXTERNAL_SOURCE_TYPES = Object.freeze(['https-api', 'home-assistant']);
const MAX_ENDPOINT_LENGTH = 1024;
const MAX_ENTITY_ID_LENGTH = 128;
const MAX_TOKEN_LENGTH = 4096;
const MAX_RESPONSE_BYTES = 64 * 1024;
const MAX_RESPONSE_NESTING = 32;
const REQUEST_TIMEOUT_MS = 8_000;
const MIN_REFRESH_SECONDS = 30;
const MAX_REFRESH_SECONDS = 3_600;
const DEFAULT_REFRESH_SECONDS = 300;
const API_CONTRACT_VERSION = 1;
const HOME_ASSISTANT_ENTITY_PATTERN = /^(?:binary_sensor|input_boolean)\.[a-z0-9_]{1,96}$/;
const LANGUAGE_MODES = Object.freeze(['english', 'cantonese', 'bilingual']);
const VAULT_SERVICE = 'minecraft-server-studio';

function sourceError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function isPlainRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function exactKeys(value, keys, message) {
  if (!isPlainRecord(value)) throw sourceError('SCHEDULE_SOURCE_INVALID_RECORD', message);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw sourceError('SCHEDULE_SOURCE_INVALID_RECORD', message);
  }
}

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

function safeText(value, maximum, label, { allowEmpty = false } = {}) {
  if (value === undefined || value === null) {
    if (allowEmpty) return '';
    throw sourceError('SCHEDULE_SOURCE_INVALID_VALUE', `${label} is required.`);
  }
  if (typeof value !== 'string') throw sourceError('SCHEDULE_SOURCE_INVALID_VALUE', `${label} must be text.`);
  const normalized = value.trim();
  if (!normalized && allowEmpty) return '';
  if (!normalized || normalized.length > maximum || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw sourceError('SCHEDULE_SOURCE_INVALID_VALUE', `${label} is invalid.`);
  }
  return normalized;
}

function numericLoopbackHost(hostname) {
  const normalized = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  return normalized === '127.0.0.1' || normalized === '::1';
}

function normalizeIpLiteral(value) {
  return String(value || '').toLowerCase().replace(/^\[|\]$/g, '');
}

function unsafeIpv4(address) {
  const parts = String(address || '').split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [first, second, third] = parts;
  if (first === 0 || first === 10 || first === 127 || first >= 224) return true;
  if (first === 100 && second >= 64 && second <= 127) return true;
  if (first === 169 && second === 254) return true;
  if (first === 172 && second >= 16 && second <= 31) return true;
  if (first === 192 && second === 168) return true;
  if (first === 192 && second === 0 && third === 2) return true;
  if (first === 198 && (second === 18 || second === 19)) return true;
  if (first === 198 && second === 51 && third === 100) return true;
  if (first === 203 && second === 0 && third === 113) return true;
  return false;
}

function unsafeIpv6(address) {
  const normalized = normalizeIpLiteral(address);
  if (!normalized || normalized.startsWith('::')) return true;
  if (/^(?:fc|fd|fe8|fe9|fea|feb|ff)/.test(normalized)) return true;
  if (normalized.startsWith('2001:db8:') || normalized.startsWith('2001:0') || normalized.startsWith('2002:') || normalized.startsWith('64:ff9b:')) return true;
  return false;
}

function unsafeAddress(address) {
  const normalized = normalizeIpLiteral(address);
  const family = net.isIP(normalized);
  if (family === 4) return unsafeIpv4(normalized);
  if (family === 6) return unsafeIpv6(normalized);
  return true;
}

function normalizeEndpoint(value, allowInsecureLoopback) {
  const source = safeText(value, MAX_ENDPOINT_LENGTH, 'Schedule source endpoint', { allowEmpty: true });
  if (!source) return '';
  let parsed;
  try {
    parsed = new URL(source);
  } catch {
    throw sourceError('SCHEDULE_SOURCE_ENDPOINT_INVALID', 'The schedule source endpoint is not a valid URL.');
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw sourceError('SCHEDULE_SOURCE_ENDPOINT_INVALID', 'The schedule source endpoint cannot include credentials, query values, or a fragment.');
  }
  const host = normalizeIpLiteral(parsed.hostname);
  const isLoopback = numericLoopbackHost(host);
  if (parsed.protocol === 'http:') {
    if (allowInsecureLoopback !== true || !isLoopback) {
      throw sourceError('SCHEDULE_SOURCE_ENDPOINT_INSECURE', 'HTTP is permitted only for an explicitly enabled numeric loopback development endpoint.');
    }
  } else if (parsed.protocol !== 'https:') {
    throw sourceError('SCHEDULE_SOURCE_ENDPOINT_PROTOCOL', 'The schedule source endpoint must use HTTPS, except for an explicitly enabled numeric loopback development endpoint.');
  }
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) {
    throw sourceError('SCHEDULE_SOURCE_ENDPOINT_HOST', 'The schedule source endpoint must use a public HTTPS host or an explicitly enabled numeric loopback development host.');
  }
  const family = net.isIP(host);
  if (family && unsafeAddress(host) && !(allowInsecureLoopback === true && isLoopback)) {
    throw sourceError('SCHEDULE_SOURCE_ENDPOINT_HOST', 'The schedule source endpoint must not target a private, link-local, loopback, or reserved address.');
  }
  parsed.pathname = parsed.pathname || '/';
  return parsed.href;
}

function publicEndpoint(value) {
  if (!value) return '';
  try {
    const parsed = new URL(value);
    const pathname = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/$/, '');
    return `${parsed.origin}${pathname}`;
  } catch {
    return '';
  }
}

function normalizeRefreshSeconds(value) {
  if (value === undefined || value === null || value === '') return DEFAULT_REFRESH_SECONDS;
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < MIN_REFRESH_SECONDS || numeric > MAX_REFRESH_SECONDS) {
    throw sourceError('SCHEDULE_SOURCE_INVALID_VALUE', `Schedule source refresh interval must be a whole number from ${MIN_REFRESH_SECONDS} through ${MAX_REFRESH_SECONDS} seconds.`);
  }
  return numeric;
}

function normalizeEntityId(value) {
  const entityId = safeText(value, MAX_ENTITY_ID_LENGTH, 'Home Assistant boolean entity', { allowEmpty: true }).toLowerCase();
  if (entityId && !HOME_ASSISTANT_ENTITY_PATTERN.test(entityId)) {
    throw sourceError('SCHEDULE_SOURCE_ENTITY_INVALID', 'Home Assistant source must name an input_boolean or binary_sensor entity using lowercase letters, numbers, and underscores.');
  }
  return entityId;
}

function defaultExternalSourceConfigurations() {
  return {
    httpsApi: { endpoint: '', allowInsecureLoopback: false, refreshSeconds: DEFAULT_REFRESH_SECONDS },
    homeAssistant: { endpoint: '', allowInsecureLoopback: false, entityId: '', refreshSeconds: DEFAULT_REFRESH_SECONDS }
  };
}

function normalizeExternalSourceConfigurations(value) {
  exactKeys(value, ['httpsApi', 'homeAssistant'], 'External schedule source settings are invalid.');
  exactKeys(value.httpsApi, ['endpoint', 'allowInsecureLoopback', 'refreshSeconds'], 'HTTPS schedule source settings are invalid.');
  exactKeys(value.homeAssistant, ['endpoint', 'allowInsecureLoopback', 'entityId', 'refreshSeconds'], 'Home Assistant schedule source settings are invalid.');
  if (typeof value.httpsApi.allowInsecureLoopback !== 'boolean' || typeof value.homeAssistant.allowInsecureLoopback !== 'boolean') {
    throw sourceError('SCHEDULE_SOURCE_INVALID_VALUE', 'Schedule-source loopback development permission must be on or off.');
  }
  return {
    httpsApi: {
      endpoint: normalizeEndpoint(value.httpsApi.endpoint, value.httpsApi.allowInsecureLoopback),
      allowInsecureLoopback: value.httpsApi.allowInsecureLoopback,
      refreshSeconds: normalizeRefreshSeconds(value.httpsApi.refreshSeconds)
    },
    homeAssistant: {
      endpoint: normalizeEndpoint(value.homeAssistant.endpoint, value.homeAssistant.allowInsecureLoopback),
      allowInsecureLoopback: value.homeAssistant.allowInsecureLoopback,
      entityId: normalizeEntityId(value.homeAssistant.entityId),
      refreshSeconds: normalizeRefreshSeconds(value.homeAssistant.refreshSeconds)
    }
  };
}

function sourceConfigurationKey(type) {
  return type === 'https-api' ? 'httpsApi' : type === 'home-assistant' ? 'homeAssistant' : null;
}

function normalizeSourceType(value, { externalOnly = false } = {}) {
  if (typeof value !== 'string' || !SOURCE_TYPES.includes(value) || (externalOnly && !EXTERNAL_SOURCE_TYPES.includes(value))) {
    throw sourceError('SCHEDULE_SOURCE_TYPE_INVALID', externalOnly ? 'Choose the HTTPS API or Home Assistant schedule source.' : 'Choose a supported schedule source.');
  }
  return value;
}

function normalizeSourceConfigurationInput(value) {
  exactKeys(value, ['sourceType', 'endpoint', 'allowInsecureLoopback', 'entityId', 'refreshSeconds'], 'Schedule source configuration is invalid.');
  const sourceType = normalizeSourceType(value.sourceType, { externalOnly: true });
  if (typeof value.allowInsecureLoopback !== 'boolean') throw sourceError('SCHEDULE_SOURCE_INVALID_VALUE', 'Loopback development permission must be on or off.');
  const endpoint = normalizeEndpoint(value.endpoint, value.allowInsecureLoopback);
  const refreshSeconds = normalizeRefreshSeconds(value.refreshSeconds);
  const entityId = sourceType === 'home-assistant' ? normalizeEntityId(value.entityId) : '';
  if (sourceType === 'https-api' && safeText(value.entityId, MAX_ENTITY_ID_LENGTH, 'Home Assistant boolean entity', { allowEmpty: true })) {
    throw sourceError('SCHEDULE_SOURCE_INVALID_VALUE', 'HTTPS API configuration cannot include a Home Assistant entity.');
  }
  return { sourceType, endpoint, allowInsecureLoopback: value.allowInsecureLoopback, entityId, refreshSeconds };
}

function updateExternalSourceConfigurations(configurations, input) {
  const current = normalizeExternalSourceConfigurations(configurations);
  const normalized = normalizeSourceConfigurationInput(input);
  const next = copy(current);
  const key = sourceConfigurationKey(normalized.sourceType);
  if (normalized.sourceType === 'https-api') {
    next[key] = {
      endpoint: normalized.endpoint,
      allowInsecureLoopback: normalized.allowInsecureLoopback,
      refreshSeconds: normalized.refreshSeconds
    };
  } else {
    next[key] = {
      endpoint: normalized.endpoint,
      allowInsecureLoopback: normalized.allowInsecureLoopback,
      entityId: normalized.entityId,
      refreshSeconds: normalized.refreshSeconds
    };
  }
  return normalizeExternalSourceConfigurations(next);
}

function credentialKeyFor(credentialVault, type) {
  return credentialVault.createKey(VAULT_SERVICE, `schedule-source:${type}:token`);
}

function safeTimestamp(value) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

function publicFailure(error) {
  const code = String(error?.code || 'SCHEDULE_SOURCE_FAILED').slice(0, 96);
  const details = {
    SCHEDULE_SOURCE_ENDPOINT_INVALID: 'The saved endpoint is invalid. No request was sent; local language remains active.',
    SCHEDULE_SOURCE_ENDPOINT_INSECURE: 'The endpoint is not HTTPS or an explicitly enabled numeric loopback development endpoint. No request was sent; local language remains active.',
    SCHEDULE_SOURCE_ENDPOINT_PROTOCOL: 'The endpoint protocol is not allowed. No request was sent; local language remains active.',
    SCHEDULE_SOURCE_ENDPOINT_HOST: 'The endpoint host is not allowed. No request was sent; local language remains active.',
    SCHEDULE_SOURCE_RESOLUTION_FAILED: 'The endpoint could not be resolved to an allowed address. No schedule value was applied.',
    SCHEDULE_SOURCE_SSRF_BLOCKED: 'The endpoint resolved to a private, link-local, loopback, or reserved address. No request was sent.',
    SCHEDULE_SOURCE_REQUEST_TIMEOUT: 'The schedule-source request timed out. No schedule value was applied.',
    SCHEDULE_SOURCE_NETWORK_FAILED: 'The schedule-source request could not be completed. No schedule value was applied.',
    SCHEDULE_SOURCE_REDIRECT_REJECTED: 'The schedule source attempted a redirect. Redirects are rejected and no schedule value was applied.',
    SCHEDULE_SOURCE_RESPONSE_TOO_LARGE: 'The schedule-source response exceeded the safe size limit. No schedule value was applied.',
    SCHEDULE_SOURCE_RESPONSE_INVALID: 'The schedule-source response did not match the documented bounded contract. No schedule value was applied.',
    SCHEDULE_SOURCE_HTTP_STATUS: 'The schedule source returned an unsuccessful response. No schedule value was applied.',
    SCHEDULE_SOURCE_AUTHENTICATION_FAILED: 'The schedule source rejected its protected credential. No schedule value was applied.',
    SCHEDULE_SOURCE_RATE_LIMITED: 'The schedule source is rate limiting refreshes. No schedule value was applied.',
    SCHEDULE_SOURCE_CREDENTIAL_UNAVAILABLE: 'A protected schedule-source token is unavailable. No request was sent.',
    SCHEDULE_SOURCE_CANCELLED: 'A newer schedule-source refresh superseded this response. Local language remains active.'
  };
  return { code, detail: details[code] || 'The schedule source failed safely. No schedule value was applied.' };
}

function resolveAllowedAddresses(parsed, allowInsecureLoopback) {
  const host = normalizeIpLiteral(parsed.hostname);
  const directFamily = net.isIP(host);
  if (directFamily) {
    if (unsafeAddress(host) && !(allowInsecureLoopback === true && numericLoopbackHost(host))) {
      return Promise.reject(sourceError('SCHEDULE_SOURCE_SSRF_BLOCKED', 'Schedule source address is not allowed.'));
    }
    return Promise.resolve([{ address: host, family: directFamily }]);
  }
  return dns.promises.lookup(host, { all: true, verbatim: true })
    .catch(() => { throw sourceError('SCHEDULE_SOURCE_RESOLUTION_FAILED', 'Schedule source hostname could not be resolved.'); })
    .then((records) => {
      if (!Array.isArray(records) || !records.length || records.length > 8) {
        throw sourceError('SCHEDULE_SOURCE_RESOLUTION_FAILED', 'Schedule source hostname could not be resolved.');
      }
      const normalized = records.map((record) => ({ address: normalizeIpLiteral(record?.address), family: Number(record?.family) }));
      if (normalized.some((record) => (record.family !== 4 && record.family !== 6) || unsafeAddress(record.address))) {
        throw sourceError('SCHEDULE_SOURCE_SSRF_BLOCKED', 'Schedule source hostname resolved to a blocked address.');
      }
      return normalized;
    });
}

function boundedJsonParse(bytes) {
  const text = bytes.toString('utf8');
  let depth = 0;
  let quoted = false;
  let escaping = false;
  for (const character of text) {
    if (quoted) {
      if (escaping) escaping = false;
      else if (character === '\\') escaping = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') {
      quoted = true;
      continue;
    }
    if (character === '{' || character === '[') {
      depth += 1;
      if (depth > MAX_RESPONSE_NESTING) throw sourceError('SCHEDULE_SOURCE_RESPONSE_INVALID', 'Schedule source JSON nesting exceeds the allowed limit.');
    } else if (character === '}' || character === ']') {
      depth -= 1;
      if (depth < 0) throw sourceError('SCHEDULE_SOURCE_RESPONSE_INVALID', 'Schedule source JSON structure is invalid.');
    }
  }
  if (quoted || escaping || depth !== 0) throw sourceError('SCHEDULE_SOURCE_RESPONSE_INVALID', 'Schedule source JSON structure is invalid.');
  try {
    return JSON.parse(text);
  } catch {
    throw sourceError('SCHEDULE_SOURCE_RESPONSE_INVALID', 'Schedule source response is not valid JSON.');
  }
}

function requestJson(url, { allowInsecureLoopback, token, signal }) {
  return resolveAllowedAddresses(url, allowInsecureLoopback).then((addresses) => new Promise((resolve, reject) => {
    const transport = url.protocol === 'https:' ? https : http;
    const candidates = [...addresses];
    let settled = false;
    const finish = (handler) => (value) => {
      if (settled) return;
      settled = true;
      handler(value);
    };
    const succeed = finish(resolve);
    const fail = finish(reject);
    const request = transport.request(url, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${token}`,
        'user-agent': 'Minecraft-Server-Studio/schedule-source'
      },
      timeout: REQUEST_TIMEOUT_MS,
      signal,
      lookup: (_hostname, _options, callback) => {
        const candidate = candidates.shift() || addresses[0];
        callback(null, candidate.address, candidate.family);
      }
    }, (response) => {
      const statusCode = Number(response.statusCode) || 0;
      if (statusCode >= 300 && statusCode < 400) {
        response.resume();
        fail(sourceError('SCHEDULE_SOURCE_REDIRECT_REJECTED', 'Schedule source redirects are not allowed.'));
        return;
      }
      if (statusCode !== 200) {
        response.resume();
        const code = statusCode === 401 || statusCode === 403
          ? 'SCHEDULE_SOURCE_AUTHENTICATION_FAILED'
          : statusCode === 429
            ? 'SCHEDULE_SOURCE_RATE_LIMITED'
            : 'SCHEDULE_SOURCE_HTTP_STATUS';
        fail(sourceError(code, 'Schedule source returned an unsuccessful status.'));
        return;
      }
      const contentType = String(response.headers['content-type'] || '').toLowerCase();
      if (!contentType.startsWith('application/json')) {
        response.resume();
        fail(sourceError('SCHEDULE_SOURCE_RESPONSE_INVALID', 'Schedule source response must be JSON.'));
        return;
      }
      const chunks = [];
      let size = 0;
      response.on('data', (chunk) => {
        size += chunk.length;
        if (size > MAX_RESPONSE_BYTES) {
          response.destroy();
          fail(sourceError('SCHEDULE_SOURCE_RESPONSE_TOO_LARGE', 'Schedule source response is too large.'));
          return;
        }
        chunks.push(chunk);
      });
      response.once('error', () => fail(sourceError('SCHEDULE_SOURCE_NETWORK_FAILED', 'Schedule source connection ended unexpectedly.')));
      response.once('end', () => {
        if (settled) return;
        try {
          succeed(boundedJsonParse(Buffer.concat(chunks)));
        } catch (error) {
          fail(error?.code === 'SCHEDULE_SOURCE_RESPONSE_INVALID'
            ? error
            : sourceError('SCHEDULE_SOURCE_RESPONSE_INVALID', 'Schedule source response is not valid JSON.'));
        }
      });
    });
    request.once('timeout', () => request.destroy(sourceError('SCHEDULE_SOURCE_REQUEST_TIMEOUT', 'Schedule source request timed out.')));
    request.once('error', (error) => {
      if (error?.name === 'AbortError' || error?.code === 'ABORT_ERR') return fail(sourceError('SCHEDULE_SOURCE_CANCELLED', 'Schedule source request was cancelled.'));
      if (error?.code === 'SCHEDULE_SOURCE_REQUEST_TIMEOUT') return fail(error);
      fail(sourceError('SCHEDULE_SOURCE_NETWORK_FAILED', 'Schedule source request failed.'));
    });
    request.end();
  }));
}

function normalizeApiResponse(value) {
  exactKeys(value, ['settings', 'version'], 'HTTPS schedule source response is invalid.');
  if (value.version !== API_CONTRACT_VERSION) throw sourceError('SCHEDULE_SOURCE_RESPONSE_INVALID', 'HTTPS schedule source response version is unsupported.');
  exactKeys(value.settings, ['language'], 'HTTPS schedule source settings are invalid.');
  if (!LANGUAGE_MODES.includes(value.settings.language)) throw sourceError('SCHEDULE_SOURCE_RESPONSE_INVALID', 'HTTPS schedule source language is invalid.');
  return value.settings.language;
}

function normalizeHomeAssistantResponse(value, entityId) {
  if (!isPlainRecord(value) || value.entity_id !== entityId || typeof value.state !== 'string') {
    throw sourceError('SCHEDULE_SOURCE_RESPONSE_INVALID', 'Home Assistant response is invalid for the configured boolean entity.');
  }
  const state = value.state.trim().toLowerCase();
  if (!['on', 'off'].includes(state)) throw sourceError('SCHEDULE_SOURCE_RESPONSE_INVALID', 'Home Assistant boolean entity did not return on or off.');
  return state === 'on';
}

function endpointForSource(type, configuration) {
  const base = new URL(configuration.endpoint);
  if (type === 'https-api') return base;
  base.pathname = `${base.pathname.replace(/\/+$/, '')}/`;
  return new URL(`api/states/${encodeURIComponent(configuration.entityId)}`, base);
}

function sourceLabel(type) {
  return type === 'https-api' ? 'Validated HTTPS API' : type === 'home-assistant' ? 'Home Assistant boolean entity' : 'Local schedule';
}

class ExternalScheduleSourceAdapter {
  constructor(options = {}) {
    if (!isPlainRecord(options)) throw sourceError('SCHEDULE_SOURCE_INVALID_OPTIONS', 'Schedule source options are invalid.');
    const allowed = new Set(['credentialVault', 'onChange']);
    for (const key of Object.keys(options)) if (!allowed.has(key)) throw sourceError('SCHEDULE_SOURCE_INVALID_OPTIONS', 'Schedule source options are invalid.');
    this.credentialVault = options.credentialVault || null;
    this.onChange = typeof options.onChange === 'function' ? options.onChange : null;
    this.configurations = defaultExternalSourceConfigurations();
    this.runtime = Object.fromEntries(EXTERNAL_SOURCE_TYPES.map((type) => [type, this._notConfiguredRuntime(type)]));
    this.generation = 0;
    this.controller = null;
  }

  setConfigurations(value) {
    const next = normalizeExternalSourceConfigurations(value);
    const previous = this.configurations;
    const changed = EXTERNAL_SOURCE_TYPES.some((type) => {
      const key = sourceConfigurationKey(type);
      return JSON.stringify(previous[key]) !== JSON.stringify(next[key]);
    });
    if (changed && this.controller) this.controller.abort();
    if (changed) {
      this.generation += 1;
      this.controller = null;
    }
    this.configurations = next;
    for (const type of EXTERNAL_SOURCE_TYPES) {
      const current = this.runtime[type];
      const key = sourceConfigurationKey(type);
      const sourceChanged = JSON.stringify(previous[key]) !== JSON.stringify(next[key]);
      if (!this.isConfigured(type)) this.runtime[type] = this._notConfiguredRuntime(type);
      else if (sourceChanged || current.state === 'not-configured') this.runtime[type] = this._credentialRuntime(type);
    }
    return this.snapshot();
  }

  getConfigurations() {
    return copy(this.configurations);
  }

  isConfigured(type) {
    const key = sourceConfigurationKey(type);
    const config = key ? this.configurations[key] : null;
    return Boolean(config?.endpoint && (type !== 'home-assistant' || config.entityId));
  }

  updateConfiguration(input) {
    return updateExternalSourceConfigurations(this.configurations, input);
  }

  saveCredential(input) {
    exactKeys(input, ['sourceType', 'token'], 'Schedule-source token input is invalid.');
    const type = normalizeSourceType(input.sourceType, { externalOnly: true });
    if (!this.isConfigured(type)) throw sourceError('SCHEDULE_SOURCE_CONFIGURATION_REQUIRED', 'Save a complete non-secret schedule-source configuration before saving its protected token.');
    const token = safeText(input.token, MAX_TOKEN_LENGTH, 'Schedule-source token');
    const vault = this._requireProtectedVault();
    vault.save(credentialKeyFor(vault, type), token);
    this.runtime[type] = this.isConfigured(type) ? this._credentialRuntime(type) : this._notConfiguredRuntime(type);
    this._notify();
    return this.snapshot();
  }

  clearCredential(typeInput) {
    const type = normalizeSourceType(typeInput, { externalOnly: true });
    const vault = this._requireProtectedVault();
    if (this.controller) this.controller.abort();
    this.controller = null;
    this.generation += 1;
    vault.deleteByKey(credentialKeyFor(vault, type));
    this.runtime[type] = this.isConfigured(type) ? this._credentialRuntime(type) : this._notConfiguredRuntime(type);
    this._notify();
    return this.snapshot();
  }

  async refresh(options = {}) {
    const requested = Array.isArray(options.types) ? options.types : EXTERNAL_SOURCE_TYPES;
    const types = [...new Set(requested.map((type) => normalizeSourceType(type, { externalOnly: true })))]
      .filter((type) => this.isConfigured(type));
    if (!types.length) {
      for (const type of EXTERNAL_SOURCE_TYPES) if (!this.isConfigured(type)) this.runtime[type] = this._notConfiguredRuntime(type);
      this._notify();
      return this.snapshot();
    }
    if (this.controller) this.controller.abort();
    const controller = new AbortController();
    this.controller = controller;
    const generation = ++this.generation;
    for (const type of types) {
      this.runtime[type] = {
        ...this._credentialRuntime(type),
        state: 'refreshing',
        detail: `${sourceLabel(type)} refresh is in progress. No external value is applied until a bounded response is accepted.`,
        lastCheckedAt: this.runtime[type]?.lastCheckedAt || null,
        lastAcceptedAt: this.runtime[type]?.lastAcceptedAt || null,
        language: null,
        active: false
      };
    }
    this._notify();
    await Promise.all(types.map((type) => this._refreshOne(type, generation, controller.signal)));
    if (this.controller === controller) this.controller = null;
    return this.snapshot();
  }

  async refreshDue(now = Date.now()) {
    const timestamp = Number.isFinite(now) ? now : Date.now();
    const due = EXTERNAL_SOURCE_TYPES.filter((type) => {
      if (!this.isConfigured(type) || this.credentialState(type) !== 'ready') return false;
      const last = Date.parse(this.runtime[type]?.lastCheckedAt || '');
      const config = this.configurations[sourceConfigurationKey(type)];
      return !Number.isFinite(last) || timestamp - last >= config.refreshSeconds * 1000;
    });
    return due.length ? this.refresh({ types: due }) : this.snapshot();
  }

  stop() {
    if (this.controller) this.controller.abort();
    this.controller = null;
  }

  sourceState(type) {
    const normalized = normalizeSourceType(type, { externalOnly: true });
    return copy(this.runtime[normalized]);
  }

  snapshot() {
    const sources = [{
      id: 'local',
      label: sourceLabel('local'),
      enabled: true,
      configured: true,
      credentialState: 'not-required',
      state: 'ready',
      endpoint: '',
      allowInsecureLoopback: false,
      entityId: '',
      refreshSeconds: 0,
      lastCheckedAt: null,
      lastAcceptedAt: null,
      detail: 'Runs from this app’s validated local settings only. No network request is made.'
    }];
    for (const type of EXTERNAL_SOURCE_TYPES) {
      const key = sourceConfigurationKey(type);
      const config = this.configurations[key];
      const runtime = this.runtime[type] || this._notConfiguredRuntime(type);
      sources.push({
        id: type,
        label: sourceLabel(type),
        enabled: true,
        configured: this.isConfigured(type),
        credentialState: this.credentialState(type),
        state: runtime.state,
        endpoint: publicEndpoint(config.endpoint),
        allowInsecureLoopback: config.allowInsecureLoopback === true,
        entityId: type === 'home-assistant' ? config.entityId : '',
        refreshSeconds: config.refreshSeconds,
        lastCheckedAt: safeTimestamp(runtime.lastCheckedAt),
        lastAcceptedAt: safeTimestamp(runtime.lastAcceptedAt),
        detail: runtime.detail,
        valueLanguage: type === 'https-api' && LANGUAGE_MODES.includes(runtime.language) ? runtime.language : null,
        active: type === 'home-assistant' ? runtime.active === true : null
      });
    }
    return Object.freeze({
      version: EXTERNAL_SCHEDULE_SOURCE_VERSION,
      sources: Object.freeze(sources.map((source) => Object.freeze(source))),
      states: Object.freeze(Object.fromEntries(EXTERNAL_SOURCE_TYPES.map((type) => [type, Object.freeze(copy(this.runtime[type]))])))
    });
  }

  credentialState(type) {
    if (!this.isConfigured(type)) return 'not-configured';
    const vault = this._protectedVaultOrNull();
    if (!vault) return 'unavailable';
    try {
      return vault.has(credentialKeyFor(vault, type)) ? 'ready' : 'missing';
    } catch {
      return 'unavailable';
    }
  }

  _protectedVaultOrNull() {
    try {
      const status = this.credentialVault?.getStatus?.();
      return status?.state === 'ready' && status?.mode === 'protected' ? this.credentialVault : null;
    } catch {
      return null;
    }
  }

  _requireProtectedVault() {
    const vault = this._protectedVaultOrNull();
    if (!vault) throw sourceError('SCHEDULE_SOURCE_CREDENTIAL_UNAVAILABLE', 'Protected schedule-source token storage is unavailable. No request was sent.');
    return vault;
  }

  _notConfiguredRuntime(type) {
    return {
      state: 'not-configured',
      detail: type === 'https-api'
        ? 'Configure a validated HTTPS schedule endpoint and protected token before it can refresh. No request was sent.'
        : 'Configure a Home Assistant base endpoint, boolean entity, and protected token before it can refresh. No request was sent.',
      lastCheckedAt: null,
      lastAcceptedAt: null,
      language: null,
      active: false
    };
  }

  _credentialRuntime(type) {
    const credential = this.credentialState(type);
    if (credential === 'ready') {
      return {
        state: 'idle',
        detail: `${sourceLabel(type)} is configured with a protected token. Refresh it explicitly or wait for its bounded scheduled refresh.`,
        lastCheckedAt: null,
        lastAcceptedAt: null,
        language: null,
        active: false
      };
    }
    if (credential === 'unavailable') {
      return {
        state: 'credential-unavailable',
        detail: 'Protected schedule-source token storage is unavailable. No request was sent.',
        lastCheckedAt: null,
        lastAcceptedAt: null,
        language: null,
        active: false
      };
    }
    return {
      state: 'credential-unavailable',
      detail: 'A protected schedule-source token is required before a request can be sent.',
      lastCheckedAt: null,
      lastAcceptedAt: null,
      language: null,
      active: false
    };
  }

  _readToken(type) {
    const vault = this._requireProtectedVault();
    let token;
    try {
      token = vault.read(credentialKeyFor(vault, type));
    } catch {
      throw sourceError('SCHEDULE_SOURCE_CREDENTIAL_UNAVAILABLE', 'Protected schedule-source token storage is unavailable. No request was sent.');
    }
    if (typeof token !== 'string' || !token || token.length > MAX_TOKEN_LENGTH || /[\u0000-\u001f\u007f]/.test(token)) {
      throw sourceError('SCHEDULE_SOURCE_CREDENTIAL_UNAVAILABLE', 'A protected schedule-source token is unavailable. No request was sent.');
    }
    return token;
  }

  async _refreshOne(type, generation, signal) {
    try {
      const token = this._readToken(type);
      const configuration = this.configurations[sourceConfigurationKey(type)];
      const payload = await requestJson(endpointForSource(type, configuration), {
        allowInsecureLoopback: configuration.allowInsecureLoopback,
        token,
        signal
      });
      if (generation !== this.generation) return;
      const now = new Date().toISOString();
      if (type === 'https-api') {
        const language = normalizeApiResponse(payload);
        this.runtime[type] = {
          state: 'ready',
          detail: 'The validated HTTPS API returned a versioned allowed language value. It can apply only through matching saved schedule rules.',
          lastCheckedAt: now,
          lastAcceptedAt: now,
          language,
          active: true
        };
      } else {
        const active = normalizeHomeAssistantResponse(payload, configuration.entityId);
        this.runtime[type] = {
          state: active ? 'ready' : 'inactive',
          detail: active
            ? 'The Home Assistant boolean entity is on. Matching saved Home Assistant schedule rules can apply.'
            : 'The Home Assistant boolean entity is off. Local base or other matching rules remain active.',
          lastCheckedAt: now,
          lastAcceptedAt: now,
          language: null,
          active
        };
      }
    } catch (error) {
      if (generation !== this.generation || error?.code === 'SCHEDULE_SOURCE_CANCELLED') return;
      const failure = publicFailure(error);
      this.runtime[type] = {
        state: 'failed',
        detail: failure.detail,
        lastCheckedAt: new Date().toISOString(),
        lastAcceptedAt: this.runtime[type]?.lastAcceptedAt || null,
        language: null,
        active: false
      };
    } finally {
      if (generation === this.generation) this._notify();
    }
  }

  _notify() {
    try { this.onChange?.(this.snapshot()); } catch { /* observers cannot change source state */ }
  }
}

module.exports = {
  API_CONTRACT_VERSION,
  DEFAULT_REFRESH_SECONDS,
  EXTERNAL_SCHEDULE_SOURCE_VERSION,
  EXTERNAL_SOURCE_TYPES,
  ExternalScheduleSourceAdapter,
  MAX_REFRESH_SECONDS,
  MIN_REFRESH_SECONDS,
  SOURCE_TYPES,
  defaultExternalSourceConfigurations,
  normalizeExternalSourceConfigurations,
  normalizeSourceConfigurationInput,
  updateExternalSourceConfigurations
};
