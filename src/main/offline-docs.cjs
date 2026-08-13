'use strict';

/**
 * Offline feature-documentation library.
 *
 * Documentation is deliberately loaded only from the app's packaged
 * docs/features directory. Callers select a fixed inventory identifier; they
 * can never provide a filesystem path, URL, or arbitrary Markdown source.
 * The renderer receives plain Markdown through a narrow IPC boundary and must
 * render it with its isolated, escaping renderer.
 */

const fs = require('node:fs/promises');
const path = require('node:path');

const OFFLINE_DOCUMENTATION_SCHEMA_VERSION = 1;
// Keep a finite catalog ceiling while leaving deliberate space for future
// feature articles. The inventory is still exact and rejects duplicate or
// unregistered documents; this is capacity, not discovery-by-directory.
const MAX_DOCUMENT_COUNT = 96;
const MAX_DOCUMENT_BYTES = 512 * 1024;
const MAX_TOTAL_DOCUMENT_BYTES = 3 * 1024 * 1024;
const MAX_DOCUMENT_ID_LENGTH = 96;
const MAX_TITLE_LENGTH = 180;
const MAX_SUMMARY_LENGTH = 360;
const MAX_SEARCH_TEXT_LENGTH = 16 * 1024;

const OFFLINE_DOCUMENTATION_INVENTORY = Object.freeze([
  entry('feature-documentation', 'README.md', 'Feature documentation', 'Browse every bundled feature article.'),
  entry('server-orchestration', 'server-orchestration.md', 'Server orchestration', 'Create, configure, and operate local Paper or Spigot servers.'),
  entry('server-access-records', 'server-access-records.md', 'Local server access records', 'Inspect and manage only validated local operators, allowlist, player-ban, and IP-ban records for a controlled server root.'),
  entry('configuration-and-plugin-safety', 'configuration-and-plugin-safety.md', 'Configuration and plugin safety', 'Preserve server configuration and safely stage local plugin JARs.'),
  entry('dependency-bootstrap', 'dependency-bootstrap.md', 'Automatic dependency bootstrap', 'Detect and install required Java and Git tooling.'),
  entry('java-runtime-and-launch', 'java-runtime-and-launch.md', 'Version-aware Java runtime and launch profiles', 'Select compatible Java runtimes and launch profiles.'),
  entry('paper-jar-cli-controls', 'paper-jar-cli-controls.md', 'Paper JAR CLI controls', 'Build a bounded direct-argv Paper profile with typed controls.'),
  entry('spigot-buildtools', 'spigot-buildtools.md', 'Spigot BuildTools adapter', 'Prepare and run the isolated Spigot BuildTools flow.'),
  entry('buildtools-orchestration', 'buildtools-orchestration.md', 'BuildTools plan-only orchestration', 'Preview a controlled BuildTools plan without starting a process.'),
  entry('backups-and-paper-updates', 'backups-and-paper-updates.md', 'Backups and Paper updates', 'Create local snapshots and stage Paper updates.'),
  entry('command-center', 'command-center.md', 'Command Center registry', 'Use structured Minecraft command families and evidence.'),
  entry('rcon-response-safety', 'rcon-response-safety.md', 'RCON response safety', 'Bound and redact renderer-visible RCON output.'),
  entry('experience-settings', 'experience-settings.md', 'Presentation settings and shared School mode', 'Set presentation preferences and the shared mode boundary.'),
  entry('app-logo-customization', 'app-logo-customization.md', 'App-logo customization', 'Choose a shipped mark or a bounded private local image without changing installed identity.'),
  entry('narrator-and-scheduled-settings', 'narrator-and-scheduled-settings.md', 'Event narrator and scheduled language settings', 'Configure local platform narration and bounded local-time language schedules.'),
  entry('cli-rcon-gateway', 'cli-rcon-gateway.md', 'CLI RCON gateway', 'Use the protected one-shot CLI route for RCON commands.'),
  entry('local-ollama-suite', 'local-ollama-suite.md', 'Local Ollama suite foundation', 'Inspect the bounded fixed-loopback local service inventory.'),
  entry('browser-local-ollama-observer', 'browser-local-ollama-observer.md', 'Browser-local Ollama observer', 'Visitor-triggered browser-only observation of the fixed local Ollama API with bounded data handling and no remote-control bridge.'),
  entry('browser-local-file-converter', 'browser-local-file-converter.md', 'Browser-local companion-site file converter', 'Use bounded in-browser text, structured-data, and binary-encoding transformations without a desktop or server bridge.'),
  entry('browser-local-history-and-safe-exports', 'browser-local-history-and-safe-exports.md', 'Browser-local history and safe exports', 'Review bounded non-secret companion-site action metadata and export selected records without a desktop or server bridge.'),
  entry('browser-local-notifications-and-confirmation', 'browser-local-notifications-and-confirmation.md', 'Browser-local notification center and destructive confirmation', 'Read local page notices and the bounded two-key plus slider notification-metadata clear boundary.'),
  entry('browser-local-installer-download-handoff', 'browser-local-installer-download-handoff.md', 'Browser-local installer download handoff', 'Open a bounded browser handoff for one verified immutable installer asset without a desktop or browser bridge.'),
  entry('unsigned-automatic-updates', 'unsigned-automatic-updates.md', 'Unsigned automatic updates', 'Understand the fixed Squirrel update feed and restart choice.'),
  entry('release-packaging', 'release-packaging.md', 'Windows release packaging metadata', 'Understand public dim-sum code-name metadata and its no-copy release boundary.'),
  entry('file-converter', 'file-converter.md', 'Local app-owned file converter', 'Convert bounded local text, structured data, or bytes through verified in-process routes while unavailable formats remain visible.'),
  entry('authenticator-and-toy-locks', 'authenticator-and-toy-locks.md', 'Local authenticator and toy-lock foundation', 'Manage local RFC 6238 codes, explicit QR/manual pairing confirmation, and independently credentialed toy-lock records.'),
  entry('support-tickets', 'support-tickets.md', 'Local Support Tickets', 'Open a fictional local recovery ticket and reveal the application-data folder yourself.'),
  entry('browser-local-authenticator-and-toy-locks', 'browser-local-authenticator-and-toy-locks.md', 'Browser-local authenticator, toy locks, and recovery', 'Use the public page’s bounded local TOTP, toy-lock, QR, and recovery foundation.'),
  entry('appearance-and-tabs', 'appearance-and-tabs.md', 'Appearance and tab-navigation foundation', 'Minecraft Server Studio now has a bounded, local desktop appearance and tab-navigation foundation.'),
  entry('site-logo-customization', 'site-logo-customization.md', 'Browser-local companion-site logo customization', 'Choose a shipped browser-rendered mark or a bounded local PNG/JPEG display representation for the companion site.'),
  entry('desktop-command-palette', 'desktop-command-palette.md', 'Desktop command palette foundation', 'Find real local renderer destinations and non-secret controls with Ctrl+Shift+F.'),
  entry('desktop-tab-workspace', 'desktop-tab-workspace.md', 'Desktop tab workspace', 'Manage the current window\'s server-settings tabs with local persistence, search, grouping, pinning, and protected bulk-close boundaries.'),
  entry('local-status-and-completeness', 'local-status-and-completeness.md', 'Local status and desktop completeness', 'Read the local status surface and evidence inventory.'),
  entry('local-history-and-safe-exports', 'local-history-and-safe-exports.md', 'Local history and safe exports', 'Browse bounded redacted event metadata and create safe structured exports.'),
  entry('desktop-notifications-and-destructive-confirmation', 'desktop-notifications-and-destructive-confirmation.md', 'Desktop notifications and destructive confirmation', 'Review bounded local notification history and the two-control, full-slider destructive-action decision boundary.'),
  entry('external-editor-integration', 'external-editor-integration.md', 'External editor integration', 'Choose a validated local editor and open a selected server root or safe app-private record.'),
  entry('changelog-viewer', 'changelog-viewer.md', 'Offline changelog viewer', 'Browse bundled version records, filter them locally, and copy or export the current view.'),
  entry('shared-status-hub-bridge', 'shared-status-hub-bridge.md', 'Shared Status Hub bridge', 'Understand the optional external bridge and local fallback.'),
  entry('offline-documentation-browser', 'offline-documentation-browser.md', 'Offline documentation browser', 'Browse bundled feature documentation without a network request.')
]);

