'use strict';

/**
 * Fixed-source offline changelog library.
 *
 * The desktop reads only the CHANGELOG.md bundled with the installed
 * application. It neither calls a release API nor accepts a renderer-supplied
 * path, URL, Markdown document, or release identifier.
 */

const fs = require('node:fs/promises');
const path = require('node:path');

const CHANGELOG_SCHEMA_VERSION = 1;
const MAX_CHANGELOG_BYTES = 512 * 1024;
const MAX_RELEASE_CATALOG_BYTES = 256 * 1024;
const MAX_RECORDS = 128;
const MAX_CATEGORIES_PER_RECORD = 24;
const MAX_CHANGES_PER_CATEGORY = 128;
const MAX_VERSION_LENGTH = 96;
const MAX_DATE_LABEL_LENGTH = 96;
const MAX_CATEGORY_LENGTH = 96;
const MAX_CHANGE_LENGTH = 1_024;
const MAX_EXPORT_BYTES = 2 * 1024 * 1024;
const CANONICAL_COMMIT_BASE_URL = 'https://github.com/Ding-Ding-Projects/minecraft-server-studio/commit/';

class LocalChangelogLibrary {
  constructor({ appPath, dialog, downloadsPath }) {
    if (typeof appPath !== 'string' || !appPath.trim()) throw new Error('The application path is required to load the bundled changelog.');
    if (!dialog || typeof dialog.showSaveDialog !== 'function') throw new Error('The native save dialog is required for changelog export.');
    if (typeof downloadsPath !== 'string' || !downloadsPath.trim()) throw new Error('The downloads directory is required for changelog export.');
    this.appPath = path.resolve(appPath);
    this.changelogPath = path.resolve(this.appPath, 'CHANGELOG.md');
    this.generatedCatalogPath = path.resolve(this.appPath, 'src', 'main', 'release-catalog.generated.json');
    this.fallbackCatalogPath = path.resolve(this.appPath, 'src', 'main', 'release-catalog.json');
    this.dialog = dialog;
    this.downloadsPath = path.resolve(downloadsPath);
  }

  async list() {
    return this.#load();
  }

  async export(request) {
    const format = normalizeExportFormat(request?.format);
    const ids = normalizeRecordIds(request?.ids);
    const snapshot = await this.#load();
    if (snapshot.state !== 'ready') throw new Error(snapshot.boundary || 'The bundled changelog is unavailable, so no export was created.');
    const selected = snapshot.records.filter((record) => ids.includes(record.id));
    if (!selected.length) throw new Error('There are no currently filtered bundled changelog records to export.');
    const output = serializeChangelogExport(selected, format);
    if (Buffer.byteLength(output, 'utf8') > MAX_EXPORT_BYTES) throw new Error('The selected changelog export exceeds the permitted local size.');
    const extension = format === 'markdown' ? 'md' : 'txt';
    const safeVersion = filenamePart(selected[0]?.version || 'filtered');
    const response = await this.dialog.showSaveDialog({
      title: 'Export filtered changelog',
      defaultPath: path.join(this.downloadsPath, `minecraft-server-studio-changelog-${safeVersion}.${extension}`),
      filters: [
        format === 'markdown'
          ? { name: 'Markdown', extensions: ['md'] }
          : { name: 'Plain text', extensions: ['txt'] }
      ]
    });
    if (response.canceled || !response.filePath) {
      return Object.freeze({ state: 'cancelled', format, recordCount: selected.length, boundary: 'No export file was written because the native save dialog was cancelled.' });
    }
    const destination = path.resolve(response.filePath);
    const temporary = `${destination}.tmp-${process.pid}-${Date.now()}`;
    try {
      await fs.writeFile(temporary, output, { encoding: 'utf8', flag: 'wx' });
      await fs.rename(temporary, destination);
    } catch (error) {
      await fs.rm(temporary, { force: true }).catch(() => {});
      throw new Error(`The selected changelog export could not be written: ${safeErrorDetail(error)}`);
    }
    return Object.freeze({
      state: 'saved',
      format,
      recordCount: selected.length,
      fileName: path.basename(destination).slice(0, 180),
      boundary: 'The selected bundled changelog records were exported locally. The export does not fetch release data.'
    });
  }

