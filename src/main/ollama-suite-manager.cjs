'use strict';

const crypto = require('node:crypto');
const http = require('node:http');

// The manager intentionally has one literal local target. Renderer input never
// chooses a URL, host, port, method, path, proxy, credential, or request body.
const LOCAL_OLLAMA_ORIGIN = 'http://127.0.0.1:11434';
const INVENTORY_TIMEOUT_MS = 5_000;
const MUTATION_TIMEOUT_MS = 15_000;
const PULL_TIMEOUT_MS = 15 * 60_000;
const MAX_RESPONSE_BYTES = 1_048_576;
const MAX_REQUEST_BYTES = 1_024;
const MAX_MODELS = 256;
const MAX_MODEL_TEXT = 256;
const MAX_MODEL_REFERENCE_LENGTH = 160;
const MAX_DETAIL_TEXT = 160;
const FRESH_INVENTORY_WINDOW_MS = 2 * 60_000;
const DELETE_PREVIEW_WINDOW_MS = 5 * 60_000;
const CONFIRMATION_CLOCK_SKEW_MS = 60_000;

const REQUESTS = Object.freeze({
  version: Object.freeze({ method: 'GET', pathname: '/api/version', timeoutMs: INVENTORY_TIMEOUT_MS, allowEmpty: false }),
  tags: Object.freeze({ method: 'GET', pathname: '/api/tags', timeoutMs: INVENTORY_TIMEOUT_MS, allowEmpty: false }),
  ps: Object.freeze({ method: 'GET', pathname: '/api/ps', timeoutMs: INVENTORY_TIMEOUT_MS, allowEmpty: false }),
  pull: Object.freeze({ method: 'POST', pathname: '/api/pull', timeoutMs: PULL_TIMEOUT_MS, allowEmpty: false }),
  copy: Object.freeze({ method: 'POST', pathname: '/api/copy', timeoutMs: MUTATION_TIMEOUT_MS, allowEmpty: true }),
  delete: Object.freeze({ method: 'DELETE', pathname: '/api/delete', timeoutMs: MUTATION_TIMEOUT_MS, allowEmpty: true })
});

const MUTATING_OPERATIONS = new Set(['pull', 'copy', 'delete']);
const MODEL_REFERENCE_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{0,127})(?:\/[a-z0-9](?:[a-z0-9._-]{0,127})){0,3}(?::[a-z0-9][a-z0-9._-]{0,63})?$/;
const IDENTIFIER_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class LocalOllamaError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function assertExactKeys(value, keys, message) {
  if (!isPlainObject(value)) throw new LocalOllamaError('invalid-input', message);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new LocalOllamaError('invalid-input', message);
  }
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
  if (value !== LOCAL_OLLAMA_ORIGIN) {
    throw new LocalOllamaError('invalid-endpoint', 'Only the fixed local Ollama endpoint http://127.0.0.1:11434 is allowed.');
  }
  let endpoint;
  try {
    endpoint = new URL(value);
  } catch {
    throw new LocalOllamaError('invalid-endpoint', 'The fixed local Ollama endpoint is invalid.');
  }
  if (endpoint.protocol !== 'http:' || endpoint.hostname !== '127.0.0.1' || endpoint.port !== '11434' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== '/') {
    throw new LocalOllamaError('invalid-endpoint', 'Only the fixed local Ollama endpoint http://127.0.0.1:11434 is allowed.');
  }
  return endpoint;
}

function encodeJsonBody(value) {
  let text;
  try {
    text = JSON.stringify(value);
  } catch {
    throw new LocalOllamaError('invalid-request', 'The selected local operation could not be prepared.');
  }
  const body = Buffer.from(text, 'utf8');
  if (!body.length || body.length > MAX_REQUEST_BYTES) {
    throw new LocalOllamaError('invalid-request', 'The selected local operation could not be prepared.');
  }
  return body;
}