const INVENTORY_BY_ID = new Map(OFFLINE_DOCUMENTATION_INVENTORY.map((record) => [record.id, record]));
const INVENTORY_BY_FILE = new Map(OFFLINE_DOCUMENTATION_INVENTORY.map((record) => [record.fileName, record]));

function entry(id, fileName, title, summary) {
  const record = Object.freeze({ id, fileName, title, summary });
  validateInventoryRecord(record);
  return record;
}

function validateInventoryRecord(record) {
  if (!record || typeof record !== 'object') throw new Error('Offline documentation inventory records must be objects.');
  if (!/^[a-z0-9][a-z0-9-]{0,95}$/.test(record.id)) throw new Error(`Offline documentation inventory has an invalid identifier: ${String(record.id)}.`);
  if (!/^(README|[a-z0-9][a-z0-9-]*)\.md$/.test(record.fileName)) throw new Error(`Offline documentation inventory has an invalid filename: ${String(record.fileName)}.`);
  if (typeof record.title !== 'string' || !record.title.trim() || record.title.length > MAX_TITLE_LENGTH) throw new Error(`Offline documentation inventory has an invalid title for '${record.id}'.`);
  if (typeof record.summary !== 'string' || !record.summary.trim() || record.summary.length > MAX_SUMMARY_LENGTH) throw new Error(`Offline documentation inventory has an invalid summary for '${record.id}'.`);
}

