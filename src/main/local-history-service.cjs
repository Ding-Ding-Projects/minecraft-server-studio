'use strict';

const childProcess = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const HISTORY_SCHEMA_VERSION = 1;
const MAX_JOURNAL_BYTES = 4 * 1024 * 1024;
const MAX_RECORDS = 5_000;
const MAX_EXPORT_RECORDS = 1_000;
const MAX_EXPORT_BYTES = 1 * 1024 * 1024;
const MAX_QUERY_LENGTH = 128;
const MAX_REGEX_LENGTH = 128;
const MAX_TEXT_LENGTH = 320;
const MAX_EXPORTS = 64;

const HISTORY_ACTIONS = Object.freeze([
  'record-created',
  'record-updated',
  'settings-changed',
  'record-deleted',
  'configuration-changed',
  'export-created'
]);

const HISTORY_SUBJECTS = Object.freeze([
  'server',
  'presentation',
  'authenticator',
  'toy-lock',
  'school-mode',
  'status-bridge',
  'history-export'
]);

const EXPORT_FORMATS = Object.freeze({
  json: { extension: 'json', label: 'JSON' },
  jsonl: { extension: 'jsonl', label: 'JSON Lines' },
  yaml: { extension: 'yaml', label: 'YAML' },
  toml: { extension: 'toml', label: 'TOML' },
  csv: { extension: 'csv', label: 'CSV' },
  tsv: { extension: 'tsv', label: 'TSV' },
  markdown: { extension: 'md', label: 'Markdown' }
});

const RESTORE_UNAVAILABLE_DETAIL = 'Restoration is unavailable because this foundation stores redacted append-only event metadata only; it has not created a Git repository or state snapshots.';
const OMITTED_DATA_NOTICE = 'Credentials, passwords, secrets, private-vocabulary content and metadata, TOTP material, raw record payloads, filesystem paths, and restoration snapshots are intentionally omitted.';

function historyError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function isPlainRecord(value) {
  return Boolean(value)
    && typeof value === 'object'
    && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

function boundedText(value, label, maximum = MAX_TEXT_LENGTH) {
  if (typeof value !== 'string') throw historyError('HISTORY_INVALID_VALUE', `${label} must be text.`);
  const normalized = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!normalized) throw historyError('HISTORY_INVALID_VALUE', `${label} cannot be empty.`);
  if (normalized.length > maximum) throw historyError('HISTORY_INVALID_VALUE', `${label} must be ${maximum} characters or fewer.`);
  return normalized;
}

function identifier(value, label) {
  if (typeof value !== 'string') throw historyError('HISTORY_INVALID_VALUE', `${label} must be text.`);
  const normalized = value.trim();
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(normalized)) {
    throw historyError('HISTORY_INVALID_VALUE', `${label} must use only letters, numbers, periods, underscores, or hyphens.`);
  }
  return normalized;
}

function hasSensitiveHistoryText(value) {
  return /\b(?:passwords?|secrets?|tokens?|bearer|authorization|private[ -]?keys?|rcon|credentials?|totp|otpauth|vocabular(?:y|ies))\b/i.test(value)
    || /(?:[a-z]:\\|\\\\|\/home\/|\/users\/|https?:\/\/)/i.test(value);
}

function normalizeAction(value) {
  if (!HISTORY_ACTIONS.includes(value)) throw historyError('HISTORY_INVALID_ACTION', 'The requested history action is not registered.');
  return value;
}

function normalizeSubject(value) {
  if (!HISTORY_SUBJECTS.includes(value)) throw historyError('HISTORY_INVALID_SUBJECT', 'The requested history subject is not registered.');
  return value;
}