  async #load() {
    try {
      const [markdown, releaseCatalog] = await Promise.all([
        readBoundedRegularText(this.changelogPath, MAX_CHANGELOG_BYTES, 'The bundled changelog'),
        this.#readReleaseCatalog()
      ]);
      const records = mergeRecords([
        ...parseChangelog(markdown),
        ...releaseRecordsFromCatalog(releaseCatalog.records)
      ]);
      return Object.freeze({
        schemaVersion: CHANGELOG_SCHEMA_VERSION,
        kind: 'minecraft-server-studio-offline-changelog',
        state: records.length ? 'ready' : 'empty',
        source: 'bundled-changelog-and-release-catalog',
        records,
        boundary: records.length
          ? `This viewer reads this installed app's bundled CHANGELOG.md and ${releaseCatalog.sourceLabel}. It does not fetch releases, tags, dates, commit links, or notes from a network service.`
          : 'The bundled changelog and local release catalog have no recorded version entries. This viewer does not fetch a replacement from the network.'
      });
    } catch (error) {
      return Object.freeze({
        schemaVersion: CHANGELOG_SCHEMA_VERSION,
        kind: 'minecraft-server-studio-offline-changelog',
        state: 'unavailable',
        source: 'bundled-changelog-and-release-catalog',
        records: Object.freeze([]),
        boundary: `The bundled changelog is unavailable: ${safeErrorDetail(error)} The viewer will not fetch a replacement from the network.`
      });
    }
  }

  async #readReleaseCatalog() {
    let catalogPath = this.generatedCatalogPath;
    let sourceLabel = 'a package-generated local Git-tag metadata snapshot';
    try {
      await fs.lstat(catalogPath);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      catalogPath = this.fallbackCatalogPath;
      sourceLabel = 'the checked-in local Git-tag metadata baseline';
    }
    const raw = await readBoundedRegularText(catalogPath, MAX_RELEASE_CATALOG_BYTES, 'The bundled release catalog');
    let value;
    try {
      value = JSON.parse(raw);
    } catch {
      throw new Error('The bundled release catalog is not valid JSON.');
    }
    return Object.freeze({ records: validateReleaseCatalog(value), sourceLabel });
  }
}