if (OFFLINE_DOCUMENTATION_INVENTORY.length > MAX_DOCUMENT_COUNT || INVENTORY_BY_ID.size !== OFFLINE_DOCUMENTATION_INVENTORY.length || INVENTORY_BY_FILE.size !== OFFLINE_DOCUMENTATION_INVENTORY.length) {
  throw new Error('Offline documentation inventory must contain unique, bounded article identifiers.');
}

class OfflineDocumentationLibrary {
  constructor({ appPath }) {
    if (typeof appPath !== 'string' || !appPath.trim()) throw new Error('The application path is required to load bundled documentation.');
    this.appPath = path.resolve(appPath);
    this.docsRoot = path.resolve(this.appPath, 'docs', 'features');
  }

  async list() {
    const inspection = await this.#inspectBundle();
    return Object.freeze({
      schemaVersion: OFFLINE_DOCUMENTATION_SCHEMA_VERSION,
      kind: 'minecraft-server-studio-offline-documentation',
      state: inspection.missing.length || inspection.unindexed.length ? 'incomplete' : 'ready',
      source: 'bundled-docs-features',
      documents: inspection.documents.map((record) => publicDocument(record)),
      missing: inspection.missing.map((record) => Object.freeze({ id: record.id, title: record.title })),
      unindexed: inspection.unindexed.map((record) => Object.freeze({ fileName: record.fileName, reason: record.reason })),
      boundary: inspection.missing.length || inspection.unindexed.length
        ? 'The bundled documentation inventory is incomplete. The desktop does not fetch a replacement from the network.'
        : 'All listed articles were read from the app-bundled documentation directory. The desktop does not fetch documentation from the network.'
    });
  }

  async read(id) {
    const normalizedId = normalizeDocumentId(id);
    const inspection = await this.#inspectBundle();
    const record = inspection.documents.find((candidate) => candidate.id === normalizedId);
    if (!record) {
      const known = INVENTORY_BY_ID.get(normalizedId);
      if (known) throw new Error(`The bundled '${known.title}' article is unavailable. The app will not fetch a replacement from the network.`);
      throw new Error('The requested documentation article is not part of this app-bundled inventory.');
    }
    return Object.freeze({
      schemaVersion: OFFLINE_DOCUMENTATION_SCHEMA_VERSION,
      kind: 'minecraft-server-studio-offline-document',
      source: 'bundled-docs-features',
      document: Object.freeze({
        ...publicDocument(record),
        markdown: record.markdown
      }),
      boundary: 'The document was read from a fixed app-bundled inventory. No URL, user path, remote fetch, or arbitrary Markdown source was accepted.'
    });
  }

  async #inspectBundle() {
    try {
      const root = await fs.lstat(this.docsRoot);
      if (!root.isDirectory() || root.isSymbolicLink()) throw new Error('The bundled documentation root is not a regular directory.');
    } catch (error) {
      const reason = safeErrorDetail(error);
      return Object.freeze({
        documents: Object.freeze([]),
        missing: Object.freeze(OFFLINE_DOCUMENTATION_INVENTORY.map((definition) => Object.freeze({ ...definition, reason }))),
        unindexed: Object.freeze([Object.freeze({ fileName: 'docs/features', reason })])
      });
    }
    const documents = [];
    const missing = [];
    let totalBytes = 0;
    for (const definition of OFFLINE_DOCUMENTATION_INVENTORY) {
      try {
        const documentPath = this.#resolveDocumentPath(definition.fileName);
        const stat = await fs.lstat(documentPath);
        if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('The bundled entry is not a regular file.');
        if (stat.size < 1 || stat.size > MAX_DOCUMENT_BYTES) throw new Error('The bundled entry exceeds the permitted document size.');
        totalBytes += stat.size;
        if (totalBytes > MAX_TOTAL_DOCUMENT_BYTES) throw new Error('The bundled documentation collection exceeds the permitted total size.');
        const markdown = await fs.readFile(documentPath, 'utf8');
        if (!markdown.trim() || markdown.includes('\u0000') || Buffer.byteLength(markdown, 'utf8') > MAX_DOCUMENT_BYTES) {
          throw new Error('The bundled entry has invalid or oversized Markdown content.');
        }
        documents.push(Object.freeze({
          ...definition,
          title: titleFromMarkdown(markdown, definition.title),
          summary: summaryFromMarkdown(markdown, definition.summary),
          searchText: searchTextFromMarkdown(markdown),
          markdown
        }));
      } catch (error) {
        missing.push(Object.freeze({ ...definition, reason: safeErrorDetail(error) }));
      }
    }
    const unindexed = await this.#findUnindexedMarkdown();
    return Object.freeze({ documents: Object.freeze(documents), missing: Object.freeze(missing), unindexed });
  }

  async #findUnindexedMarkdown() {
    try {
      const entries = await fs.readdir(this.docsRoot, { withFileTypes: true });
      return Object.freeze(entries
        .filter((entry) => entry.name.endsWith('.md') && !INVENTORY_BY_FILE.has(entry.name))
        .map((entry) => Object.freeze({
          fileName: entry.name,
          reason: entry.isFile() ? 'The Markdown article is not in the hand-written bundled inventory.' : 'The Markdown entry is not a tracked regular bundled article.'
        })));
    } catch (error) {
      return Object.freeze([Object.freeze({ fileName: 'docs/features', reason: safeErrorDetail(error) })]);
    }
  }

  #resolveDocumentPath(fileName) {
    const candidate = path.resolve(this.docsRoot, fileName);
    const relative = path.relative(this.docsRoot, candidate);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || path.dirname(relative) !== '.') {
      throw new Error('The bundled document path escaped its fixed documentation directory.');
    }
    return candidate;
  }
}

