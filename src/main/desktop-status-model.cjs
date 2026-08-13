'use strict';

/**
 * Local desktop status and completeness data model.
 *
 * This module is deliberately pure: it imports no packages, opens no files,
 * starts no processes, and makes no network request. The Electron main process
 * can use the returned snapshots to render a local status destination without
 * making this model itself a chat bridge, remote control surface, or network
 * client. A separate main-process adapter may attach a safe bridge-state
 * projection to a snapshot after it receives real transport responses.
 */

const STATUS_SCHEMA_VERSION = 1;
const COMPLETENESS_INVENTORY_SCHEMA_VERSION = 1;
const MAX_COLLECTION_ITEMS = 128;
const MAX_TEXT_LENGTH = 1_024;
const MAX_DETAIL_LENGTH = 4_096;

const OPERATION_STATES = Object.freeze([
  'idle',
  'running',
  'waiting',
  'blocked',
  'complete',
  'failed',
  'cancelled'
]);

const PROOF_STATES = Object.freeze([
  'not-started',
  'pending',
  'in-progress',
  'blocked',
  'verified',
  'not-applicable'
]);

const STATUS_HUB_BRIDGE_STATES = Object.freeze([
  'unconfigured',
  'credential-unavailable',
  'connecting',
  'connected',
  'failed'
]);

const STATUS_HUB_INBOX_STATES = Object.freeze([
  'not-polled',
  'polled-empty',
  'replies-observed',
  'failed'
]);

const LOCAL_BRIDGE_BOUNDARY = deepFreeze({
  id: 'local-desktop-only',
  state: 'local-only',
  exactBoundary: 'This in-process local status model has no network client. It cannot send, receive, poll, synchronize, or execute through a chat service or external Hub. A separate main-process adapter may attach only safe connection state after an accepted transport response.',
  chatBridge: {
    available: false,
    reason: 'This model does not deliver messages to or receive messages from chat.'
  },
  externalStatusHubBridge: {
    available: false,
    reason: 'This pure model has no external Status Hub registration, transport, polling, or inbox implementation.'
  },
  network: {
    available: false,
    reason: 'The model has no network client, endpoint, transport, or synchronization behavior.'
  },
  remoteExecution: {
    available: false,
    reason: 'The model describes status only and cannot execute a server, command, installer, or update.'
  }
});

const DESKTOP_SURFACES = deepFreeze([
  surface('status-destination', 'Local status destination', 'A local desktop status view for current work, evidence, events, and next steps.'),
  surface('status-hub-bridge', 'Shared Status Hub bridge', 'An opt-in main-process bridge with protected credentials, explicit connection state, and local fallback.'),
  surface('server-creation', 'Server creation', 'Structured creation of local Paper or Spigot server definitions.'),
  surface('dependency-bootstrap', 'Automatic dependency bootstrap', 'Detection, automatic installation, recovery, and evidence for required tools.'),
  surface('paper', 'Paper setup', 'Official Paper version selection, download, validation, and setup controls.'),
  surface('spigot-buildtools', 'Spigot and BuildTools setup', 'BuildTools preflight, managed workspace, JDK selection, and safe JAR promotion.'),
  surface('java-runtime-and-jar-launch', 'Java runtimes and JAR launch', 'Managed Java runtime selection, validated launch configuration, and local JAR lifecycle.'),
  surface('protocol-management', 'Protocol management', 'Runtime protocol discovery, capability evidence, and protocol-safe controls.'),
  surface('command-center', 'Command center', 'Structured Minecraft command forms, capability badges, and bounded raw fallback.'),
  surface('plugins', 'Plugin management', 'Local plugin inspection, selection, installation, compatibility reporting, and removal controls.'),
  surface('configuration', 'Server configuration', 'Rich controls for server, world, gameplay, network, runtime, and property configuration.'),
  surface('server-access-records', 'Server access records', 'Bounded local operators, allowlist, player-ban, and IP-ban file inspection and mutation for controlled server roots.'),
  surface('console-and-rcon', 'Console and RCON', 'Local console, RCON configuration, credential handling, command delivery, and recovery states.'),
  surface('backups-and-updates', 'Backups and updates', 'Local backup, restore, update discovery, staging, rollback, and progress controls.'),
  surface('application-updates', 'Application updates', 'Unsigned Squirrel application-update discovery, download, restart, and recovery controls.'),
  surface('settings-appearance-and-localization', 'Settings, appearance, and localization', 'Desktop settings, appearance controls, language modes, and localized rich controls.'),
  surface('command-palette', 'Desktop command palette', 'A local Ctrl+Shift+F palette that navigates documented destinations, tabs, articles, and safe renderer controls.'),
  surface('file-converter', 'Local file converter', 'Offline adapter catalog, conversion queue, validation, and result history.'),
  surface('ollama', 'Local Ollama suite', 'Local runtime, model store, chat, batch pull, hardware-fit, and harness controls.'),
  surface('authenticator-and-toy-locks', 'Authenticator and toy locks', 'Local authenticator, toy-lock flows, credential-vault boundaries, and recovery guidance.'),
  surface('docs-history-and-notifications', 'Documentation, history, and notifications', 'Offline documentation, local history, and notification center.'),
  surface('changelog-viewer', 'Offline changelog viewer', 'Bundled version records, local filtering, safe commit handoff, copy, and export.'),
  surface('local-history-and-safe-exports', 'Local history and safe exports', 'Redacted append-only local history metadata, filtering, safe structured exports, and external-editor handoff.'),
  surface('export', 'Export', 'Structured local export, omission disclosure, archive options, and external-editor handoff.')
]);

