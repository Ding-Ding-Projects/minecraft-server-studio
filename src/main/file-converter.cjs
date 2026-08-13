'use strict';

/**
 * Local file-converter foundation.
 *
 * This module intentionally owns only source inspection, an honest adapter
 * catalog, and a durable queue skeleton. It does not download an adapter,
 * discover a command on PATH, spawn a process, modify a selected source, or
 * claim that a conversion has occurred. A future adapter can become enabled
 * only after its bundled offline executable/library and output validation are
 * registered here explicitly.
 */

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const QUEUE_SCHEMA_VERSION = 1;
const MAX_QUEUE_ITEMS = 256;
const MAX_QUEUE_RECORD_BYTES = 512 * 1024;
const MAX_SOURCE_PATH_LENGTH = 4_096;
const MAX_SOURCE_BYTES = 8 * 1024 * 1024 * 1024;
const MAX_SNIFF_BYTES = 64 * 1024;
const MAX_FILE_NAME_LENGTH = 255;

const CATEGORIES = Object.freeze([
  Object.freeze({ id: 'documents-pdf', title: 'Documents/PDF' }),
  Object.freeze({ id: 'images', title: 'Images' }),
  Object.freeze({ id: 'audio', title: 'Audio' }),
  Object.freeze({ id: 'video', title: 'Video' }),
  Object.freeze({ id: 'archives', title: 'Archives' }),
  Object.freeze({ id: 'structured-data-spreadsheets', title: 'Structured Data/Spreadsheets' }),
  Object.freeze({ id: 'code-text', title: 'Code/Text' }),
  Object.freeze({ id: 'binary-encodings', title: 'Binary Encodings' })
]);

function unavailableAdapter(id, categoryId, title, sourceKinds, targets, reason) {
  return Object.freeze({
    id,
    categoryId,
    title,
    sourceKinds: Object.freeze([...sourceKinds]),
    targets: Object.freeze([...targets]),
    enabled: false,
    bundled: false,
    state: 'unavailable',
    reason
  });
}

// Every entry is deliberately visible. Disabled is a capability state, not a
// hidden feature: this application package currently contains no verified
// converter engine for any target format.
const ADAPTERS = Object.freeze([
  unavailableAdapter('pdf-pages-and-text', 'documents-pdf', 'PDF pages and text', ['pdf'], ['PDF pages', 'plain text'], 'No verified bundled offline PDF engine is packaged in this build.'),
  unavailableAdapter('raster-images', 'images', 'Raster image conversion', ['png', 'jpeg', 'gif', 'webp'], ['PNG', 'JPEG', 'WebP'], 'No verified bundled offline image converter is packaged in this build.'),
  unavailableAdapter('audio-transcode', 'audio', 'Audio transcode', ['wav', 'mp3', 'ogg'], ['WAV', 'MP3', 'Ogg'], 'No verified bundled offline audio converter is packaged in this build.'),
  unavailableAdapter('video-transcode', 'video', 'Video transcode', ['mp4'], ['MP4', 'WebM'], 'No verified bundled offline video converter is packaged in this build.'),
  unavailableAdapter('archive-packaging', 'archives', 'Archive packaging', ['zip', '7z', 'gzip'], ['ZIP', '7z'], 'No verified bundled offline archive engine is packaged in this build.'),
  unavailableAdapter('structured-data', 'structured-data-spreadsheets', 'Structured data and spreadsheet conversion', ['json', 'xml', 'csv'], ['JSON', 'CSV', 'TSV', 'XML'], 'No verified bundled offline structured-data or spreadsheet converter is packaged in this build.'),
  unavailableAdapter('code-text', 'code-text', 'Text encoding and line-ending conversion', ['text'], ['UTF-8 text', 'CRLF/LF text'], 'No verified bundled offline text-conversion adapter is packaged in this build.'),
  unavailableAdapter('binary-encoding', 'binary-encodings', 'Binary encoding conversion', ['binary'], ['Base64 text', 'hex text'], 'No verified bundled offline binary-encoding adapter is packaged in this build.')
]);