function publicDocument(record) {
  return Object.freeze({
    id: record.id,
    fileName: record.fileName,
    title: record.title,
    summary: record.summary,
    searchText: record.searchText || ''
  });
}

function normalizeDocumentId(value) {
  if (typeof value !== 'string') throw new Error('Choose a documentation article from the bundled list.');
  const id = value.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,95}$/.test(id) || id.length > MAX_DOCUMENT_ID_LENGTH) {
    throw new Error('Choose a documentation article from the bundled list.');
  }
  return id;
}

function titleFromMarkdown(markdown, fallback) {
  const match = String(markdown).match(/^#\s+(.{1,180})\s*$/m);
  return match ? plainMarkdownText(match[1]).slice(0, MAX_TITLE_LENGTH) || fallback : fallback;
}

function summaryFromMarkdown(markdown, fallback) {
  const lines = String(markdown).replace(/\r\n?/g, '\n').split('\n');
  const paragraph = [];
  let afterTitle = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!afterTitle && /^#\s+/.test(trimmed)) {
      afterTitle = true;
      continue;
    }
    if (!afterTitle || !trimmed || /^#{1,6}\s+/.test(trimmed) || /^[-*+]\s+/.test(trimmed) || /^```/.test(trimmed)) {
      if (paragraph.length) break;
      continue;
    }
    paragraph.push(trimmed);
    if (paragraph.join(' ').length >= MAX_SUMMARY_LENGTH) break;
  }
  const summary = plainMarkdownText(paragraph.join(' ')).replace(/\s+/g, ' ').trim().slice(0, MAX_SUMMARY_LENGTH);
  return summary || fallback;
}

function plainMarkdownText(value) {
  return String(value)
    .replace(/!?(?:\[[^\]]*\])\([^)]*\)/g, (match) => match.replace(/^!?(?:\[([^\]]*)\])\([^)]*\)$/, '$1'))
    .replace(/[`*_~>#]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function searchTextFromMarkdown(markdown) {
  return String(markdown)
    .replace(/```/g, ' ')
    .replace(/!?(?:\[[^\]]*\])\([^)]*\)/g, (match) => match.replace(/^!?(?:\[([^\]]*)\])\([^)]*\)$/, '$1'))
    .replace(/[`*_~>#|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_SEARCH_TEXT_LENGTH);
}

function safeErrorDetail(error) {
  const message = typeof error?.message === 'string' ? error.message : 'The bundled article could not be loaded.';
  return message.replace(/[\r\n]+/g, ' ').slice(0, 180);
}

async function verifyOfflineDocumentationBundle({ appPath = process.cwd() } = {}) {
  const library = new OfflineDocumentationLibrary({ appPath });
  const result = await library.list();
  if (result.state !== 'ready') {
    const missing = result.missing.map((record) => record.id);
    const unindexed = result.unindexed.map((record) => record.fileName);
    throw new Error(`Offline documentation bundle is incomplete: ${[...missing, ...unindexed].join(', ') || 'unknown article'}.`);
  }
  return result;
}

module.exports = {
  MAX_DOCUMENT_BYTES,
  MAX_DOCUMENT_COUNT,
  MAX_SEARCH_TEXT_LENGTH,
  MAX_TOTAL_DOCUMENT_BYTES,
  OFFLINE_DOCUMENTATION_INVENTORY,
  OFFLINE_DOCUMENTATION_SCHEMA_VERSION,
  OfflineDocumentationLibrary,
  verifyOfflineDocumentationBundle
};