function normalizeRecord(value, { existing = false } = {}) {
  if (!isPlainRecord(value)) throw historyError('HISTORY_INVALID_RECORD', 'History records must be plain objects.');
  const allowed = new Set(['version', 'id', 'at', 'action', 'subject', 'subjectId', 'label', 'detail']);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw historyError('HISTORY_INVALID_RECORD', 'History records contain an unsupported field.');
  }
  const label = boundedText(value.label, 'History label', 160);
  const detail = boundedText(value.detail, 'History detail', MAX_TEXT_LENGTH);
  if (hasSensitiveHistoryText(label) || hasSensitiveHistoryText(detail)) {
    throw historyError('HISTORY_SENSITIVE_VALUE', 'History records cannot contain sensitive value labels, secret-related terms, URLs, or filesystem paths.');
  }
  if (existing && value.version !== HISTORY_SCHEMA_VERSION) {
    throw historyError('HISTORY_UNSUPPORTED_VERSION', 'History records use an unsupported schema version.');
  }
  const record = {
    version: HISTORY_SCHEMA_VERSION,
    id: existing ? identifier(value.id, 'History record ID') : crypto.randomUUID(),
    at: existing ? normalizeTimestamp(value.at) : new Date().toISOString(),
    action: normalizeAction(value.action),
    subject: normalizeSubject(value.subject),
    subjectId: identifier(value.subjectId, 'History subject ID'),
    label,
    detail
  };
  return Object.freeze(record);
}

function normalizeTimestamp(value) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw historyError('HISTORY_INVALID_RECORD', 'History records contain an invalid timestamp.');
  }
  return new Date(value).toISOString();
}

function normalizeDate(value, boundary) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw historyError('HISTORY_INVALID_FILTER', `${boundary} date must use YYYY-MM-DD.`);
  }
  const parsed = Date.parse(`${value}T${boundary === 'Start' ? '00:00:00.000' : '23:59:59.999'}Z`);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 10) !== value) {
    throw historyError('HISTORY_INVALID_FILTER', `${boundary} date is invalid.`);
  }
  return parsed;
}

function suspiciousRegex(pattern) {
  return /\((?:[^()\\]|\\.)*[+*](?:[^()\\]|\\.)*\)[+*{]/.test(pattern)
    || /(?:\.\*|\.\+){2,}/.test(pattern)
    || /\{\d{4,}(?:,\d*)?\}/.test(pattern);
}

function normalizeFilters(value = {}) {
  if (!isPlainRecord(value)) throw historyError('HISTORY_INVALID_FILTER', 'History filters must be a plain object.');
  const allowed = new Set(['fromDate', 'toDate', 'action', 'query', 'regex', 'flags', 'limit']);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw historyError('HISTORY_INVALID_FILTER', 'History filters contain an unsupported field.');
  }
  const from = normalizeDate(value.fromDate, 'Start');
  const to = normalizeDate(value.toDate, 'End');
  if (from !== null && to !== null && from > to) throw historyError('HISTORY_INVALID_FILTER', 'Start date must not be after end date.');
  const action = value.action === undefined || value.action === null || value.action === '' ? null : normalizeAction(value.action);
  const query = value.query === undefined || value.query === null ? '' : String(value.query).trim();
  if (query.length > MAX_QUERY_LENGTH) throw historyError('HISTORY_INVALID_FILTER', `Search text must be ${MAX_QUERY_LENGTH} characters or fewer.`);
  const regexEnabled = value.regex === true;
  const flags = value.flags === undefined || value.flags === null ? 'i' : String(value.flags);
  if (!/^[im]{0,2}$/.test(flags) || new Set(flags).size !== flags.length) {
    throw historyError('HISTORY_INVALID_FILTER', 'Only unique i and m regular-expression flags are supported.');
  }
  if (regexEnabled && !query) throw historyError('HISTORY_INVALID_FILTER', 'Enter a regular expression before enabling regex search.');
  if (regexEnabled && query.length > MAX_REGEX_LENGTH) throw historyError('HISTORY_INVALID_FILTER', `Regular expressions must be ${MAX_REGEX_LENGTH} characters or fewer.`);
  if (regexEnabled && suspiciousRegex(query)) {
    throw historyError('HISTORY_INVALID_FILTER', 'This regular expression is rejected because its nested quantifiers could make local history search unresponsive.');
  }
  let matcher = null;
  if (regexEnabled) {
    try {
      matcher = new RegExp(query, flags);
    } catch {
      throw historyError('HISTORY_INVALID_FILTER', 'The regular expression is invalid.');
    }
  }
  const requestedLimit = value.limit === undefined ? 250 : Number(value.limit);
  if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > MAX_RECORDS) {
    throw historyError('HISTORY_INVALID_FILTER', `History result limit must be a whole number from 1 to ${MAX_RECORDS}.`);
  }
  return Object.freeze({
    from,
    to,
    action,
    query,
    regex: regexEnabled,
    flags,
    matcher,
    limit: requestedLimit
  });
}