const SOURCE_KINDS = Object.freeze({
  pdf: Object.freeze({ categoryId: 'documents-pdf', title: 'PDF document', mime: 'application/pdf' }),
  png: Object.freeze({ categoryId: 'images', title: 'PNG image', mime: 'image/png' }),
  jpeg: Object.freeze({ categoryId: 'images', title: 'JPEG image', mime: 'image/jpeg' }),
  gif: Object.freeze({ categoryId: 'images', title: 'GIF image', mime: 'image/gif' }),
  webp: Object.freeze({ categoryId: 'images', title: 'WebP image', mime: 'image/webp' }),
  wav: Object.freeze({ categoryId: 'audio', title: 'WAV audio', mime: 'audio/wav' }),
  mp3: Object.freeze({ categoryId: 'audio', title: 'MP3 audio', mime: 'audio/mpeg' }),
  ogg: Object.freeze({ categoryId: 'audio', title: 'Ogg audio', mime: 'audio/ogg' }),
  mp4: Object.freeze({ categoryId: 'video', title: 'ISO Base Media video', mime: 'video/mp4' }),
  zip: Object.freeze({ categoryId: 'archives', title: 'ZIP archive', mime: 'application/zip' }),
  '7z': Object.freeze({ categoryId: 'archives', title: '7z archive', mime: 'application/x-7z-compressed' }),
  gzip: Object.freeze({ categoryId: 'archives', title: 'gzip archive', mime: 'application/gzip' }),
  json: Object.freeze({ categoryId: 'structured-data-spreadsheets', title: 'JSON data', mime: 'application/json' }),
  xml: Object.freeze({ categoryId: 'structured-data-spreadsheets', title: 'XML data', mime: 'application/xml' }),
  csv: Object.freeze({ categoryId: 'structured-data-spreadsheets', title: 'Delimited text data', mime: 'text/csv' }),
  text: Object.freeze({ categoryId: 'code-text', title: 'Text source', mime: 'text/plain' }),
  binary: Object.freeze({ categoryId: 'binary-encodings', title: 'Unclassified binary data', mime: 'application/octet-stream' })
});

function copyAdapter(adapter) {
  return {
    id: adapter.id,
    categoryId: adapter.categoryId,
    title: adapter.title,
    sourceKinds: [...adapter.sourceKinds],
    targets: [...adapter.targets],
    enabled: adapter.enabled,
    bundled: adapter.bundled,
    state: adapter.state,
    reason: adapter.reason
  };
}

function categoryCatalog() {
  return CATEGORIES.map((category) => ({
    id: category.id,
    title: category.title,
    adapters: ADAPTERS.filter((adapter) => adapter.categoryId === category.id).map(copyAdapter)
  }));
}

function boundedString(value, maximum, fallback = '') {
  if (typeof value !== 'string') return fallback;
  return value.slice(0, maximum);
}

function safeFileName(sourcePath) {
  const name = path.basename(sourcePath || '').trim();
  return boundedString(name || 'selected-file', MAX_FILE_NAME_LENGTH, 'selected-file');
}

function hasPrefix(buffer, values, offset = 0) {
  if (!Buffer.isBuffer(buffer) || buffer.length < offset + values.length) return false;
  return values.every((value, index) => buffer[offset + index] === value);
}

function sourceDescriptor(kind, detail) {
  const definition = SOURCE_KINDS[kind] || SOURCE_KINDS.binary;
  return {
    kind,
    categoryId: definition.categoryId,
    title: definition.title,
    mime: definition.mime,
    detail: boundedString(detail, 512, 'Detected from a bounded local byte inspection.')
  };
}

function likelyText(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.includes(0)) return false;
  let controls = 0;
  for (const byte of buffer) {
    if (byte < 0x09 || (byte > 0x0d && byte < 0x20)) controls += 1;
  }
  return controls <= Math.max(2, Math.floor(buffer.length * 0.02));
}