async function readBoundedRegularText(filePath, maximumBytes, label) {
  const stat = await fs.lstat(filePath);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${label} is not a regular file.`);
  if (stat.size < 1 || stat.size > maximumBytes) throw new Error(`${label} exceeds the permitted size.`);
  const value = await fs.readFile(filePath, 'utf8');
  if (!value.trim() || value.includes('\u0000') || Buffer.byteLength(value, 'utf8') > maximumBytes) {
    throw new Error(`${label} is empty, malformed, or too large.`);
  }
  return value;
}

function validateReleaseCatalog(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.schemaVersion !== 1 || !Array.isArray(value.records)) {
    throw new Error('The bundled release catalog has an unsupported schema.');
  }
  if (value.records.length > MAX_RECORDS) throw new Error('The bundled release catalog has too many records.');
  const tags = new Set();
  const records = value.records.map((record) => {
    if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error('The bundled release catalog contains an invalid record.');
    const tag = typeof record.tag === 'string' ? record.tag.trim() : '';
    const date = typeof record.date === 'string' ? record.date.trim() : '';
    const commit = typeof record.commit === 'string' ? record.commit.trim().toLowerCase() : '';
    if (!/^v\d+\.\d+\.\d+-build\.\d+\.\d+$/.test(tag) || !parseRecordedDate(date) || !/^[a-f0-9]{40}$/.test(commit) || tags.has(tag)) {
      throw new Error('The bundled release catalog contains invalid or duplicate release metadata.');
    }
    tags.add(tag);
    return Object.freeze({ tag, date, commit });
  });
  return Object.freeze(records);
}

function releaseRecordsFromCatalog(records) {
  return [...records]
    .sort((left, right) => compareReleaseTags(right.tag, left.tag))
    .map((record) => ({
      version: record.tag,
      dateLabel: record.date,
      dateIso: record.date,
      categories: [{
        title: 'Release metadata',
        changes: ['No categorized changelog notes are recorded for this release in the bundled local catalog.']
      }],
      commit: parseCommitReference(record.commit)
    }));
}

function compareReleaseTags(left, right) {
  const pattern = /^v\d+\.\d+\.\d+-build\.(\d+)\.(\d+)$/;
  const leftMatch = String(left).match(pattern);
  const rightMatch = String(right).match(pattern);
  const leftRun = Number(leftMatch?.[1] || 0);
  const rightRun = Number(rightMatch?.[1] || 0);
  const leftAttempt = Number(leftMatch?.[2] || 0);
  const rightAttempt = Number(rightMatch?.[2] || 0);
  return leftRun - rightRun || leftAttempt - rightAttempt || String(left).localeCompare(String(right));
}

function mergeRecords(records) {
  const seenVersions = new Set();
  const unique = [];
  for (const record of records) {
    const version = String(record?.version || '').trim();
    if (!version || seenVersions.has(version.toLocaleLowerCase())) continue;
    seenVersions.add(version.toLocaleLowerCase());
    unique.push(record);
    if (unique.length >= MAX_RECORDS) break;
  }
  return Object.freeze(unique.map((record, index) => freezeRecord(record, index + 1)));
}

function parseChangelog(markdown) {
  const lines = String(markdown).replace(/\r\n?/g, '\n').split('\n');
  const entries = [];
  let current = null;
  let currentCategory = null;
  for (const line of lines) {
    const versionHeading = line.match(/^##\s+(.+?)\s*$/);
    if (versionHeading) {
      if (entries.length >= MAX_RECORDS) break;
      current = createRecord(versionHeading[1], entries.length + 1);
      currentCategory = null;
      if (current) entries.push(current);
      continue;
    }
    if (!current) continue;
    const categoryHeading = line.match(/^###\s+(.+?)\s*$/);
    if (categoryHeading) {
      if (current.categories.length >= MAX_CATEGORIES_PER_RECORD) {
        currentCategory = null;
        continue;
      }
      currentCategory = createCategory(categoryHeading[1]);
      current.categories.push(currentCategory);
      continue;
    }
    const commit = line.match(/^Commit\s+link\s*:\s*(.*?)\s*$/i);
    if (commit) {
      current.commit = parseCommitReference(commit[1]);
      continue;
    }
    const change = line.match(/^\s*[-*+]\s+(.+?)\s*$/);
    if (change) {
      if (!currentCategory) {
        currentCategory = createCategory('Changes');
        current.categories.push(currentCategory);
      }
      if (currentCategory.changes.length < MAX_CHANGES_PER_CATEGORY) {
        const text = plainMarkdownText(change[1]).slice(0, MAX_CHANGE_LENGTH);
        if (text) currentCategory.changes.push(text);
      }
    }
  }
  return Object.freeze(entries.map((entry, index) => freezeRecord(entry, index + 1)));
}

function createRecord(heading, ordinal) {
  const normalized = String(heading || '').replace(/\s+/g, ' ').trim();
  if (!normalized || normalized.length > MAX_VERSION_LENGTH + MAX_DATE_LABEL_LENGTH + 8) return null;
  const match = normalized.match(/^(.+?)\s*(?:—|-)\s*(.+)$/);
  const version = (match?.[1] || normalized).trim().slice(0, MAX_VERSION_LENGTH);
  const dateLabel = (match?.[2] || 'Date not recorded').trim().slice(0, MAX_DATE_LABEL_LENGTH) || 'Date not recorded';
  if (!version) return null;
  return {
    id: recordId(version, ordinal),
    version,
    dateLabel,
    dateIso: parseRecordedDate(dateLabel),
    categories: [],
    commit: { state: 'missing', sha: '', url: '', detail: 'No commit link is recorded in the bundled changelog.' }
  };
}

function createCategory(value) {
  const title = plainMarkdownText(value).slice(0, MAX_CATEGORY_LENGTH) || 'Changes';
  return { title, changes: [] };
}

function freezeRecord(record, ordinal) {
  const categories = record.categories
    .filter((category) => category?.changes?.length)
    .slice(0, MAX_CATEGORIES_PER_RECORD)
    .map((category) => Object.freeze({
      title: String(category.title || 'Changes').slice(0, MAX_CATEGORY_LENGTH),
      changes: Object.freeze(category.changes.slice(0, MAX_CHANGES_PER_CATEGORY).map((change) => String(change).slice(0, MAX_CHANGE_LENGTH)))
    }));
  return Object.freeze({
    id: recordId(record.version, ordinal),
    version: String(record.version).slice(0, MAX_VERSION_LENGTH),
    dateLabel: String(record.dateLabel || 'Date not recorded').slice(0, MAX_DATE_LABEL_LENGTH),
    dateIso: typeof record.dateIso === 'string' ? record.dateIso : '',
    categories: Object.freeze(categories),
    commit: Object.freeze({
      state: record.commit?.state === 'recorded' ? 'recorded' : 'missing',
      sha: typeof record.commit?.sha === 'string' ? record.commit.sha : '',
      url: typeof record.commit?.url === 'string' ? record.commit.url : '',
      detail: typeof record.commit?.detail === 'string' ? record.commit.detail.slice(0, 180) : 'No commit link is recorded in the bundled changelog.'
    })
  });
}

function parseCommitReference(value) {
  const source = String(value || '').trim();
  const sha = source.match(/\b([a-f0-9]{7,40})\b/i)?.[1]?.toLowerCase() || '';
  if (!sha) {
    return { state: 'missing', sha: '', url: '', detail: source ? 'The bundled changelog does not contain a valid commit SHA for this record.' : 'No commit link is recorded in the bundled changelog.' };
  }
  return { state: 'recorded', sha, url: `${CANONICAL_COMMIT_BASE_URL}${sha}`, detail: 'The bundled changelog records this commit SHA. Opening it is an explicit external action.' };
}

function parseRecordedDate(value) {
  const match = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? `${match[1]}-${match[2]}-${match[3]}` : '';
}

function normalizeExportFormat(value) {
  if (value === 'markdown' || value === 'text') return value;
  throw new Error('Choose Markdown or plain text for the changelog export.');
}

function normalizeRecordIds(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_RECORDS) throw new Error('Choose one or more currently filtered changelog records to export.');
  const ids = [...new Set(value.map((id) => String(id || '').trim()))];
  if (ids.length < 1 || ids.some((id) => !/^[a-z0-9][a-z0-9._-]{0,127}$/i.test(id))) {
    throw new Error('The selected changelog records are invalid. Refresh the local changelog and try again.');
  }
  return ids;
}

function serializeChangelogExport(records, format) {
  const lines = format === 'markdown'
    ? ['# Minecraft Server Studio changelog export', '', 'Source: bundled local changelog', `Records: ${records.length}`, '']
    : ['Minecraft Server Studio changelog export', 'Source: bundled local changelog', `Records: ${records.length}`, ''];
  for (const record of records) {
    lines.push(format === 'markdown' ? `## ${record.version} — ${record.dateLabel}` : `${record.version} — ${record.dateLabel}`);
    for (const category of record.categories) {
      lines.push(format === 'markdown' ? `### ${category.title}` : category.title);
      for (const change of category.changes) lines.push(format === 'markdown' ? `- ${change}` : `- ${change}`);
      lines.push('');
    }
    lines.push(record.commit.state === 'recorded'
      ? `Commit link: ${record.commit.url}`
      : 'Commit link: not recorded in the bundled changelog.');
    lines.push('');
  }
  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}