function surface(id, title, scope) {
  return { id, title, scope };
}

/**
 * Creates a serializable snapshot for one local desktop status destination.
 * Values are copied and frozen so a renderer cannot accidentally mutate the
 * caller's status record after it has been published.
 */
function createLocalStatusSnapshot(input = {}) {
  const now = new Date().toISOString();
  const source = objectValue(input);

  return deepFreeze({
    schemaVersion: STATUS_SCHEMA_VERSION,
    kind: 'minecraft-server-studio-local-status',
    scope: 'desktop-local',
    currentState: normalizeOperationState(source.currentState, 'idle'),
    lastUpdated: normalizeTimestamp(source.lastUpdated, now),
    activeOperations: normalizeCollection(source.activeOperations, normalizeOperation, now),
    events: normalizeCollection(source.events, normalizeEvent, now),
    localEvidence: normalizeCollection(source.localEvidence, normalizeEvidence, now),
    nextSteps: normalizeCollection(source.nextSteps, normalizeNextStep, now),
    statusHubBridge: createStatusHubBridgeSnapshot(source.statusHubBridge),
    bridgeBoundary: LOCAL_BRIDGE_BOUNDARY
  });
}

/**
 * Normalizes safe, non-secret state reported by the optional main-process
 * bridge. The local model never reads credentials, raw response envelopes, or
 * reply text; those values cannot enter this renderer-facing projection.
 */
function createStatusHubBridgeSnapshot(input = {}) {
  const source = objectValue(input);
  const state = STATUS_HUB_BRIDGE_STATES.includes(source.state) ? source.state : 'unconfigured';
  const inboxState = STATUS_HUB_INBOX_STATES.includes(source.inboxState) ? source.inboxState : 'not-polled';
  return deepFreeze({
    state,
    endpoint: normalizeBridgeEndpoint(source.endpoint),
    allowInsecureLoopback: source.allowInsecureLoopback === true,
    localFallback: true,
    detail: detailValue(source.detail),
    lastAcceptedRegistrationAt: normalizeOptionalTimestamp(source.lastAcceptedRegistrationAt),
    lastAcceptedUpdateAt: normalizeOptionalTimestamp(source.lastAcceptedUpdateAt),
    lastAcceptedPollAt: normalizeOptionalTimestamp(source.lastAcceptedPollAt),
    inboxState,
    observedReplyCount: normalizeBoundedInteger(source.observedReplyCount, 5_000, 0),
    latestReplySequence: normalizeBoundedInteger(source.latestReplySequence, Number.MAX_SAFE_INTEGER, null),
    lastFailureCode: normalizeFailureCode(source.lastFailureCode)
  });
}

/**
 * Creates the hand-written inventory shape for every desktop surface. The
 * default is intentionally incomplete: callers must attach real paths and
 * proof state before a row can become complete.
 */