function sniffText(buffer) {
  if (!likelyText(buffer)) return null;
  const sample = buffer.toString('utf8').replace(/^\uFEFF/, '').trimStart();
  if (!sample) return sourceDescriptor('text', 'The bounded local prefix contains text whitespace only.');
  if (/^[{[]/.test(sample)) return sourceDescriptor('json', 'Detected a JSON-like opening token in the bounded local text prefix.');
  if (/^<\?xml\b/i.test(sample) || /^<[A-Za-z][^>]*>/.test(sample)) return sourceDescriptor('xml', 'Detected an XML-like opening token in the bounded local text prefix.');
  const firstLine = sample.split(/\r?\n/, 1)[0] || '';
  if (/[;,\t]/.test(firstLine) && /\r?\n/.test(sample)) return sourceDescriptor('csv', 'Detected a delimited multi-line text shape in the bounded local prefix.');
  return sourceDescriptor('text', 'Detected printable text in the bounded local prefix.');
}

function sniffSource(buffer) {
  if (hasPrefix(buffer, [0x25, 0x50, 0x44, 0x46, 0x2d])) return sourceDescriptor('pdf', 'Detected the %PDF- signature in the bounded local prefix.');
  if (hasPrefix(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return sourceDescriptor('png', 'Detected the PNG signature in the bounded local prefix.');
  if (hasPrefix(buffer, [0xff, 0xd8, 0xff])) return sourceDescriptor('jpeg', 'Detected the JPEG signature in the bounded local prefix.');
  if (buffer.subarray(0, 6).toString('ascii') === 'GIF87a' || buffer.subarray(0, 6).toString('ascii') === 'GIF89a') return sourceDescriptor('gif', 'Detected the GIF signature in the bounded local prefix.');
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return sourceDescriptor('webp', 'Detected the RIFF/WEBP signature in the bounded local prefix.');
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WAVE') return sourceDescriptor('wav', 'Detected the RIFF/WAVE signature in the bounded local prefix.');
  if (buffer.subarray(0, 4).toString('ascii') === 'OggS') return sourceDescriptor('ogg', 'Detected the OggS signature in the bounded local prefix.');
  if (buffer.subarray(0, 3).toString('ascii') === 'ID3' || hasPrefix(buffer, [0xff, 0xfb]) || hasPrefix(buffer, [0xff, 0xf3]) || hasPrefix(buffer, [0xff, 0xf2])) return sourceDescriptor('mp3', 'Detected an MP3 header in the bounded local prefix.');
  if (buffer.subarray(4, 8).toString('ascii') === 'ftyp') return sourceDescriptor('mp4', 'Detected an ISO Base Media ftyp marker in the bounded local prefix.');
  if (hasPrefix(buffer, [0x50, 0x4b, 0x03, 0x04]) || hasPrefix(buffer, [0x50, 0x4b, 0x05, 0x06]) || hasPrefix(buffer, [0x50, 0x4b, 0x07, 0x08])) return sourceDescriptor('zip', 'Detected a ZIP signature in the bounded local prefix.');
  if (hasPrefix(buffer, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])) return sourceDescriptor('7z', 'Detected the 7z signature in the bounded local prefix.');
  if (hasPrefix(buffer, [0x1f, 0x8b])) return sourceDescriptor('gzip', 'Detected the gzip signature in the bounded local prefix.');
  return sniffText(buffer) || sourceDescriptor('binary', 'No supported signature or text shape was found in the bounded local prefix.');
}

async function readPrefix(sourcePath, size) {
  const length = Math.max(0, Math.min(Number(size) || 0, MAX_SNIFF_BYTES));
  if (!length) return Buffer.alloc(0);
  const handle = await fs.open(sourcePath, 'r');
  try {
    const buffer = Buffer.alloc(length);
    const result = await handle.read(buffer, 0, length, 0);
    return buffer.subarray(0, result.bytesRead);
  } finally {
    await handle.close();
  }
}

function normalizeDescriptor(value) {
  const kind = Object.prototype.hasOwnProperty.call(SOURCE_KINDS, value?.kind) ? value.kind : 'binary';
  const definition = SOURCE_KINDS[kind];
  return {
    kind,
    categoryId: definition.categoryId,
    title: definition.title,
    mime: definition.mime,
    detail: boundedString(value?.detail, 512, 'A bounded local byte inspection recorded this source type.')
  };
}

function normalizeQueueItem(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const id = boundedString(value.id, 128);
  const sourcePath = boundedString(value.sourcePath, MAX_SOURCE_PATH_LENGTH);
  const fileName = boundedString(value.fileName, MAX_FILE_NAME_LENGTH);
  const createdAt = boundedString(value.createdAt, 64);
  const bytes = Number(value.bytes);
  if (!id || !sourcePath || !fileName || !createdAt || !Number.isInteger(bytes) || bytes < 0 || bytes > MAX_SOURCE_BYTES) return null;
  return {
    id,
    state: 'awaiting-adapter',
    sourcePath,
    fileName,
    bytes,
    descriptor: normalizeDescriptor(value.descriptor),
    createdAt,
    detail: 'No verified bundled output adapter is available for this source. The selected file was inspected only; it was not converted or changed.'
  };
}

function publicQueueItem(item) {
  return {
    id: item.id,
    state: item.state,
    sourcePath: item.sourcePath,
    fileName: item.fileName,
    bytes: item.bytes,
    descriptor: { ...item.descriptor },
    createdAt: item.createdAt,
    detail: item.detail
  };
}

class FileConverter {
  constructor(options = {}) {
    const dataDir = boundedString(options.dataDir, MAX_SOURCE_PATH_LENGTH);
    if (!dataDir) throw new Error('A private converter data directory is required.');
    this.dataDir = path.resolve(dataDir);
    this.queueFile = path.join(this.dataDir, 'converter-queue.json');
    this.onEvent = typeof options.onEvent === 'function' ? options.onEvent : () => {};
    this.queue = [];
    this.state = 'starting';
    this.detail = 'The local converter queue is starting.';
    this.writeChain = Promise.resolve();
  }

  async initialize() {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
      this.queue = await this.readQueue();
      this.state = 'ready';
      this.detail = 'The local converter catalog is ready. This build has no verified bundled conversion adapters.';
    } catch (error) {
      this.queue = [];
      this.state = 'unavailable';
      this.detail = `The local converter queue is unavailable: ${boundedString(String(error?.message || 'unknown storage failure'), 256, 'unknown storage failure')}`;
    }
    return this.snapshot();
  }

  snapshot() {
    return {
      schemaVersion: QUEUE_SCHEMA_VERSION,
      state: this.state,
      detail: this.detail,
      boundary: {
        localOnly: true,
        network: false,
        processLaunch: false,
        sourceMutation: false,
        exactBoundary: 'This converter foundation performs a bounded local byte inspection and records an app-private queue entry. It has no network client, shell, PATH discovery, bundled output engine, or source-file write path.'
      },
      limits: {
        maxSourceBytes: MAX_SOURCE_BYTES,
        sniffBytes: MAX_SNIFF_BYTES,
        maxQueueItems: MAX_QUEUE_ITEMS
      },
      categories: categoryCatalog(),
      queue: this.queue.map(publicQueueItem)
    };
  }

  async inspectSource(sourcePath) {
    this.requireReady();
    const inspection = await this.inspectFile(sourcePath);
    const next = {
      id: crypto.randomUUID(),
      state: 'awaiting-adapter',
      sourcePath: inspection.sourcePath,
      fileName: inspection.fileName,
      bytes: inspection.bytes,
      descriptor: inspection.descriptor,
      createdAt: new Date().toISOString(),
      detail: 'No verified bundled output adapter is available for this source. The selected file was inspected only; it was not converted or changed.'
    };
    const previous = this.queue;
    this.queue = [next, ...this.queue].slice(0, MAX_QUEUE_ITEMS);
    try {
      await this.persistQueue();
    } catch (error) {
      this.queue = previous;
      throw new Error(`The local converter queue could not be saved: ${boundedString(String(error?.message || 'unknown storage failure'), 256, 'unknown storage failure')}`);
    }
    this.onEvent({
      type: 'file-converter',
      state: 'inspected',
      message: 'A local source file was inspected and recorded in the converter queue. No conversion was started.'
    });
    return {
      source: {
        sourcePath: next.sourcePath,
        fileName: next.fileName,
        bytes: next.bytes,
        descriptor: { ...next.descriptor },
        detail: next.detail
      },
      snapshot: this.snapshot()
    };
  }

  requireReady() {
    if (this.state !== 'ready') throw new Error(this.detail || 'The local converter queue is unavailable.');
  }

  async inspectFile(value) {
    if (typeof value !== 'string' || !value.trim() || value.length > MAX_SOURCE_PATH_LENGTH || !path.isAbsolute(value)) {
      throw new Error('Choose one local file through the app file picker.');
    }
    if (/^(?:\\\\|\/\/)/.test(value)) throw new Error('Choose a local file rather than a network share.');
    const sourcePath = path.resolve(value);
    const stat = await fs.stat(sourcePath);
    if (!stat.isFile()) throw new Error('The selected local item is not a regular file.');
    if (!Number.isSafeInteger(stat.size) || stat.size < 0 || stat.size > MAX_SOURCE_BYTES) {
      throw new Error(`The selected file exceeds this converter foundation's ${MAX_SOURCE_BYTES.toLocaleString()}-byte safety limit.`);
    }
    const prefix = await readPrefix(sourcePath, stat.size);
    return {
      sourcePath,
      fileName: safeFileName(sourcePath),
      bytes: stat.size,
      descriptor: sniffSource(prefix)
    };
  }

  async readQueue() {
    let stats;
    try {
      stats = await fs.stat(this.queueFile);
    } catch (error) {
      if (error?.code === 'ENOENT') return [];
      throw error;
    }
    if (!stats.isFile() || stats.size > MAX_QUEUE_RECORD_BYTES) throw new Error('The persisted converter queue is malformed or exceeds its bounded size.');
    const raw = await fs.readFile(this.queueFile, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || parsed.schemaVersion !== QUEUE_SCHEMA_VERSION || !Array.isArray(parsed.items)) {
      throw new Error('The persisted converter queue uses an unsupported schema.');
    }
    if (parsed.items.length > MAX_QUEUE_ITEMS) throw new Error('The persisted converter queue exceeds its item limit.');
    const normalized = parsed.items.map(normalizeQueueItem);
    if (normalized.some((item) => !item)) throw new Error('The persisted converter queue contains an invalid item.');
    return normalized;
  }

  async persistQueue() {
    const payload = JSON.stringify({
      schemaVersion: QUEUE_SCHEMA_VERSION,
      savedAt: new Date().toISOString(),
      items: this.queue
    });
    if (Buffer.byteLength(payload, 'utf8') > MAX_QUEUE_RECORD_BYTES) throw new Error('The converter queue exceeds its bounded local storage size.');
    const write = async () => {
      const tempFile = path.join(this.dataDir, `.converter-queue-${crypto.randomUUID()}.tmp`);
      try {
        await fs.writeFile(tempFile, payload, { encoding: 'utf8', mode: 0o600 });
        await fs.rename(tempFile, this.queueFile);
      } finally {
        await fs.rm(tempFile, { force: true }).catch(() => {});
      }
    };
    const queuedWrite = this.writeChain.then(write);
    this.writeChain = queuedWrite.catch(() => {});
    return queuedWrite;
  }
}

module.exports = {
  ADAPTERS,
  CATEGORIES,
  FileConverter,
  MAX_SNIFF_BYTES,
  MAX_SOURCE_BYTES,
  QUEUE_SCHEMA_VERSION,
  sniffSource
};
