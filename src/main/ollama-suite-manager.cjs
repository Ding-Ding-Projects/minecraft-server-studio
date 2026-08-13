const http = require('node:http');

const LOCAL_OLLAMA_ORIGIN = 'http://127.0.0.1:11434';
const REQUEST_TIMEOUT_MS = 5_000;
const MAX_RESPONSE_BYTES = 1_048_576;
const MAX_MODELS = 256;
const MAX_MODEL_TEXT = 256;
const MAX_DETAIL_TEXT = 160;

class LocalOllamaError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function boundedText(value, maxLength = MAX_DETAIL_TEXT) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text && text.length <= maxLength ? text : null;
}

function boundedNumber(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function boundedTimestamp(value) {
  const text = boundedText(value, 96);
  if (!text || Number.isNaN(Date.parse(text))) return null;
  return text;
}

function validateLocalOrigin(value = LOCAL_OLLAMA_ORIGIN) {
  let endpoint;
  try {
    endpoint = new URL(value);
  } catch {
    throw new LocalOllamaError('invalid-endpoint', 'The local Ollama endpoint is invalid.');
  }
  const allowedHosts = new Set(['127.0.0.1', '[::1]', '::1']);
  if (endpoint.protocol !== 'http:' || !allowedHosts.has(endpoint.hostname) || endpoint.port !== '11434' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || !['', '/'].includes(endpoint.pathname)) {
    throw new LocalOllamaError('invalid-endpoint', 'Only the fixed local Ollama endpoint http://127.0.0.1:11434 is allowed.');
  }
  return endpoint;
}

function requestJson(endpoint, pathname) {
  return new Promise((resolve, reject) => {
    const request = http.request({
      protocol: endpoint.protocol,
      hostname: endpoint.hostname,
      port: endpoint.port,
      method: 'GET',
      path: pathname,
      headers: {
        Accept: 'application/json'
      },
      agent: false
    }, (response) => {
      const statusCode = Number(response.statusCode || 0);
      const contentType = String(response.headers['content-type'] || '').toLowerCase();
      const contentIsJson = !contentType || contentType.includes('application/json') || contentType.includes('+json');
      if (statusCode !== 200) {
        response.resume();
        reject(new LocalOllamaError('http-status', `The local Ollama API returned HTTP ${statusCode || 'an invalid status'}.`));
        return;
      }
      if (!contentIsJson) {
        response.resume();
        reject(new LocalOllamaError('invalid-content-type', 'The local Ollama API did not return JSON.'));
        return;
      }
      const chunks = [];
      let total = 0;
      response.on('data', (chunk) => {
        if (!Buffer.isBuffer(chunk)) {
          response.destroy(new LocalOllamaError('invalid-body', 'The local Ollama API returned an invalid response body.'));
          return;
        }
        total += chunk.length;
        if (total > MAX_RESPONSE_BYTES) {
          response.destroy(new LocalOllamaError('response-too-large', 'The local Ollama API response exceeded the safe size limit.'));
          return;
        }
        chunks.push(chunk);
      });
      response.once('error', (error) => reject(error instanceof LocalOllamaError ? error : new LocalOllamaError('response-error', 'The local Ollama API response ended unexpectedly.')));
      response.once('end', () => {
        try {
          const text = Buffer.concat(chunks).toString('utf8');
          const value = JSON.parse(text);
          resolve(value);
        } catch {
          reject(new LocalOllamaError('invalid-json', 'The local Ollama API returned malformed JSON.'));
        }
      });
    });
    request.setTimeout(REQUEST_TIMEOUT_MS, () => request.destroy(new LocalOllamaError('timeout', 'The local Ollama API did not respond before the timeout.')));
    request.once('error', (error) => {
      if (error instanceof LocalOllamaError) return reject(error);
      const code = typeof error?.code === 'string' ? error.code : 'request-error';
      reject(new LocalOllamaError(code, 'The local Ollama API could not be reached.'));
    });
    request.end();
  });
}

function sanitizeDetails(value) {
  if (!isPlainObject(value)) return null;
  const families = Array.isArray(value.families)
    ? value.families.slice(0, 24).map((family) => boundedText(family, 80)).filter(Boolean)
    : [];
  return {
    format: boundedText(value.format, 80),
    family: boundedText(value.family, 80),
    families,
    parameterSize: boundedText(value.parameter_size, 80),
    quantizationLevel: boundedText(value.quantization_level, 80)
  };
}

function sanitizeModel(value) {
  if (!isPlainObject(value)) throw new LocalOllamaError('invalid-model', 'The local Ollama API returned an invalid model record.');
  const name = boundedText(value.name, MAX_MODEL_TEXT);
  if (!name) throw new LocalOllamaError('invalid-model', 'The local Ollama API returned a model without a valid name.');
  const digest = boundedText(value.digest, 160);
  if (digest && !/^[a-f0-9]{16,160}$/i.test(digest)) throw new LocalOllamaError('invalid-model', 'The local Ollama API returned a model with an invalid digest.');
  const contextLength = boundedNumber(value.context_length);
  return {
    name,
    model: boundedText(value.model, MAX_MODEL_TEXT) || name,
    modifiedAt: boundedTimestamp(value.modified_at),
    expiresAt: boundedTimestamp(value.expires_at),
    size: boundedNumber(value.size),
    sizeVram: boundedNumber(value.size_vram),
    contextLength,
    digest,
    details: sanitizeDetails(value.details)
  };
}

function sanitizeModelsResponse(value, source) {
  if (!isPlainObject(value) || !Array.isArray(value.models) || value.models.length > MAX_MODELS) {
    throw new LocalOllamaError('invalid-model-list', `The local Ollama API returned an invalid or oversized ${source} model list.`);
  }
  return value.models.map(sanitizeModel);
}

function sanitizeVersionResponse(value) {
  if (!isPlainObject(value)) throw new LocalOllamaError('invalid-version', 'The local Ollama API returned an invalid version response.');
  const version = boundedText(value.version, 128);
  if (!version) throw new LocalOllamaError('invalid-version', 'The local Ollama API did not provide a valid version.');
  return version;
}

function unavailableCapability(label, detail) {
  return { state: 'unavailable', label, detail };
}

function capabilitySnapshot() {
  return {
    inventory: {
      state: 'available',
      label: 'Local runtime inventory',
      detail: 'This foundation reads only the installed and running model records returned by the local Ollama API.'
    },
    catalog: unavailableCapability('Model Store catalog', 'Official catalog pagination and a verified catalog source are not implemented in this foundation, so no catalog models are guessed or shown.'),
    pulls: unavailableCapability('Batch pulls', 'Model pulls, disk preflight, progress, cancellation, and resume are not implemented in this foundation.'),
    chat: unavailableCapability('Local chat', 'Streaming chat, history, parameters, attachment capability checks, and exports are not implemented in this foundation.'),
    harness: unavailableCapability('Harness launch', 'Allowlisted harness profiles, preflight, snapshots, restore, and rollback are not implemented in this foundation.')
  };
}

function copyModels(models) {
  return models.map((model) => ({
    ...model,
    details: model.details ? { ...model.details, families: [...model.details.families] } : null
  }));
}

function publicStatus(status) {
  return {
    schemaVersion: 1,
    endpoint: LOCAL_OLLAMA_ORIGIN,
    state: status.state,
    detail: status.detail,
    updatedAt: status.updatedAt,
    lastSuccessfulAt: status.lastSuccessfulAt || null,
    stale: Boolean(status.stale),
    version: status.version || null,
    installedModels: copyModels(status.installedModels || []),
    runningModels: copyModels(status.runningModels || []),
    capabilities: capabilitySnapshot()
  };
}

function failureState(error) {
  if (error?.code === 'ECONNREFUSED') {
    return {
      state: 'unavailable',
      detail: 'The local Ollama API did not accept a connection. Ollama may be stopped or not installed; start its local service and refresh.'
    };
  }
  if (['timeout', 'ETIMEDOUT', 'ECONNRESET', 'EHOSTUNREACH', 'ENETUNREACH', 'ECONNABORTED'].includes(error?.code)) {
    return {
      state: 'offline',
      detail: 'The local Ollama API could not complete a bounded loopback request. Keep the local service available, then refresh.'
    };
  }
  return {
    state: 'failed',
    detail: error?.code === 'http-status'
      ? 'The local Ollama API returned an unexpected HTTP status. No response body was accepted.'
      : 'The local Ollama API response was rejected by the bounded validation rules.'
  };
}

class LocalOllamaSuiteManager {
  constructor({ onStateChange } = {}) {
    this.endpoint = validateLocalOrigin();
    this.onStateChange = typeof onStateChange === 'function' ? onStateChange : () => {};
    this.lastHealthy = null;
    this.inflight = null;
    this.current = {
      state: 'not-checked',
      detail: 'The local Ollama runtime has not been refreshed in this app session.',
      updatedAt: new Date().toISOString(),
      lastSuccessfulAt: null,
      stale: false,
      version: null,
      installedModels: [],
      runningModels: []
    };
  }

  status() {
    return publicStatus(this.current);
  }

  publish(next) {
    this.current = next;
    this.onStateChange(this.status());
    return this.status();
  }

  refresh() {
    if (this.inflight) return this.inflight;
    this.publish({
      ...this.current,
      state: 'checking',
      detail: 'Checking the fixed local Ollama API for its version and installed/running model inventory.',
      updatedAt: new Date().toISOString()
    });
    this.inflight = this.refreshNow().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  async refreshNow() {
    try {
      const [versionPayload, installedPayload, runningPayload] = await Promise.all([
        requestJson(this.endpoint, '/api/version'),
        requestJson(this.endpoint, '/api/tags'),
        requestJson(this.endpoint, '/api/ps')
      ]);
      const observedAt = new Date().toISOString();
      const healthy = {
        state: 'healthy',
        detail: 'The fixed local Ollama API returned a bounded version, installed-model inventory, and running-model inventory.',
        updatedAt: observedAt,
        lastSuccessfulAt: observedAt,
        stale: false,
        version: sanitizeVersionResponse(versionPayload),
        installedModels: sanitizeModelsResponse(installedPayload, 'installed'),
        runningModels: sanitizeModelsResponse(runningPayload, 'running')
      };
      this.lastHealthy = healthy;
      return this.publish(healthy);
    } catch (error) {
      const failure = failureState(error);
      const lastHealthy = this.lastHealthy;
      return this.publish({
        state: failure.state,
        detail: lastHealthy ? `${failure.detail} The last successful inventory remains visible only as stale session data.` : failure.detail,
        updatedAt: new Date().toISOString(),
        lastSuccessfulAt: lastHealthy?.lastSuccessfulAt || null,
        stale: Boolean(lastHealthy),
        version: lastHealthy?.version || null,
        installedModels: lastHealthy ? copyModels(lastHealthy.installedModels) : [],
        runningModels: lastHealthy ? copyModels(lastHealthy.runningModels) : []
      });
    }
  }
}

module.exports = {
  LOCAL_OLLAMA_ORIGIN,
  LocalOllamaSuiteManager
};