function createDesktopCompletenessInventory(input = {}) {
  const source = objectValue(input);
  const overrides = normalizeRowOverrides(source.rows);
  const rows = DESKTOP_SURFACES.map((definition) => createCompletenessRow(definition, overrides.get(definition.id)));
  const assessment = assessDesktopCompleteness(rows);

  return deepFreeze({
    schemaVersion: COMPLETENESS_INVENTORY_SCHEMA_VERSION,
    kind: 'minecraft-server-studio-desktop-completeness-inventory',
    scope: 'desktop-surfaces',
    generatedAt: normalizeTimestamp(source.generatedAt, new Date().toISOString()),
    rows,
    summary: assessment.summary,
    incompleteRows: assessment.incompleteRows,
    boundary: 'This is a local inventory template. It records declared evidence only; it does not run tests, capture screens, inspect build artifacts, or contact an external service.'
  });
}

/**
 * Creates one normalized inventory row. It is exported so an implementation
 * can update one surface without duplicating the evidence contract.
 */
function createCompletenessRow(definition, override = {}) {
  const base = objectValue(definition);
  const source = objectValue(override);
  const implementationPath = normalizeLocalPathList(source.implementationPath);
  const documentationPath = normalizeLocalPathList(source.documentationPath);

  return deepFreeze({
    id: normalizeIdentifier(base.id, 'unknown-surface'),
    title: textValue(base.title, 'Untitled surface'),
    scope: textValue(base.scope, ''),
    implementationPath,
    documentationPath,
    localization: normalizeProof(source.localization, 'No localization evidence has been recorded.'),
    test: normalizeProof(source.test, 'No test evidence has been recorded.'),
    capture: normalizeProof(source.capture, 'No built-artifact capture evidence has been recorded.'),
    evidence: normalizeProof(source.evidence, 'No implementation evidence has been recorded.')
  });
}

/**
 * Evaluates the inventory without treating an omission, a pending record, or
 * a not-applicable record as proof. Completeness is deliberately fail-closed.
 */
function assessDesktopCompleteness(rows) {
  const normalizedRows = Array.isArray(rows) ? rows : [];
  const results = normalizedRows.map((row) => {
    const missing = [];
    if (!Array.isArray(row.implementationPath) || row.implementationPath.length === 0) missing.push('implementationPath');
    if (!Array.isArray(row.documentationPath) || row.documentationPath.length === 0) missing.push('documentationPath');
    if (!proofIsVerified(row.localization)) missing.push('localization');
    if (!proofIsVerified(row.test)) missing.push('test');
    if (!proofIsVerified(row.capture)) missing.push('capture');
    if (!proofIsVerified(row.evidence)) missing.push('evidence');
    return {
      id: normalizeIdentifier(row.id, 'unknown-surface'),
      state: missing.length === 0 ? 'complete' : 'incomplete',
      missing
    };
  });
  const incompleteRows = results.filter((result) => result.state === 'incomplete');

  return deepFreeze({
    summary: {
      state: incompleteRows.length === 0 ? 'complete' : 'incomplete',
      totalRows: results.length,
      completeRows: results.length - incompleteRows.length,
      incompleteRows: incompleteRows.length
    },
    incompleteRows
  });
}

function normalizeOperation(value, index, now) {
  const source = objectValue(value);
  return {
    id: normalizeIdentifier(source.id, `operation-${index + 1}`),
    title: textValue(source.title || source.label, `Operation ${index + 1}`),
    state: normalizeOperationState(source.state, 'running'),
    startedAt: normalizeTimestamp(source.startedAt, now),
    progress: normalizeProgress(source.progress),
    detail: detailValue(source.detail),
    evidenceIds: normalizeIdentifierList(source.evidenceIds)
  };
}

function normalizeEvent(value, index, now) {
  const source = objectValue(value);
  return {
    id: normalizeIdentifier(source.id, `event-${index + 1}`),
    type: normalizeIdentifier(source.type, 'status-event'),
    message: textValue(source.message, 'No event message recorded.'),
    state: normalizeOperationState(source.state, 'idle'),
    occurredAt: normalizeTimestamp(source.occurredAt, now),
    operationId: normalizeIdentifier(source.operationId, '')
  };
}

function normalizeEvidence(value, index, now) {
  const source = objectValue(value);
  return {
    id: normalizeIdentifier(source.id, `evidence-${index + 1}`),
    title: textValue(source.title || source.label, `Local evidence ${index + 1}`),
    kind: normalizeIdentifier(source.kind, 'local-record'),
    state: normalizeProofState(source.state, 'pending'),
    localPath: normalizeLocalPath(source.localPath),
    recordedAt: normalizeTimestamp(source.recordedAt, now),
    detail: detailValue(source.detail)
  };
}