function recordSearchText(record) {
  return `${record.action} ${record.subject} ${record.subjectId} ${record.label} ${record.detail}`.slice(0, 1_024);
}

function filterRecords(records, filters) {
  return records
    .filter((record) => {
      const at = Date.parse(record.at);
      if (filters.from !== null && at < filters.from) return false;
      if (filters.to !== null && at > filters.to) return false;
      if (filters.action && record.action !== filters.action) return false;
      if (!filters.query) return true;
      const haystack = recordSearchText(record);
      if (filters.matcher) return filters.matcher.test(haystack);
      return haystack.toLocaleLowerCase().includes(filters.query.toLocaleLowerCase());
    })
    .slice(-filters.limit)
    .reverse();
}

function csvCell(value, delimiter) {
  const text = String(value ?? '');
  if (text.includes('"') || text.includes('\n') || text.includes('\r') || text.includes(delimiter)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function yamlText(value) {
  return JSON.stringify(String(value));
}

function tomlText(value) {
  return JSON.stringify(String(value));
}

function exportPayload(records) {
  return {
    schemaVersion: HISTORY_SCHEMA_VERSION,
    kind: 'minecraft-server-studio-redacted-history-export',
    exportedAt: new Date().toISOString(),
    recordCount: records.length,
    omissions: [OMITTED_DATA_NOTICE, RESTORE_UNAVAILABLE_DETAIL],
    records: records.map((record) => copy(record))
  };
}

function renderJsonLines(payload) {
  const metadata = {
    kind: 'minecraft-server-studio-redacted-history-export-metadata',
    schemaVersion: payload.schemaVersion,
    exportedAt: payload.exportedAt,
    recordCount: payload.recordCount,
    omissions: payload.omissions
  };
  return [JSON.stringify(metadata), ...payload.records.map((record) => JSON.stringify(record))].join('\n') + '\n';
}

function renderYaml(payload) {
  const lines = [
    `schemaVersion: ${payload.schemaVersion}`,
    `kind: ${yamlText(payload.kind)}`,
    `exportedAt: ${yamlText(payload.exportedAt)}`,
    `recordCount: ${payload.recordCount}`,
    'omissions:'
  ];
  payload.omissions.forEach((item) => lines.push(`  - ${yamlText(item)}`));
  lines.push('records:');
  payload.records.forEach((record) => {
    lines.push(`  - version: ${record.version}`);
    lines.push(`    id: ${yamlText(record.id)}`);
    lines.push(`    at: ${yamlText(record.at)}`);
    lines.push(`    action: ${yamlText(record.action)}`);
    lines.push(`    subject: ${yamlText(record.subject)}`);
    lines.push(`    subjectId: ${yamlText(record.subjectId)}`);
    lines.push(`    label: ${yamlText(record.label)}`);
    lines.push(`    detail: ${yamlText(record.detail)}`);
  });
  return lines.join('\n') + '\n';
}

function renderToml(payload) {
  const lines = [
    `schema_version = ${payload.schemaVersion}`,
    `kind = ${tomlText(payload.kind)}`,
    `exported_at = ${tomlText(payload.exportedAt)}`,
    `record_count = ${payload.recordCount}`,
    `omissions = [${payload.omissions.map(tomlText).join(', ')}]`
  ];
  payload.records.forEach((record) => {
    lines.push('', '[[records]]');
    lines.push(`version = ${record.version}`);
    lines.push(`id = ${tomlText(record.id)}`);
    lines.push(`at = ${tomlText(record.at)}`);
    lines.push(`action = ${tomlText(record.action)}`);
    lines.push(`subject = ${tomlText(record.subject)}`);
    lines.push(`subject_id = ${tomlText(record.subjectId)}`);
    lines.push(`label = ${tomlText(record.label)}`);
    lines.push(`detail = ${tomlText(record.detail)}`);
  });
  return lines.join('\n') + '\n';
}

function renderDelimited(payload, delimiter) {
  const columns = ['version', 'id', 'at', 'action', 'subject', 'subjectId', 'label', 'detail', 'omissionNotice'];
  const rows = [columns.join(delimiter)];
  payload.records.forEach((record) => {
    rows.push(columns.map((column) => csvCell(column === 'omissionNotice' ? OMITTED_DATA_NOTICE : record[column], delimiter)).join(delimiter));
  });
  if (!payload.records.length) rows.push(columns.map((column) => csvCell(column === 'omissionNotice' ? OMITTED_DATA_NOTICE : '', delimiter)).join(delimiter));
  return rows.join('\r\n') + '\r\n';
}

function renderMarkdown(payload) {
  const lines = [
    '# Redacted local history export',
    '',
    `Generated: ${payload.exportedAt}`,
    '',
    `Records: ${payload.recordCount}`,
    '',
    '> This export intentionally omits credentials, passwords, secrets, private-vocabulary content and metadata, TOTP material, raw record payloads, filesystem paths, and restoration snapshots.',
    '',
    `> ${RESTORE_UNAVAILABLE_DETAIL}`,
    '',
    '| Time | Action | Subject | Label | Detail |',
    '| --- | --- | --- | --- | --- |'
  ];
  payload.records.forEach((record) => {
    const cell = (value) => String(value).replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ');
    lines.push(`| ${cell(record.at)} | ${cell(record.action)} | ${cell(`${record.subject}/${record.subjectId}`)} | ${cell(record.label)} | ${cell(record.detail)} |`);
  });
  if (!payload.records.length) lines.push('| — | — | — | No history records matched the selected filters. | — |');
  return lines.join('\n') + '\n';
}

function renderExport(format, records) {
  const payload = exportPayload(records);
  switch (format) {
    case 'json': return JSON.stringify(payload, null, 2) + '\n';
    case 'jsonl': return renderJsonLines(payload);
    case 'yaml': return renderYaml(payload);
    case 'toml': return renderToml(payload);
    case 'csv': return renderDelimited(payload, ',');
    case 'tsv': return renderDelimited(payload, '\t');
    case 'markdown': return renderMarkdown(payload);
    default: throw historyError('HISTORY_EXPORT_FORMAT', 'The requested export format is unavailable.');
  }
}

function safeExportFileName(value) {
  return typeof value === 'string'
    && /^minecraft-server-studio-history-\d{8}T\d{6}Z-[a-z0-9-]{8,64}\.(?:json|jsonl|yaml|toml|csv|tsv|md)$/i.test(value);
}

function extensionToFormat(fileName) {
  const extension = path.extname(fileName).slice(1).toLowerCase();
  return Object.entries(EXPORT_FORMATS).find(([, definition]) => definition.extension === extension)?.[0] || null;
}

function exportProjection(entry) {
  if (!entry) return null;
  return Object.freeze({
    id: entry.id,
    fileName: entry.fileName,
    format: entry.format,
    createdAt: entry.createdAt,
    bytes: entry.bytes
  });
}

function knownVsCodeCandidates() {
  const candidates = [];
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA;
    const programFiles = process.env.ProgramFiles;
    const programFilesX86 = process.env['ProgramFiles(x86)'];
    if (localAppData) candidates.push(path.join(localAppData, 'Programs', 'Microsoft VS Code', 'Code.exe'));
    if (programFiles) candidates.push(path.join(programFiles, 'Microsoft VS Code', 'Code.exe'));
    if (programFilesX86) candidates.push(path.join(programFilesX86, 'Microsoft VS Code', 'Code.exe'));
    if (localAppData) candidates.push(path.join(localAppData, 'Programs', 'Microsoft VS Code Insiders', 'Code - Insiders.exe'));
    if (programFiles) candidates.push(path.join(programFiles, 'Microsoft VS Code Insiders', 'Code - Insiders.exe'));
    if (programFilesX86) candidates.push(path.join(programFilesX86, 'Microsoft VS Code Insiders', 'Code - Insiders.exe'));
  }
  return candidates;
}

function fileIfRegular(candidate) {
  if (typeof candidate !== 'string' || !candidate || /[\u0000-\u001f\u007f]/.test(candidate)) return null;
  try {
    return fs.statSync(candidate).isFile() ? candidate : null;
  } catch {
    return null;
  }
}

function resolveVsCodeExecutable(candidate) {
  const direct = fileIfRegular(candidate);
  if (!direct) return null;
  if (path.extname(direct).toLowerCase() === '.exe') return direct;
  if (process.platform !== 'win32' || !/\.cmd$/i.test(direct)) return null;
  const programDirectory = path.resolve(path.dirname(direct), '..');
  return fileIfRegular(path.join(programDirectory, 'Code.exe'))
    || fileIfRegular(path.join(programDirectory, 'Code - Insiders.exe'));
}

function findVsCode() {
  for (const candidate of knownVsCodeCandidates()) {
    const executable = resolveVsCodeExecutable(candidate);
    if (executable) return { command: executable, source: 'installed-app' };
  }
  try {
    const commands = process.platform === 'win32' ? ['code', 'code-insiders'] : ['code'];
    for (const command of commands) {
      const lookup = process.platform === 'win32'
        ? childProcess.spawnSync('where.exe', [command], { encoding: 'utf8', windowsHide: true, timeout: 750 })
        : childProcess.spawnSync('which', [command], { encoding: 'utf8', timeout: 750 });
      const first = String(lookup.stdout || '').split(/\r?\n/).map((item) => item.trim()).find(Boolean);
      const executable = lookup.status === 0 ? resolveVsCodeExecutable(first) : null;
      if (executable) return { command: executable, source: 'path' };
    }
  } catch {
    // Detection remains unavailable; opening another editor would be dishonest.
  }
  return null;
}

class LocalHistoryService {
  constructor(options = {}) {
    if (!isPlainRecord(options)) throw historyError('HISTORY_INVALID_OPTIONS', 'Local history options are invalid.');
    const allowed = new Set(['dataDir', 'onChange']);
    for (const key of Object.keys(options)) {
      if (!allowed.has(key)) throw historyError('HISTORY_INVALID_OPTIONS', 'Local history options contain an unsupported field.');
    }
    if (typeof options.dataDir !== 'string' || !path.isAbsolute(options.dataDir)) {
      throw historyError('HISTORY_INVALID_OPTIONS', 'Local history data directory must be absolute.');
    }
    this.dataDir = path.normalize(options.dataDir);
    this.journalPath = path.join(this.dataDir, 'records.jsonl');
    this.exportsDir = path.join(this.dataDir, 'exports');
    this.onChange = typeof options.onChange === 'function' ? options.onChange : null;
    this.records = [];
    this.journalState = 'not-loaded';
    this.journalDetail = 'The local history journal has not been loaded.';
    this.lastExport = null;
  }

  initialize() {
    try {
      fs.mkdirSync(this.dataDir, { recursive: true, mode: 0o700 });
      fs.mkdirSync(this.exportsDir, { recursive: true, mode: 0o700 });
    } catch {
      this.journalState = 'unavailable';
      this.journalDetail = 'The app-private local history directory cannot be accessed.';
      this._emit();
      return this.status();
    }
    this._loadJournal();
    this._discoverLatestExport();
    this._emit();
    return this.status();
  }

  status() {
    const vscode = findVsCode();
    return Object.freeze({
      schemaVersion: HISTORY_SCHEMA_VERSION,
      journal: Object.freeze({
        state: this.journalState,
        detail: this.journalDetail,
        recordCount: this.records.length,
        maximumRecords: MAX_RECORDS,
        maximumBytes: MAX_JOURNAL_BYTES
      }),
      restoration: Object.freeze({
        state: 'unavailable',
        detail: RESTORE_UNAVAILABLE_DETAIL
      }),
      exports: Object.freeze({
        lastExport: exportProjection(this.lastExport),
        formats: Object.freeze(Object.entries(EXPORT_FORMATS).map(([id, definition]) => Object.freeze({ id, label: definition.label }))),
        vscode: Object.freeze(vscode
          ? { state: 'available', detail: 'VS Code is available for a real exported file.' }
          : { state: 'unavailable', detail: 'VS Code was not detected. Create an export first, then install or configure VS Code before using this handoff.' })
      }),
      boundary: OMITTED_DATA_NOTICE
    });
  }

  list(filters = {}) {
    const normalized = normalizeFilters(filters);
    const records = filterRecords(this.records, normalized).map((record) => copy(record));
    return Object.freeze({
      filters: Object.freeze({
        fromDate: normalized.from === null ? '' : new Date(normalized.from).toISOString().slice(0, 10),
        toDate: normalized.to === null ? '' : new Date(normalized.to).toISOString().slice(0, 10),
        action: normalized.action || '',
        query: normalized.query,
        regex: normalized.regex,
        flags: normalized.flags
      }),
      totalRecords: this.records.length,
      matchedRecords: records.length,
      records: Object.freeze(records)
    });
  }

  record(input) {
    if (this.journalState !== 'ready') {
      throw historyError('HISTORY_UNAVAILABLE', 'Local history is unavailable. The requested change was not recorded in history.');
    }
    if (this.records.length >= MAX_RECORDS) {
      this.journalState = 'limit-reached';
      this.journalDetail = `The local history journal reached its ${MAX_RECORDS}-record limit and was preserved without truncation.`;
      this._emit();
      throw historyError('HISTORY_LIMIT_REACHED', 'Local history reached its record limit. The requested change was not recorded in history.');
    }
    const record = normalizeRecord(input);
    const line = `${JSON.stringify(record)}\n`;
    const bytes = Buffer.byteLength(line, 'utf8');
    try {
      const currentBytes = fs.statSync(this.journalPath).size;
      if (currentBytes + bytes > MAX_JOURNAL_BYTES) {
        this.journalState = 'limit-reached';
        this.journalDetail = `The local history journal reached its ${MAX_JOURNAL_BYTES}-byte limit and was preserved without truncation.`;
        this._emit();
        throw historyError('HISTORY_LIMIT_REACHED', 'Local history reached its storage limit. The requested change was not recorded in history.');
      }
      const descriptor = fs.openSync(this.journalPath, 'a', 0o600);
      try {
        fs.writeFileSync(descriptor, line, 'utf8');
        fs.fsyncSync(descriptor);
      } finally {
        fs.closeSync(descriptor);
      }
      this.records.push(record);
      this.journalDetail = 'Redacted append-only local history metadata is available.';
      this._emit();
      return Object.freeze(copy(record));
    } catch (error) {
      if (error?.code === 'HISTORY_LIMIT_REACHED') throw error;
      this.journalState = 'unavailable';
      this.journalDetail = 'The app-private local history journal could not be appended. Existing records were preserved.';
      this._emit();
      throw historyError('HISTORY_WRITE_FAILED', 'Local history could not be appended. The requested change was not recorded in history.');
    }
  }

  export(input = {}) {
    if (!isPlainRecord(input)) throw historyError('HISTORY_INVALID_EXPORT', 'Export options must be a plain object.');
    const allowed = new Set(['format', 'filters']);
    for (const key of Object.keys(input)) {
      if (!allowed.has(key)) throw historyError('HISTORY_INVALID_EXPORT', 'Export options contain an unsupported field.');
    }
    const format = String(input.format || '').toLowerCase();
    const definition = EXPORT_FORMATS[format];
    if (!definition) throw historyError('HISTORY_EXPORT_FORMAT', 'Choose an available export format.');
    const filtered = this.list({ ...(input.filters || {}), limit: MAX_RECORDS });
    if (filtered.matchedRecords > MAX_EXPORT_RECORDS) {
      throw historyError('HISTORY_EXPORT_LIMIT', `The selected export has more than ${MAX_EXPORT_RECORDS} matching records. Narrow the date, action, or search filter before exporting.`);
    }
    const content = renderExport(format, filtered.records);
    const bytes = Buffer.byteLength(content, 'utf8');
    if (bytes > MAX_EXPORT_BYTES) throw historyError('HISTORY_EXPORT_LIMIT', 'The selected export exceeds the local safety size limit. Narrow the date, action, or search filter.');
    try {
      fs.mkdirSync(this.exportsDir, { recursive: true, mode: 0o700 });
      const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
      const suffix = crypto.randomUUID();
      const fileName = `minecraft-server-studio-history-${stamp}-${suffix}.${definition.extension}`;
      const destination = path.join(this.exportsDir, fileName);
      const temporary = `${destination}.${process.pid}.${crypto.randomBytes(8).toString('hex')}.tmp`;
      const descriptor = fs.openSync(temporary, 'wx', 0o600);
      try {
        fs.writeFileSync(descriptor, content, 'utf8');
        fs.fsyncSync(descriptor);
      } finally {
        fs.closeSync(descriptor);
      }
      fs.renameSync(temporary, destination);
      const exportRecord = {
        id: fileName,
        fileName,
        format,
        createdAt: new Date().toISOString(),
        bytes
      };
      const previousExport = this.lastExport;
      this.lastExport = exportRecord;
      try {
        this.record({
          action: 'export-created',
          subject: 'history-export',
          subjectId: fileName.replace(/[^A-Za-z0-9._-]/g, '-').slice(0, 128),
          label: 'Redacted history export created',
          detail: 'A bounded export of redacted local history metadata was created in the app-private export area.'
        });
      } catch (error) {
        this.lastExport = previousExport;
        try {
          fs.unlinkSync(destination);
        } catch {
          // The visibility state stays failed; an inaccessible output is never claimed as available.
        }
        throw error;
      }
      this._emit();
      return exportProjection(exportRecord);
    } catch (error) {
      if (error?.code === 'HISTORY_LIMIT_REACHED') throw error;
      if (error?.code?.startsWith('HISTORY_')) throw error;
      throw historyError('HISTORY_EXPORT_FAILED', 'The local history export could not be written atomically.');
    }
  }

  async openInVsCode(exportId) {
    const exportRecord = this._findExport(exportId);
    if (!exportRecord) throw historyError('HISTORY_EXPORT_MISSING', 'Create a local history export before opening it in VS Code.');
    const destination = this._exportPath(exportRecord.fileName);
    try {
      if (!fs.statSync(destination).isFile()) throw new Error('not-file');
    } catch {
      throw historyError('HISTORY_EXPORT_MISSING', 'The selected export no longer exists in the app-private export area.');
    }
    const vscode = findVsCode();
    if (!vscode) throw historyError('HISTORY_VSCODE_UNAVAILABLE', 'VS Code was not detected. Install or configure VS Code before opening this export.');
    return new Promise((resolve, reject) => {
      let processHandle;
      try {
        processHandle = childProcess.spawn(vscode.command, [destination], {
          detached: true,
          stdio: 'ignore',
          windowsHide: true
        });
      } catch {
        reject(historyError('HISTORY_VSCODE_OPEN_FAILED', 'VS Code could not be started for the selected exported file.'));
        return;
      }
      processHandle.once('error', () => reject(historyError('HISTORY_VSCODE_OPEN_FAILED', 'VS Code could not be started for the selected exported file.')));
      processHandle.once('spawn', () => {
        processHandle.unref();
        resolve(Object.freeze({ opened: true, fileName: exportRecord.fileName }));
      });
    });
  }

  _loadJournal() {
    try {
      if (!fs.existsSync(this.journalPath)) {
        const descriptor = fs.openSync(this.journalPath, 'wx', 0o600);
        fs.closeSync(descriptor);
      }
      const stat = fs.statSync(this.journalPath);
      if (!stat.isFile() || stat.size > MAX_JOURNAL_BYTES) {
        this.journalState = stat.size > MAX_JOURNAL_BYTES ? 'limit-reached' : 'invalid';
        this.journalDetail = stat.size > MAX_JOURNAL_BYTES
          ? `The existing local history journal exceeds its ${MAX_JOURNAL_BYTES}-byte limit and was preserved without truncation.`
          : 'The local history journal is not a regular file and was preserved without replacement.';
        this.records = [];
        return;
      }
      const text = fs.readFileSync(this.journalPath, 'utf8');
      const lines = text ? text.split(/\r?\n/).filter(Boolean) : [];
      if (lines.length > MAX_RECORDS) {
        this.journalState = 'limit-reached';
        this.journalDetail = `The existing local history journal exceeds its ${MAX_RECORDS}-record limit and was preserved without truncation.`;
        this.records = [];
        return;
      }
      this.records = lines.map((line) => normalizeRecord(JSON.parse(line), { existing: true }));
      this.journalState = 'ready';
      this.journalDetail = this.records.length
        ? 'Redacted append-only local history metadata is available.'
        : 'The app-private local history journal is ready. No mutation record has been appended yet.';
    } catch {
      this.records = [];
      this.journalState = 'invalid';
      this.journalDetail = 'The existing local history journal is invalid and was preserved without automatic repair.';
    }
  }

  _discoverLatestExport() {
    try {
      const candidates = fs.readdirSync(this.exportsDir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && safeExportFileName(entry.name))
        .map((entry) => {
          const stat = fs.statSync(path.join(this.exportsDir, entry.name));
          return {
            id: entry.name,
            fileName: entry.name,
            format: extensionToFormat(entry.name),
            createdAt: stat.mtime.toISOString(),
            bytes: stat.size
          };
        })
        .filter((entry) => entry.format && entry.bytes > 0 && entry.bytes <= MAX_EXPORT_BYTES)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .slice(0, MAX_EXPORTS);
      this.lastExport = candidates[0] || null;
    } catch {
      this.lastExport = null;
    }
  }

  _findExport(exportId) {
    if (exportId !== undefined && exportId !== null) {
      if (typeof exportId !== 'string' || !safeExportFileName(exportId)) return null;
      const format = extensionToFormat(exportId);
      if (!format) return null;
      try {
        const stat = fs.statSync(this._exportPath(exportId));
        if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_EXPORT_BYTES) return null;
        return { id: exportId, fileName: exportId, format, createdAt: stat.mtime.toISOString(), bytes: stat.size };
      } catch {
        return null;
      }
    }
    return this.lastExport ? copy(this.lastExport) : null;
  }

  _exportPath(fileName) {
    if (!safeExportFileName(fileName)) throw historyError('HISTORY_EXPORT_MISSING', 'The export name is invalid.');
    const destination = path.resolve(this.exportsDir, fileName);
    const root = path.resolve(this.exportsDir) + path.sep;
    if (!destination.startsWith(root)) throw historyError('HISTORY_EXPORT_MISSING', 'The export path is outside the app-private export area.');
    return destination;
  }

  _emit() {
    if (!this.onChange) return;
    try {
      this.onChange(this.status());
    } catch {
      // A renderer notification must not alter local history state.
    }
  }
}

module.exports = {
  EXPORT_FORMATS,
  HISTORY_ACTIONS,
  HISTORY_SCHEMA_VERSION,
  HISTORY_SUBJECTS,
  LocalHistoryService,
  OMITTED_DATA_NOTICE,
  RESTORE_UNAVAILABLE_DETAIL
};