function recordId(version, ordinal) {
  const normalized = String(version || '').toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 108) || 'record';
  return `${normalized}-${ordinal}`;
}

function filenamePart(value) {
  return String(value || 'filtered').replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 72) || 'filtered';
}

function plainMarkdownText(value) {
  return String(value || '')
    .replace(/!?(?:\[[^\]]*\])\([^)]*\)/g, (match) => match.replace(/^!?(?:\[([^\]]*)\])\([^)]*\)$/, '$1'))
    .replace(/[`*_~>#]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function safeErrorDetail(error) {
  const message = typeof error?.message === 'string' ? error.message : 'The requested local operation failed.';
  return message.replace(/[\r\n]+/g, ' ').slice(0, 180);
}

async function verifyOfflineChangelogBundle({ appPath = process.cwd() } = {}) {
  const library = new LocalChangelogLibrary({
    appPath,
    downloadsPath: appPath,
    dialog: { showSaveDialog: async () => ({ canceled: true }) }
  });
  const snapshot = await library.list();
  if (snapshot.state !== 'ready' || !snapshot.records.length) {
    throw new Error(`Offline changelog bundle is unavailable: ${snapshot.boundary || 'no version records were found'}`);
  }
  return snapshot;
}

module.exports = {
  CANONICAL_COMMIT_BASE_URL,
  CHANGELOG_SCHEMA_VERSION,
  LocalChangelogLibrary,
  MAX_CHANGELOG_BYTES,
  MAX_EXPORT_BYTES,
  MAX_RECORDS,
  parseChangelog,
  verifyOfflineChangelogBundle
};