function normalizeNextStep(value, index) {
  const source = objectValue(value);
  return {
    id: normalizeIdentifier(source.id, `next-step-${index + 1}`),
    label: textValue(source.label, `Next step ${index + 1}`),
    state: normalizeOperationState(source.state, 'waiting'),
    blockedBy: normalizeIdentifierList(source.blockedBy),
    evidenceIds: normalizeIdentifierList(source.evidenceIds),
    detail: detailValue(source.detail)
  };
}

function normalizeProof(value, fallbackDetail) {
  const source = typeof value === 'string' ? { state: value } : objectValue(value);
  return {
    state: normalizeProofState(source.state, 'pending'),
    detail: detailValue(source.detail || fallbackDetail),
    references: normalizeLocalPathList(source.references)
  };
}

function normalizeRowOverrides(value) {
  const entries = new Map();
  if (Array.isArray(value)) {
    for (const row of value) {
      const source = objectValue(row);
      const id = normalizeIdentifier(source.id, '');
      if (id) entries.set(id, source);
    }
    return entries;
  }
  for (const [id, row] of Object.entries(objectValue(value))) {
    entries.set(normalizeIdentifier(id, ''), objectValue(row));
  }
  return entries;
}

function normalizeCollection(value, normalizeItem, now) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_COLLECTION_ITEMS).map((item, index) => normalizeItem(item, index, now));
}

function normalizeOperationState(value, fallback) {
  return OPERATION_STATES.includes(value) ? value : fallback;
}

function normalizeProofState(value, fallback) {
  return PROOF_STATES.includes(value) ? value : fallback;
}

function normalizeProgress(value) {
  if (!Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value * 100) / 100));
}

function normalizeTimestamp(value, fallback) {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : fallback;
}

function normalizeOptionalTimestamp(value) {
  return normalizeTimestamp(value, null);
}

function normalizeBoundedInteger(value, maximum, fallback) {
  return Number.isSafeInteger(value) && value >= 0 && value <= maximum ? value : fallback;
}

function normalizeFailureCode(value) {
  if (typeof value !== 'string') return '';
  const code = value.trim().slice(0, 96);
  return /^[A-Z0-9_]+$/.test(code) ? code : '';
}

function normalizeBridgeEndpoint(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > MAX_TEXT_LENGTH) return '';
  try {
    const parsed = new URL(value);
    if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) return '';
    const pathname = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/$/, '');
    return `${parsed.origin}${pathname}`;
  } catch {
    return '';
  }
}

function normalizeIdentifier(value, fallback) {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized.slice(0, 128) || fallback;
}

function normalizeIdentifierList(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_COLLECTION_ITEMS)
    .map((item) => normalizeIdentifier(item, ''))
    .filter(Boolean);
}

function normalizeLocalPathList(value) {
  const values = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
  return values.slice(0, MAX_COLLECTION_ITEMS)
    .map(normalizeLocalPath)
    .filter(Boolean);
}

function normalizeLocalPath(value) {
  if (typeof value !== 'string') return '';
  const path = value.trim().slice(0, MAX_TEXT_LENGTH);
  if (!path || /^[a-z][a-z0-9+.-]*:\/\//i.test(path) || /^\\\\/.test(path)) return '';
  return path;
}

function textValue(value, fallback) {
  if (typeof value !== 'string') return fallback;
  const text = value.trim().slice(0, MAX_TEXT_LENGTH);
  return text || fallback;
}

function detailValue(value) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, MAX_DETAIL_LENGTH);
}

function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function proofIsVerified(proof) {
  return Boolean(proof) && proof.state === 'verified';
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

module.exports = {
  COMPLETENESS_INVENTORY_SCHEMA_VERSION,
  DESKTOP_SURFACES,
  LOCAL_BRIDGE_BOUNDARY,
  OPERATION_STATES,
  PROOF_STATES,
  STATUS_HUB_BRIDGE_STATES,
  STATUS_HUB_INBOX_STATES,
  STATUS_SCHEMA_VERSION,
  assessDesktopCompleteness,
  createCompletenessRow,
  createDesktopCompletenessInventory,
  createLocalStatusSnapshot,
  createStatusHubBridgeSnapshot
};