function requestJson(endpoint, spec, bodyValue = undefined, { signal } = {}) {
  if (!Object.values(REQUESTS).includes(spec)) {
    return Promise.reject(new LocalOllamaError('invalid-request', 'The requested local Ollama operation is not registered.'));
  }
  const body = bodyValue === undefined ? null : encodeJsonBody(bodyValue);
  return new Promise((resolve, reject) => {
    let settled = false;
    let deadline = null;
    let abortListener = null;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      if (deadline) clearTimeout(deadline);
      if (signal && abortListener) signal.removeEventListener('abort', abortListener);
      callback(value);
    };
    const fail = (error) => {
      const normalized = error instanceof LocalOllamaError
        ? error
        : new LocalOllamaError(typeof error?.code === 'string' ? error.code : 'request-error', 'The local Ollama API could not be reached.');
      finish(reject, normalized);
    };
    if (signal?.aborted) {
      fail(new LocalOllamaError('operation-cancelled', 'The local Ollama operation was cancelled.'));
      return;
    }
    const request = http.request({
      protocol: endpoint.protocol,
      hostname: endpoint.hostname,
      port: endpoint.port,
      method: spec.method,
      path: spec.pathname,
      headers: body
        ? { Accept: 'application/json', 'Content-Type': 'application/json', 'Content-Length': String(body.length), Connection: 'close' }
        : { Accept: 'application/json', Connection: 'close' },
      agent: false
    }, (response) => {
      const statusCode = Number(response.statusCode || 0);
      const contentType = String(response.headers['content-type'] || '').toLowerCase();
      const contentIsJson = !contentType || contentType.includes('application/json') || contentType.includes('+json');
      if (![200, 204].includes(statusCode)) {
        response.resume();
        fail(new LocalOllamaError('http-status', 'The local Ollama API refused the requested operation.'));
        return;
      }
      if (!contentIsJson && !spec.allowEmpty) {
        response.resume();
        fail(new LocalOllamaError('invalid-content-type', 'The local Ollama API did not return JSON.'));
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
      response.once('error', (error) => fail(error));
      response.once('end', () => {
        if (settled) return;
        if (total === 0 && spec.allowEmpty) {
          finish(resolve, null);
          return;
        }
        if (total === 0 || !contentIsJson) {
          fail(new LocalOllamaError('invalid-json', 'The local Ollama API did not return a usable JSON response.'));
          return;
        }
        try {
          finish(resolve, JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch {
          fail(new LocalOllamaError('invalid-json', 'The local Ollama API returned malformed JSON.'));
        }
      });
    });
    abortListener = () => request.destroy(new LocalOllamaError('operation-cancelled', 'The local Ollama operation was cancelled.'));
    if (signal) {
      if (signal.aborted) {
        abortListener();
      } else {
        signal.addEventListener('abort', abortListener, { once: true });
      }
    }
    request.setTimeout(spec.timeoutMs, () => request.destroy(new LocalOllamaError('timeout', 'The local Ollama API did not respond before the bounded timeout.')));
    deadline = setTimeout(() => request.destroy(new LocalOllamaError('timeout', 'The local Ollama API did not respond before the bounded timeout.')), spec.timeoutMs);
    deadline.unref?.();
    request.once('error', (error) => fail(error));
    request.end(body || undefined);
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
  return {
    name,
    model: boundedText(value.model, MAX_MODEL_TEXT) || name,
    modifiedAt: boundedTimestamp(value.modified_at),
    expiresAt: boundedTimestamp(value.expires_at),
    size: boundedNumber(value.size),
    sizeVram: boundedNumber(value.size_vram),
    contextLength: boundedNumber(value.context_length),
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

function acceptedMutationResponse(value, { statusRequired = false } = {}) {
  if (value === null) {
    if (statusRequired) throw new LocalOllamaError('invalid-operation-response', 'The local Ollama API did not return an accepted operation response.');
    return;
  }
  if (!isPlainObject(value)) throw new LocalOllamaError('invalid-operation-response', 'The local Ollama API did not return an accepted operation response.');
  const status = Object.prototype.hasOwnProperty.call(value, 'status') ? boundedText(value.status, MAX_DETAIL_TEXT) : null;
  if ((statusRequired && !status) || (Object.prototype.hasOwnProperty.call(value, 'status') && !status)) {
    throw new LocalOllamaError('invalid-operation-response', 'The local Ollama API did not return an accepted operation response.');
  }
}

function operationModelReference(value, label) {
  const text = boundedText(value, MAX_MODEL_REFERENCE_LENGTH);
  if (!text || text !== value || !MODEL_REFERENCE_PATTERN.test(text)) {
    throw new LocalOllamaError('invalid-model-reference', `${label} must be a lowercase local model name with optional namespaces and tag.`);
  }
  return text;
}

function operationEligibleModelNames(models) {
  const names = new Set();
  for (const model of Array.isArray(models) ? models : []) {
    try {
      const name = operationModelReference(model?.name, 'Observed model name');
      names.add(name);
    } catch {
      // Unusual local names remain observable but cannot become a mutation argument.
    }
  }
  return [...names].sort((left, right) => left.localeCompare(right)).slice(0, MAX_MODELS);
}

function unavailableCapability(label, detail) {
  return { state: 'unavailable', label, detail };
}

function capabilitySnapshot() {
  return {
    inventory: {
      state: 'available',
      label: 'Local runtime inventory',
      detail: 'The fixed local service supplies bounded installed and running model records.'
    },
    selectedModelMaintenance: {
      state: 'available',
      label: 'Selected installed-model maintenance',
      detail: 'The app can re-pull, copy, or delete one freshly observed installed local model through named fixed-loopback operations. Delete requires the two-key authorization flow.'
    },
    catalog: unavailableCapability('Model Store catalog', 'Official catalog pagination and a verified catalog source are not implemented, so no catalog models are guessed or shown.'),
    batchPulls: unavailableCapability('Batch pull cart', 'Catalog selection, disk preflight, streaming progress, durable queueing, retry, and resume are not implemented. Only a selected already-installed model can be re-pulled.'),
    chat: unavailableCapability('Local chat', 'Streaming chat, history, parameters, attachment capability checks, exports, and response-boundary controls are not implemented.'),
    hardwareFit: unavailableCapability('Hardware fit', 'Current RAM, GPU, VRAM, disk, model metadata, and conservative fit evidence are not implemented.'),
    harness: unavailableCapability('Harness launch', 'Allowlisted harness profiles, preflight, snapshots, restore, and rollback are not implemented.')
  };
}

function copyModels(models) {
  return models.map((model) => ({
    ...model,
    details: model.details ? { ...model.details, families: [...model.details.families] } : null
  }));
}

function publicOperation(operation) {
  if (!operation) return null;
  return {
    id: operation.id,
    kind: operation.kind,
    state: operation.state,
    detail: operation.detail,
    startedAt: operation.startedAt,
    completedAt: operation.completedAt || null,
    cancellable: operation.state === 'running' || operation.state === 'cancelling'
  };
}

function publicStatus(status) {
  const installedModels = copyModels(status.installedModels || []);
  return {
    schemaVersion: 2,
    state: status.state,
    detail: status.detail,
    updatedAt: status.updatedAt,
    lastSuccessfulAt: status.lastSuccessfulAt || null,
    stale: Boolean(status.stale),
    version: status.version || null,
    installedModels,
    runningModels: copyModels(status.runningModels || []),
    operationEligibleModels: operationEligibleModelNames(installedModels),
    operation: publicOperation(status.operation),
    capabilities: capabilitySnapshot()
  };
}

function failureState(error) {
  if (error?.code === 'ECONNREFUSED') {
    return { state: 'unavailable', detail: 'The local Ollama API did not accept a connection. Ollama may be stopped or not installed; start its local service and refresh.' };
  }
  if (['timeout', 'ETIMEDOUT', 'ECONNRESET', 'EHOSTUNREACH', 'ENETUNREACH', 'ECONNABORTED'].includes(error?.code)) {
    return { state: 'offline', detail: 'The local Ollama API could not complete a bounded loopback request. Keep the local service available, then refresh.' };
  }
  return {
    state: 'failed',
    detail: error?.code === 'http-status'
      ? 'The local Ollama API returned an unexpected HTTP status. No response body was accepted.'
      : 'The local Ollama API response was rejected by the bounded validation rules.'
  };
}

function operationFailureDetail(kind, error) {
  if (error?.code === 'operation-cancelled') {
    return `The selected local ${kind} operation was cancelled before this app received a final result. Refresh the local inventory to inspect its current state.`;
  }
  if (error?.code === 'timeout') {
    return `The selected local ${kind} operation did not finish before its bounded time limit. No service response was accepted; refresh the local inventory before trying again.`;
  }
  if (error?.code === 'http-status') {
    return `The fixed local service refused the selected ${kind} operation. No service response body was accepted.`;
  }
  return `The selected local ${kind} operation failed before this app accepted a bounded response. Refresh the local inventory before trying again.`;
}

function constantTimeEqual(left, right) {
  const source = Buffer.from(String(left || ''), 'utf8');
  const target = Buffer.from(String(right || ''), 'utf8');
  return source.length === target.length && crypto.timingSafeEqual(source, target);
}

function validateConfirmation(value, digest) {
  assertExactKeys(value, ['confirmed', 'firstConfirmation', 'secondConfirmation', 'sliderValue', 'digest', 'confirmedAt'], 'The selected model deletion confirmation is invalid.');
  if (value.confirmed !== true || value.firstConfirmation !== true || value.secondConfirmation !== true || Number(value.sliderValue) < 100) {
    throw new LocalOllamaError('confirmation-required', 'Both confirmations and the full authorization slider are required before deleting the selected local model.');
  }
  if (typeof value.digest !== 'string' || !/^[a-f0-9]{64}$/i.test(value.digest) || typeof value.confirmedAt !== 'string' || !Number.isFinite(Date.parse(value.confirmedAt))) {
    throw new LocalOllamaError('confirmation-invalid', 'The selected model deletion confirmation is invalid.');
  }
  const confirmedAt = Date.parse(value.confirmedAt);
  const now = Date.now();
  if (confirmedAt > now + CONFIRMATION_CLOCK_SKEW_MS || now - confirmedAt > DELETE_PREVIEW_WINDOW_MS || !constantTimeEqual(value.digest.toLowerCase(), digest)) {
    throw new LocalOllamaError('confirmation-stale', 'The selected model deletion review is no longer current. Review the selected model again before deleting it.');
  }
}

class LocalOllamaSuiteManager {
  constructor({ onStateChange } = {}) {
    this.endpoint = validateLocalOrigin();
    this.onStateChange = typeof onStateChange === 'function' ? onStateChange : () => {};
    this.lastHealthy = null;
    this.refreshInflight = null;
    this.activeOperation = null;
    this.deletePreview = null;
    this.epoch = 0;
    this.current = {
      state: 'not-checked',
      detail: 'The fixed local Ollama runtime has not been refreshed in this app session.',
      updatedAt: new Date().toISOString(),
      lastSuccessfulAt: null,
      stale: false,
      version: null,
      installedModels: [],
      runningModels: [],
      operation: null
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
    if (this.activeOperation) return Promise.resolve(this.status());
    if (this.refreshInflight) return this.refreshInflight;
    const epoch = ++this.epoch;
    this.publish({
      ...this.current,
      state: 'checking',
      detail: 'Checking the fixed local Ollama API for its version and installed/running model inventory.',
      updatedAt: new Date().toISOString()
    });
    const task = this.refreshNow(epoch);
    this.refreshInflight = task;
    void task.then(
      () => { if (this.refreshInflight === task) this.refreshInflight = null; },
      () => { if (this.refreshInflight === task) this.refreshInflight = null; }
    );
    return task;
  }

  async refreshNow(epoch, { operation = this.current.operation, successDetail = null } = {}) {
    try {
      const [versionPayload, installedPayload, runningPayload] = await Promise.all([
        requestJson(this.endpoint, REQUESTS.version),
        requestJson(this.endpoint, REQUESTS.tags),
        requestJson(this.endpoint, REQUESTS.ps)
      ]);
      if (epoch !== this.epoch) return this.status();
      const observedAt = new Date().toISOString();
      const healthy = {
        state: 'healthy',
        detail: successDetail || 'The fixed local Ollama API returned a bounded version, installed-model inventory, and running-model inventory.',
        updatedAt: observedAt,
        lastSuccessfulAt: observedAt,
        stale: false,
        version: sanitizeVersionResponse(versionPayload),
        installedModels: sanitizeModelsResponse(installedPayload, 'installed'),
        runningModels: sanitizeModelsResponse(runningPayload, 'running'),
        operation
      };
      this.lastHealthy = healthy;
      return this.publish(healthy);
    } catch (error) {
      if (epoch !== this.epoch) return this.status();
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
        runningModels: lastHealthy ? copyModels(lastHealthy.runningModels) : [],
        operation
      });
    }
  }

  ensureFreshInstalledModel(value, label) {
    if (this.current.state !== 'healthy' || this.current.stale || !this.current.lastSuccessfulAt || Date.now() - Date.parse(this.current.lastSuccessfulAt) > FRESH_INVENTORY_WINDOW_MS) {
      throw new LocalOllamaError('inventory-stale', 'Refresh the local model inventory before changing an installed model.');
    }
    const model = operationModelReference(value, label);
    if (!this.current.installedModels.some((record) => record.name === model)) {
      throw new LocalOllamaError('model-not-observed', 'Choose one exact currently observed installed model before requesting this local operation.');
    }
    return model;
  }

  prepareDelete(input) {
    assertExactKeys(input, ['model'], 'Choose one observed installed local model before preparing deletion.');
    const model = this.ensureFreshInstalledModel(input.model, 'Selected model');
    const nonce = crypto.randomBytes(24).toString('hex');
    const digest = crypto.createHash('sha256').update(`minecraft-server-studio-ollama-delete-v1\n${model}\n${this.current.lastSuccessfulAt}\n${nonce}`, 'utf8').digest('hex');
    const expiresAt = new Date(Date.now() + DELETE_PREVIEW_WINDOW_MS).toISOString();
    this.deletePreview = { model, digest, expiresAt };
    return Object.freeze({
      state: 'ready',
      detail: 'Review the selected local model in the two-key confirmation before deletion. This authorization expires after five minutes or any completed model operation.',
      authority: Object.freeze({ digest, purpose: 'delete-selected-local-model', expiresAt })
    });
  }

  async pullModel(input) {
    assertExactKeys(input, ['model'], 'Choose one observed installed local model before requesting a re-pull.');
    const model = this.ensureFreshInstalledModel(input.model, 'Selected model');
    return this.runMutation('pull', 'A selected local model re-pull is in progress through the fixed local service.', async (signal) => {
      const response = await requestJson(this.endpoint, REQUESTS.pull, { model, stream: false, insecure: false }, { signal });
      acceptedMutationResponse(response, { statusRequired: true });
    });
  }

  async copyModel(input) {
    assertExactKeys(input, ['source', 'destination'], 'Choose an observed installed source and a valid destination name before copying a local model.');
    const source = this.ensureFreshInstalledModel(input.source, 'Copy source');
    const destination = operationModelReference(input.destination, 'Copy destination');
    if (source === destination) throw new LocalOllamaError('copy-same-model', 'Choose a different destination name before copying the selected local model.');
    return this.runMutation('copy', 'A selected local model copy is in progress through the fixed local service.', async (signal) => {
      const response = await requestJson(this.endpoint, REQUESTS.copy, { source, destination }, { signal });
      acceptedMutationResponse(response);
    });
  }

  async deleteModel(input) {
    assertExactKeys(input, ['model', 'confirmation'], 'Review the selected local model before requesting deletion.');
    const model = this.ensureFreshInstalledModel(input.model, 'Selected model');
    const preview = this.deletePreview;
    this.deletePreview = null;
    if (!preview || preview.model !== model || Date.parse(preview.expiresAt) < Date.now()) {
      throw new LocalOllamaError('confirmation-stale', 'The selected model deletion review is no longer current. Review the selected model again before deleting it.');
    }
    validateConfirmation(input.confirmation, preview.digest);
    return this.runMutation('delete', 'The selected local model deletion is in progress through the fixed local service.', async (signal) => {
      const response = await requestJson(this.endpoint, REQUESTS.delete, { model }, { signal });
      acceptedMutationResponse(response);
    });
  }

  cancelOperation(input) {
    assertExactKeys(input, ['operationId'], 'Choose the active local operation before requesting cancellation.');
    const operationId = typeof input.operationId === 'string' && IDENTIFIER_PATTERN.test(input.operationId) ? input.operationId.toLowerCase() : '';
    const operation = this.activeOperation;
    if (!operation || operation.id !== operationId) {
      throw new LocalOllamaError('operation-not-active', 'The selected local operation is no longer active. Refresh the local inventory for its current state.');
    }
    operation.cancelRequested = true;
    operation.state = 'cancelling';
    operation.detail = 'Cancellation was requested for the selected local operation. The local service may still finish work before its next inventory refresh.';
    this.publish({ ...this.current, detail: operation.detail, updatedAt: new Date().toISOString(), operation: publicOperation(operation) });
    operation.controller.abort();
    return this.status();
  }

  async runMutation(kind, startDetail, action) {
    if (!MUTATING_OPERATIONS.has(kind) || typeof action !== 'function') {
      throw new LocalOllamaError('invalid-operation', 'The requested local Ollama operation is not registered.');
    }
    if (this.activeOperation) {
      throw new LocalOllamaError('operation-active', 'Another local model operation is already active. Wait for it to finish or request cancellation first.');
    }
    this.deletePreview = null;
    ++this.epoch;
    const operation = {
      id: crypto.randomUUID(),
      kind,
      state: 'running',
      detail: startDetail,
      startedAt: new Date().toISOString(),
      completedAt: null,
      cancelRequested: false,
      controller: new AbortController()
    };
    this.activeOperation = operation;
    this.publish({
      ...this.current,
      state: 'operating',
      detail: startDetail,
      updatedAt: operation.startedAt,
      operation: publicOperation(operation)
    });
    try {
      await action(operation.controller.signal);
      if (operation.cancelRequested) throw new LocalOllamaError('operation-cancelled', 'The local Ollama operation was cancelled.');
      operation.state = 'completed';
      operation.completedAt = new Date().toISOString();
      operation.detail = `The selected local ${kind} operation completed. Refreshing the bounded local inventory now.`;
      this.activeOperation = null;
      return this.refreshAfterOperation(operation);
    } catch (error) {
      const cancelled = operation.cancelRequested || error?.code === 'operation-cancelled';
      operation.state = cancelled ? 'cancelled' : 'failed';
      operation.completedAt = new Date().toISOString();
      operation.detail = operationFailureDetail(kind, cancelled ? new LocalOllamaError('operation-cancelled', '') : error);
      this.activeOperation = null;
      if (cancelled) return this.refreshAfterOperation(operation);
      const fallback = this.lastHealthy;
      return this.publish({
        state: fallback && !fallback.stale ? 'healthy' : 'failed',
        detail: operation.detail,
        updatedAt: operation.completedAt,
        lastSuccessfulAt: fallback?.lastSuccessfulAt || null,
        stale: Boolean(fallback?.stale),
        version: fallback?.version || null,
        installedModels: fallback ? copyModels(fallback.installedModels) : [],
        runningModels: fallback ? copyModels(fallback.runningModels) : [],
        operation: publicOperation(operation)
      });
    }
  }

  async refreshAfterOperation(operation) {
    const epoch = ++this.epoch;
    const publicOperationRecord = publicOperation(operation);
    this.publish({
      ...this.current,
      state: 'checking',
      detail: operation.detail,
      updatedAt: new Date().toISOString(),
      operation: publicOperationRecord
    });
    const task = this.refreshNow(epoch, {
      operation: publicOperationRecord,
      successDetail: `${operation.detail} The fixed local inventory now reflects the latest accepted response.`
    });
    this.refreshInflight = task;
    void task.then(
      () => { if (this.refreshInflight === task) this.refreshInflight = null; },
      () => { if (this.refreshInflight === task) this.refreshInflight = null; }
    );
    return task;
  }

  shutdown() {
    this.deletePreview = null;
    if (this.activeOperation) {
      this.activeOperation.cancelRequested = true;
      this.activeOperation.controller.abort();
    }
  }
}

module.exports = {
  LOCAL_OLLAMA_ORIGIN,
  LocalOllamaSuiteManager
};
