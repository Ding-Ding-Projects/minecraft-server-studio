'use strict';

/**
 * App-owned, local-only file conversion.
 *
 * The converter deliberately enables only the transformations implemented in
 * this module: validated UTF-8 text, JSON/CSV/TSV, a documented YAML-style
 * subset, and Base64/hex encodings. It never discovers a PATH tool, launches
 * a process, uploads data, or uses a network client. PDF, media, archives,
 * native workbooks, and every unregistered format remain visible but disabled.
 */

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { TextDecoder } = require('node:util');

const QUEUE_SCHEMA_VERSION = 2;
const MAX_QUEUE_ITEMS = 256;
const MAX_QUEUE_RECORD_BYTES = 512 * 1024;
const MAX_SOURCE_PATH_LENGTH = 4_096;
const MAX_SOURCE_BYTES = 8 * 1024 * 1024 * 1024;
const MAX_CONVERTIBLE_SOURCE_BYTES = 8 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 16 * 1024 * 1024;
const MAX_SNIFF_BYTES = 64 * 1024;
const MAX_FILE_NAME_LENGTH = 255;
const MAX_TEXT_CHARS = 8 * 1024 * 1024;
const MAX_JSON_DEPTH = 16;
const MAX_JSON_NODES = 400_000;
const MAX_DELIMITED_ROWS = 5_000;
const MAX_DELIMITED_COLUMNS = 80;
const MAX_CELL_CHARS = 32_768;
const MAX_KEY_CHARS = 160;

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

function adapter(id, categoryId, title, sourceKinds, targets, options) {
  return Object.freeze({
    id,
    categoryId,
    title,
    sourceKinds: Object.freeze([...sourceKinds]),
    targets: Object.freeze([...targets]),
    enabled: options.enabled === true,
    bundled: options.bundled === true,
    state: options.enabled === true ? 'available' : 'unavailable',
    reason: options.reason
  });
}

const ADAPTERS = Object.freeze([
  adapter('pdf-pages-and-text', 'documents-pdf', 'PDF pages and text', ['pdf'], ['PDF pages', 'plain text'], { enabled: false, bundled: false, reason: 'No verified bundled offline PDF engine is packaged in this build.' }),
  adapter('raster-images', 'images', 'Raster image conversion', ['png', 'jpeg', 'gif', 'webp'], ['PNG', 'JPEG', 'WebP'], { enabled: false, bundled: false, reason: 'No verified bundled offline image converter is packaged in this build.' }),
  adapter('audio-transcode', 'audio', 'Audio transcode', ['wav', 'mp3', 'ogg'], ['WAV', 'MP3', 'Ogg'], { enabled: false, bundled: false, reason: 'No verified bundled offline audio converter is packaged in this build.' }),
  adapter('video-transcode', 'video', 'Video transcode', ['mp4'], ['MP4', 'WebM'], { enabled: false, bundled: false, reason: 'No verified bundled offline video converter is packaged in this build.' }),
  adapter('archive-packaging', 'archives', 'Archive packaging', ['zip', '7z', 'gzip'], ['ZIP', '7z'], { enabled: false, bundled: false, reason: 'No verified bundled offline archive engine is packaged in this build.' }),
  adapter('structured-utf8', 'structured-data-spreadsheets', 'Validated JSON, CSV, TSV, and YAML-style data', ['json', 'csv', 'tsv', 'yaml'], ['JSON', 'CSV', 'TSV', 'YAML-style text'], { enabled: true, bundled: true, reason: 'Bundled app-owned parsers and renderers validate bounded JSON/CSV/TSV plus a deliberately limited YAML-style subset.' }),
  adapter('native-workbook-and-xml', 'structured-data-spreadsheets', 'Native workbook and XML conversion', ['xlsx', 'ods', 'xml'], ['XLSX', 'ODS', 'XML'], { enabled: false, bundled: false, reason: 'No verified bundled offline native-workbook or XML converter is packaged in this build.' }),
  adapter('code-text-utf8', 'code-text', 'UTF-8 text normalization', ['text', 'json', 'csv', 'tsv', 'yaml'], ['UTF-8 text'], { enabled: true, bundled: true, reason: 'Bundled app-owned UTF-8 validation writes a new output only after an explicit destination choice.' }),
  adapter('binary-base64-hex', 'binary-encodings', 'Base64 and hex encodings', ['any bounded local bytes'], ['Base64 text', 'hex text'], { enabled: true, bundled: true, reason: 'Bundled app-owned encoders transform bounded local bytes without a decoder, shell, or network route.' })
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
  json: Object.freeze({ categoryId: 'structured-data-spreadsheets', title: 'Validated JSON data', mime: 'application/json' }),
  csv: Object.freeze({ categoryId: 'structured-data-spreadsheets', title: 'Validated CSV data', mime: 'text/csv' }),
  tsv: Object.freeze({ categoryId: 'structured-data-spreadsheets', title: 'Validated TSV data', mime: 'text/tab-separated-values' }),
  yaml: Object.freeze({ categoryId: 'structured-data-spreadsheets', title: 'Validated YAML-style data', mime: 'text/yaml' }),
  xml: Object.freeze({ categoryId: 'structured-data-spreadsheets', title: 'XML-like data', mime: 'application/xml' }),
  text: Object.freeze({ categoryId: 'code-text', title: 'Validated UTF-8 text', mime: 'text/plain' }),
  binary: Object.freeze({ categoryId: 'binary-encodings', title: 'Unclassified binary data', mime: 'application/octet-stream' })
});

const TARGETS = Object.freeze({
  text: Object.freeze({ id: 'text', label: 'UTF-8 text', format: 'UTF-8 text', extension: 'txt', filterExtension: 'txt', adapterId: 'code-text-utf8', disclosure: 'Writes decoded UTF-8 text without a byte-order mark. The source file is never changed.' }),
  json: Object.freeze({ id: 'json', label: 'JSON', format: 'JSON', extension: 'json', filterExtension: 'json', adapterId: 'structured-utf8', disclosure: 'Writes validated structured values as UTF-8 JSON. Formatting may change; no field is silently dropped.' }),
  csv: Object.freeze({ id: 'csv', label: 'CSV', format: 'CSV', extension: 'csv', filterExtension: 'csv', adapterId: 'structured-utf8', disclosure: 'Writes a bounded table. JSON/YAML-style input must be a top-level array of scalar record objects; nested values are refused rather than flattened.' }),
  tsv: Object.freeze({ id: 'tsv', label: 'TSV', format: 'TSV', extension: 'tsv', filterExtension: 'tsv', adapterId: 'structured-utf8', disclosure: 'Writes a bounded tab-separated table. JSON/YAML-style input must be a top-level array of scalar record objects; nested values are refused rather than flattened.' }),
  yaml: Object.freeze({ id: 'yaml', label: 'YAML-style text', format: 'YAML-style text', extension: 'yaml', filterExtension: 'yaml', adapterId: 'structured-utf8', disclosure: 'Writes the documented bounded YAML-style subset with JSON-quoted keys and strings. It is not a general YAML engine.' }),
  base64: Object.freeze({ id: 'base64', label: 'Base64 text (encoding)', format: 'Base64 text', extension: 'base64.txt', filterExtension: 'txt', adapterId: 'binary-base64-hex', disclosure: 'Encodes the selected bounded bytes as Base64 text. This is representation-changing and does not decode or inspect an unavailable native format.' }),
  hex: Object.freeze({ id: 'hex', label: 'Hex text (encoding)', format: 'hex text', extension: 'hex.txt', filterExtension: 'txt', adapterId: 'binary-base64-hex', disclosure: 'Encodes the selected bounded bytes as lowercase hexadecimal text. This is representation-changing and does not decode an unavailable native format.' })
});

const BINARY_TARGET_IDS = Object.freeze(['base64', 'hex']);
const STRUCTURED_TARGET_IDS = Object.freeze(['text', 'json', 'csv', 'tsv', 'yaml', 'base64', 'hex']);
const STRUCTURED_NON_TABULAR_TARGET_IDS = Object.freeze(['text', 'json', 'yaml', 'base64', 'hex']);
const TEXT_TARGET_IDS = Object.freeze(['text', 'base64', 'hex']);
const HISTORY_STATES = new Set(['converted', 'failed', 'cancelled', 'legacy-inspection']);

function boundedString(value, maximum, fallback = '') {
  if (typeof value !== 'string') return fallback;
  return value.slice(0, maximum);
}

function safeFileName(value) {
  const name = path.basename(String(value || '')).replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return boundedString(name || 'selected-file', MAX_FILE_NAME_LENGTH, 'selected-file');
}

function safeFileStem(value) {
  const fileName = safeFileName(value);
  const extension = path.extname(fileName);
  const stem = extension && fileName.length > extension.length ? fileName.slice(0, -extension.length) : fileName;
  return boundedString(stem || 'converted-file', 160, 'converted-file');
}

function hasPrefix(buffer, values, offset = 0) {
  if (!Buffer.isBuffer(buffer) || buffer.length < offset + values.length) return false;
  return values.every((value, index) => buffer[offset + index] === value);
}

function sourceDescriptor(kind, detail) {
  const definition = SOURCE_KINDS[kind] || SOURCE_KINDS.binary;
  return {
    kind: Object.prototype.hasOwnProperty.call(SOURCE_KINDS, kind) ? kind : 'binary',
    categoryId: definition.categoryId,
    title: definition.title,
    mime: definition.mime,
    detail: boundedString(detail, 512, 'Detected through a bounded local byte inspection.')
  };
}

function copyDescriptor(value) {
  const kind = Object.prototype.hasOwnProperty.call(SOURCE_KINDS, value?.kind) ? value.kind : 'binary';
  return sourceDescriptor(kind, boundedString(value?.detail, 512, 'Detected through a bounded local byte inspection.'));
}

function copyAdapter(value) {
  return {
    id: value.id,
    categoryId: value.categoryId,
    title: value.title,
    sourceKinds: [...value.sourceKinds],
    targets: [...value.targets],
    enabled: value.enabled,
    bundled: value.bundled,
    state: value.state,
    reason: value.reason
  };
}

function copyTarget(value) {
  return {
    id: value.id,
    label: value.label,
    format: value.format,
    adapterId: value.adapterId,
    disclosure: value.disclosure
  };
}

function categoryCatalog() {
  return CATEGORIES.map((category) => ({
    id: category.id,
    title: category.title,
    adapters: ADAPTERS.filter((entry) => entry.categoryId === category.id).map(copyAdapter)
  }));
}

function likelyText(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.includes(0)) return false;
  let controls = 0;
  for (const byte of buffer) {
    if (byte < 0x09 || (byte > 0x0d && byte < 0x20)) controls += 1;
  }
  return controls <= Math.max(2, Math.floor(buffer.length * 0.02));
}

function likelyTextString(value) {
  if (typeof value !== 'string' || value.length > MAX_TEXT_CHARS || value.includes('\u0000')) return false;
  let controls = 0;
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code < 0x09 || (code > 0x0d && code < 0x20)) controls += 1;
  }
  return controls <= Math.max(2, Math.floor(value.length * 0.02));
}

function sniffText(buffer) {
  if (!likelyText(buffer)) return null;
  try {
    const sample = decodeUtf8(buffer).trimStart();
    if (!sample) return sourceDescriptor('text', 'The bounded local prefix contains UTF-8 whitespace only.');
    if (/^[{[]/.test(sample)) return sourceDescriptor('json', 'Detected a JSON-like opening token in the bounded local UTF-8 prefix.');
    if (/^<\?xml\b/i.test(sample) || /^<[A-Za-z][^>]*>/.test(sample)) return sourceDescriptor('xml', 'Detected an XML-like opening token in the bounded local UTF-8 prefix.');
    const firstLine = sample.split(/\r?\n/, 1)[0] || '';
    if (firstLine.includes('\t') && /\r?\n/.test(sample)) return sourceDescriptor('tsv', 'Detected a tab-delimited multi-line UTF-8 shape in the bounded local prefix.');
    if (firstLine.includes(',') && /\r?\n/.test(sample)) return sourceDescriptor('csv', 'Detected a comma-delimited multi-line UTF-8 shape in the bounded local prefix.');
    return sourceDescriptor('text', 'Detected printable UTF-8 text in the bounded local prefix.');
  } catch {
    return null;
  }
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
  return sniffText(buffer) || sourceDescriptor('binary', 'No supported signature or UTF-8 text shape was found in the bounded local prefix.');
}

function decodeUtf8(buffer) {
  const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(buffer);
  return text.replace(/^\uFEFF/, '');
}

function isPlainRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function valueWithinBounds(value, depth = 0, tracker = { count: 0 }) {
  if (depth > MAX_JSON_DEPTH || tracker.count > MAX_JSON_NODES) return false;
  if (value === null || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') return value.length <= MAX_CELL_CHARS;
  if (Array.isArray(value)) {
    tracker.count += value.length;
    return value.length <= MAX_DELIMITED_ROWS && value.every((entry) => valueWithinBounds(entry, depth + 1, tracker));
  }
  if (isPlainRecord(value)) {
    const keys = Object.keys(value);
    tracker.count += keys.length;
    return keys.length <= MAX_DELIMITED_COLUMNS && keys.every((key) => key.length <= MAX_KEY_CHARS
      && key !== '__proto__' && key !== 'constructor' && key !== 'prototype'
      && valueWithinBounds(value[key], depth + 1, tracker));
  }
  return false;
}

function parseDelimited(text, delimiter) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  let afterQuote = false;
  const pushCell = () => {
    if (cell.length > MAX_CELL_CHARS) throw new Error('A delimited cell exceeds the converter safety limit.');
    row.push(cell);
    cell = '';
  };
  const pushRow = () => {
    pushCell();
    if (row.length > MAX_DELIMITED_COLUMNS) throw new Error('A delimited row exceeds the converter column limit.');
    if (rows.length >= MAX_DELIMITED_ROWS) throw new Error('The delimited source exceeds the converter row limit.');
    rows.push(row);
    row = [];
  };
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
          afterQuote = true;
        }
      } else {
        cell += character;
      }
      continue;
    }
    if (afterQuote) {
      if (character === delimiter) {
        pushCell();
        afterQuote = false;
      } else if (character === '\n' || character === '\r') {
        if (character === '\r' && text[index + 1] === '\n') index += 1;
        pushRow();
        afterQuote = false;
      } else if (character !== ' ' && character !== '\t') {
        throw new Error('A quoted delimited field has unexpected content after its closing quote.');
      }
      continue;
    }
    if (character === '"') {
      if (cell.length) throw new Error('A quote may start only at the beginning of a delimited field.');
      quoted = true;
    } else if (character === delimiter) {
      pushCell();
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      pushRow();
    } else {
      cell += character;
    }
  }
  if (quoted) throw new Error('The delimited source ends inside a quoted field.');
  if (cell.length || row.length || text.length === 0 || afterQuote) pushRow();
  while (rows.length && rows[rows.length - 1].every((entry) => entry === '')) rows.pop();
  if (!rows.length) return { headers: [], records: [] };
  const rawHeaders = rows.shift();
  if (!rawHeaders.length) throw new Error('The delimited source has no columns.');
  const seen = Object.create(null);
  const headers = rawHeaders.map((header, column) => {
    const base = String(header || '').trim().slice(0, MAX_KEY_CHARS) || `column${column + 1}`;
    if (base === '__proto__' || base === 'constructor' || base === 'prototype') throw new Error('The delimited source contains an unsafe header name.');
    seen[base] = (seen[base] || 0) + 1;
    return seen[base] === 1 ? base : `${base}_${seen[base]}`;
  });
  const records = rows.map((cells) => {
    if (cells.length > headers.length) throw new Error('A delimited row has more values than the header row, so no values were dropped.');
    const record = Object.create(null);
    headers.forEach((header, column) => { record[header] = cells[column] == null ? '' : cells[column]; });
    return record;
  });
  return { headers, records };
}

function likelyDelimited(text, delimiter) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim().length);
  return lines.length >= 2 && lines[0].includes(delimiter);
}

function yamlJsonStringAt(value, start) {
  if (value[start] !== '"') throw new Error('Expected a quoted YAML-style string.');
  let escaped = false;
  for (let index = start + 1; index < value.length; index += 1) {
    const character = value[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === '\\') {
      escaped = true;
      continue;
    }
    if (character === '"') {
      const literal = value.slice(start, index + 1);
      const parsed = JSON.parse(literal);
      if (typeof parsed !== 'string' || parsed.length > MAX_CELL_CHARS) throw new Error('The YAML-style string exceeds the converter safety limit.');
      return { value: parsed, end: index + 1 };
    }
  }
  throw new Error('The YAML-style input contains an unterminated quoted string.');
}

function yamlScalar(value) {
  const text = String(value || '').trim();
  if (!text) throw new Error('The YAML-style input has an empty scalar where a value is required.');
  if (text === 'null') return null;
  if (text === 'true') return true;
  if (text === 'false') return false;
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(text)) {
    const number = Number(text);
    if (!Number.isFinite(number)) throw new Error('The YAML-style input contains a non-finite number.');
    return number;
  }
  if (text.startsWith('"')) {
    const parsed = yamlJsonStringAt(text, 0);
    if (parsed.end !== text.length) throw new Error('The YAML-style quoted scalar has trailing content.');
    return parsed.value;
  }
  if (/^[\[{&*!|>@`]/.test(text) || /:/.test(text) || text.length > MAX_CELL_CHARS) {
    throw new Error('The YAML-style scalar uses unsupported syntax. Quote it as a JSON string instead.');
  }
  return text;
}

function yamlMappingLine(content) {
  if (content.startsWith('"')) {
    const parsed = yamlJsonStringAt(content, 0);
    const suffix = content.slice(parsed.end).trimStart();
    if (!suffix.startsWith(':')) throw new Error('The YAML-style mapping key is missing its colon.');
    if (!parsed.value || parsed.value.length > MAX_KEY_CHARS || parsed.value === '__proto__' || parsed.value === 'constructor' || parsed.value === 'prototype') {
      throw new Error('The YAML-style mapping key is unsupported.');
    }
    return { key: parsed.value, remainder: suffix.slice(1).trimStart() };
  }
  const match = /^([A-Za-z_][A-Za-z0-9_.-]{0,159})\s*:\s*(.*)$/.exec(content);
  if (!match || match[1] === '__proto__' || match[1] === 'constructor' || match[1] === 'prototype') throw new Error('The YAML-style mapping line is unsupported.');
  return { key: match[1], remainder: match[2] };
}

function parseLimitedYaml(text) {
  if (text.includes('\t')) throw new Error('The YAML-style subset does not accept tab indentation.');
  const lines = [];
  for (const raw of text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n')) {
    if (!raw.trim() || /^\s*#/.test(raw)) continue;
    const indentation = /^ */.exec(raw)[0].length;
    if (indentation % 2 !== 0 || indentation > MAX_JSON_DEPTH * 2) throw new Error('The YAML-style indentation is outside the supported two-space subset.');
    lines.push({ indent: indentation, content: raw.slice(indentation), line: lines.length + 1 });
  }
  if (!lines.length) throw new Error('The YAML-style input is empty.');
  let cursor = 0;
  const parseBlock = (indent, depth) => {
    if (depth > MAX_JSON_DEPTH || cursor >= lines.length || lines[cursor].indent !== indent) throw new Error('The YAML-style nesting is outside the supported subset.');
    const first = lines[cursor].content;
    if (first === '{}') {
      cursor += 1;
      return Object.create(null);
    }
    if (first === '[]') {
      cursor += 1;
      return [];
    }
    if (first === '-' || first.startsWith('- ')) {
      const values = [];
      while (cursor < lines.length && lines[cursor].indent === indent) {
        const content = lines[cursor].content;
        if (content !== '-' && !content.startsWith('- ')) throw new Error('The YAML-style sequence mixes mapping and list syntax.');
        const remainder = content === '-' ? '' : content.slice(2).trimStart();
        cursor += 1;
        if (!remainder) {
          if (cursor >= lines.length || lines[cursor].indent !== indent + 2) throw new Error('A YAML-style list item with no scalar requires one nested two-space block.');
          values.push(parseBlock(indent + 2, depth + 1));
        } else {
          values.push(yamlScalar(remainder));
          if (cursor < lines.length && lines[cursor].indent > indent) throw new Error('A scalar YAML-style list item cannot have a nested block.');
        }
        if (values.length > MAX_DELIMITED_ROWS) throw new Error('The YAML-style list exceeds the converter row limit.');
      }
      return values;
    }
    if (indent === 0 && lines.length === 1) {
      cursor += 1;
      return yamlScalar(first);
    }
    const record = Object.create(null);
    let count = 0;
    while (cursor < lines.length && lines[cursor].indent === indent) {
      const mapping = yamlMappingLine(lines[cursor].content);
      if (Object.prototype.hasOwnProperty.call(record, mapping.key)) throw new Error('The YAML-style mapping repeats a key.');
      cursor += 1;
      if (!mapping.remainder) {
        if (cursor >= lines.length || lines[cursor].indent !== indent + 2) throw new Error('A YAML-style mapping key with no scalar requires one nested two-space block.');
        record[mapping.key] = parseBlock(indent + 2, depth + 1);
      } else {
        record[mapping.key] = yamlScalar(mapping.remainder);
        if (cursor < lines.length && lines[cursor].indent > indent) throw new Error('A scalar YAML-style mapping value cannot have a nested block.');
      }
      count += 1;
      if (count > MAX_DELIMITED_COLUMNS) throw new Error('The YAML-style mapping exceeds the converter key limit.');
    }
    return record;
  };
  const value = parseBlock(0, 0);
  if (cursor !== lines.length) throw new Error('The YAML-style input has unsupported indentation or trailing syntax.');
  if (!valueWithinBounds(value)) throw new Error('The YAML-style value exceeds the converter safety bounds.');
  return value;
}

function looksLikeYaml(text) {
  const first = text.replace(/^\uFEFF/, '').split(/\r?\n/).find((line) => line.trim() && !/^\s*#/.test(line));
  if (!first) return false;
  const content = first.trimStart();
  return content === '-' || content.startsWith('- ') || /^"(?:[^"\\]|\\.)*"\s*:/.test(content) || /^[A-Za-z_][A-Za-z0-9_.-]{0,159}\s*:/.test(content);
}

function classifyText(text) {
  const normalized = text.replace(/^\uFEFF/, '');
  const compact = normalized.trim();
  if (compact && /^(?:[\[{\"]|-?\d|true(?:\s|$)|false(?:\s|$)|null(?:\s|$))/.test(compact)) {
    try {
      const value = JSON.parse(compact);
      if (valueWithinBounds(value)) {
        return { mode: 'structured-json', descriptor: sourceDescriptor('json', 'Validated JSON was read from the bounded local source.'), value, tableEligible: tableEligible(value), detail: 'Validated JSON is available for local structured-data conversion.' };
      }
    } catch {
      // Invalid JSON-looking text remains text; structured output stays unavailable.
    }
  }
  if (likelyDelimited(normalized, ',')) {
    try {
      const table = parseDelimited(normalized, ',');
      return { mode: 'structured-delimited', descriptor: sourceDescriptor('csv', 'Validated CSV was read from the bounded local source.'), table, tableEligible: true, detail: 'Validated CSV is available for local structured-data conversion.' };
    } catch {
      // A malformed CSV shape is never guessed as a table.
    }
  }
  if (likelyDelimited(normalized, '\t')) {
    try {
      const table = parseDelimited(normalized, '\t');
      return { mode: 'structured-delimited', descriptor: sourceDescriptor('tsv', 'Validated TSV was read from the bounded local source.'), table, tableEligible: true, detail: 'Validated TSV is available for local structured-data conversion.' };
    } catch {
      // A malformed TSV shape is never guessed as a table.
    }
  }
  if (looksLikeYaml(normalized)) {
    try {
      const value = parseLimitedYaml(normalized);
      return { mode: 'structured-yaml', descriptor: sourceDescriptor('yaml', 'Validated YAML-style data was read from the bounded local source.'), value, tableEligible: tableEligible(value), detail: 'Validated YAML-style data is available for local structured-data conversion.' };
    } catch {
      // This is a text source, not a silently repaired YAML document.
    }
  }
  return { mode: 'text', descriptor: sourceDescriptor('text', 'Validated printable UTF-8 text was read from the bounded local source.'), tableEligible: false, detail: 'Validated UTF-8 text is available for local text conversion.' };
}

function classifyBytes(bytes, sniff) {
  const nativeKinds = new Set(['pdf', 'png', 'jpeg', 'gif', 'webp', 'wav', 'mp3', 'ogg', 'mp4', 'zip', '7z', 'gzip', 'xml']);
  if (nativeKinds.has(sniff.kind)) {
    return { mode: 'binary', descriptor: copyDescriptor(sniff), tableEligible: false, detail: `${sniff.title} has no enabled semantic adapter. Base64 or hex encoding remains available for bounded local bytes.` };
  }
  try {
    const text = decodeUtf8(bytes);
    if (!likelyTextString(text)) {
      return { mode: 'binary', descriptor: sourceDescriptor('binary', 'Full bounded inspection found binary control bytes.'), tableEligible: false, detail: 'The source is not validated UTF-8 text. Base64 or hex encoding remains available for bounded local bytes.' };
    }
    return classifyText(text);
  } catch {
    return { mode: 'binary', descriptor: sourceDescriptor('binary', 'Full bounded inspection could not validate UTF-8 text.'), tableEligible: false, detail: 'The source is not validated UTF-8 text. Base64 or hex encoding remains available for bounded local bytes.' };
  }
}

function targetIdsFor(mode, sourceIsTable = false) {
  if (mode === 'structured-delimited') return STRUCTURED_TARGET_IDS;
  if (mode === 'structured-json' || mode === 'structured-yaml') return sourceIsTable ? STRUCTURED_TARGET_IDS : STRUCTURED_NON_TABULAR_TARGET_IDS;
  if (mode === 'text') return TEXT_TARGET_IDS;
  if (mode === 'binary') return BINARY_TARGET_IDS;
  return [];
}

function targetsFor(mode, sourceIsTable = false) {
  return targetIdsFor(mode, sourceIsTable).map((id) => TARGETS[id]).filter(Boolean).map(copyTarget);
}

function scalarForTable(value) {
  if (value === null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  throw new Error('Tabular conversion accepts only scalar record values, so nested values were not flattened or dropped.');
}

function recordsFromJson(value) {
  if (!Array.isArray(value) || value.length > MAX_DELIMITED_ROWS) throw new Error('CSV and TSV output requires a bounded top-level array of record objects.');
  const headers = [];
  const seen = Object.create(null);
  for (const record of value) {
    if (!isPlainRecord(record)) throw new Error('CSV and TSV output requires each array item to be a record object.');
    for (const key of Object.keys(record)) {
      if (!seen[key]) {
        if (headers.length >= MAX_DELIMITED_COLUMNS || key.length > MAX_KEY_CHARS) throw new Error('The structured records exceed the converter column limit.');
        seen[key] = true;
        headers.push(key);
      }
    }
  }
  for (const record of value) for (const key of headers) scalarForTable(Object.prototype.hasOwnProperty.call(record, key) ? record[key] : null);
  return { headers, records: value };
}

function tableEligible(value) {
  try {
    recordsFromJson(value);
    return true;
  } catch {
    return false;
  }
}

function escapeDelimited(value) {
  const text = String(value == null ? '' : value);
  return /["\n\r,\t]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function tableToDelimited(table, delimiter) {
  if (!table.headers.length) return '';
  const lines = [table.headers.map(escapeDelimited).join(delimiter)];
  for (const record of table.records) {
    lines.push(table.headers.map((header) => escapeDelimited(scalarForTable(Object.prototype.hasOwnProperty.call(record, header) ? record[header] : null))).join(delimiter));
  }
  return `${lines.join('\r\n')}\r\n`;
}

function yamlOutputScalar(value) {
  if (value === null) return 'null';
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  if (typeof value === 'string') return JSON.stringify(value);
  throw new Error('YAML-style output cannot silently flatten a nested value.');
}

function yamlStyle(value, depth = 0, indent = 0) {
  if (depth > MAX_JSON_DEPTH) throw new Error('YAML-style output exceeds the nesting limit.');
  const padding = ' '.repeat(indent);
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') return yamlOutputScalar(value);
  if (Array.isArray(value)) {
    if (!value.length) return '[]';
    if (value.length > MAX_DELIMITED_ROWS) throw new Error('YAML-style output exceeds the row limit.');
    return value.map((entry) => {
      if (entry === null || typeof entry === 'boolean' || typeof entry === 'number' || typeof entry === 'string') return `${padding}- ${yamlOutputScalar(entry)}`;
      return `${padding}-\n${yamlStyle(entry, depth + 1, indent + 2)}`;
    }).join('\n');
  }
  if (isPlainRecord(value)) {
    const keys = Object.keys(value);
    if (!keys.length) return '{}';
    if (keys.length > MAX_DELIMITED_COLUMNS) throw new Error('YAML-style output exceeds the key limit.');
    return keys.map((key) => {
      const entry = value[key];
      const quotedKey = JSON.stringify(key);
      if (entry === null || typeof entry === 'boolean' || typeof entry === 'number' || typeof entry === 'string') return `${padding}${quotedKey}: ${yamlOutputScalar(entry)}`;
      return `${padding}${quotedKey}:\n${yamlStyle(entry, depth + 1, indent + 2)}`;
    }).join('\n');
  }
  throw new Error('YAML-style output received an unsupported structured value.');
}

function outputFrom(classification, targetId, bytes) {
  const target = TARGETS[targetId];
  if (!target || !targetIdsFor(classification.mode, classification.tableEligible === true).includes(targetId)) throw new Error('The requested converter target is not available for the selected local source.');
  if (targetId === 'base64') return Buffer.from(bytes.toString('base64'), 'utf8');
  if (targetId === 'hex') return Buffer.from(bytes.toString('hex'), 'utf8');
  let text;
  try {
    text = decodeUtf8(bytes);
  } catch {
    throw new Error('The requested output requires validated UTF-8 text.');
  }
  if (!likelyTextString(text)) throw new Error('The requested output requires validated printable UTF-8 text.');
  if (targetId === 'text') return Buffer.from(text, 'utf8');
  const hasStructuredValue = Object.prototype.hasOwnProperty.call(classification, 'value');
  if (!hasStructuredValue && !classification.table) throw new Error('Structured output requires validated JSON, CSV, TSV, or YAML-style data.');
  const value = hasStructuredValue ? classification.value : classification.table.records;
  if (targetId === 'json') return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
  if (targetId === 'yaml') return Buffer.from(`${yamlStyle(value)}\n`, 'utf8');
  const table = classification.table || recordsFromJson(classification.value);
  return Buffer.from(tableToDelimited(table, targetId === 'tsv' ? '\t' : ','), 'utf8');
}

function validatesOutput(targetId, output, sourceBytes) {
  try {
    const text = decodeUtf8(output);
    if (targetId === 'text') return likelyTextString(text);
    if (targetId === 'json') return valueWithinBounds(JSON.parse(text));
    if (targetId === 'csv') {
      parseDelimited(text, ',');
      return true;
    }
    if (targetId === 'tsv') {
      parseDelimited(text, '\t');
      return true;
    }
    if (targetId === 'yaml') return valueWithinBounds(parseLimitedYaml(text));
    if (targetId === 'base64') {
      if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(text)) return false;
      return Buffer.from(text, 'base64').equals(sourceBytes);
    }
    if (targetId === 'hex') return /^[a-f0-9]*$/.test(text) && text.length % 2 === 0 && Buffer.from(text, 'hex').equals(sourceBytes);
  } catch {
    return false;
  }
  return false;
}

function normalizeHistoryItem(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const id = boundedString(value.id, 128);
  const state = boundedString(value.state, 32);
  const fileName = safeFileName(value.fileName || value.sourceName);
  const createdAt = boundedString(value.createdAt, 64);
  const bytes = Number(value.bytes);
  const descriptor = copyDescriptor(value.descriptor);
  const targetId = Object.prototype.hasOwnProperty.call(TARGETS, value.targetId) ? value.targetId : '';
  const outputFileName = value.outputFileName ? safeFileName(value.outputFileName) : '';
  if (!id || !HISTORY_STATES.has(state) || !createdAt || !Number.isInteger(bytes) || bytes < 0 || bytes > MAX_SOURCE_BYTES) return null;
  return {
    id,
    state,
    fileName,
    bytes,
    descriptor,
    targetId,
    outputFileName,
    createdAt,
    completedAt: boundedString(value.completedAt, 64),
    detail: boundedString(value.detail, 512, 'A local converter result record is available without a source or destination path.')
  };
}

function migrateLegacyItem(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const id = boundedString(value.id, 128);
  const fileName = safeFileName(value.fileName || value.sourcePath);
  const createdAt = boundedString(value.createdAt, 64);
  const bytes = Number(value.bytes);
  if (!id || !createdAt || !Number.isInteger(bytes) || bytes < 0 || bytes > MAX_SOURCE_BYTES) return null;
  return {
    id,
    state: 'legacy-inspection',
    fileName,
    bytes,
    descriptor: copyDescriptor(value.descriptor),
    targetId: '',
    outputFileName: '',
    createdAt,
    completedAt: '',
    detail: 'A legacy inspection record was retained without its source location. Choose the local file again before conversion.'
  };
}

function publicHistoryItem(item) {
  const target = TARGETS[item.targetId];
  return {
    id: item.id,
    state: item.state,
    fileName: item.fileName,
    bytes: item.bytes,
    descriptor: copyDescriptor(item.descriptor),
    targetId: item.targetId,
    targetLabel: target?.label || '',
    outputFileName: item.outputFileName,
    createdAt: item.createdAt,
    completedAt: item.completedAt,
    detail: item.detail
  };
}

function publicActive(item) {
  if (!item) return null;
  return {
    id: item.id,
    state: item.state,
    fileName: item.fileName,
    bytes: item.bytes,
    descriptor: copyDescriptor(item.descriptor),
    availableTargets: targetsFor(item.mode, item.tableEligible === true),
    selectedAt: item.selectedAt,
    detail: item.detail
  };
}

function cancelledError() {
  const error = new Error('Conversion cancelled before output was written.');
  error.code = 'CONVERSION_CANCELLED';
  return error;
}

class FileConverter {
  constructor(options = {}) {
    const dataDir = boundedString(options.dataDir, MAX_SOURCE_PATH_LENGTH);
    if (!dataDir) throw new Error('A private converter data directory is required.');
    this.dataDir = path.resolve(dataDir);
    this.queueFile = path.join(this.dataDir, 'converter-queue.json');
    this.onEvent = typeof options.onEvent === 'function' ? options.onEvent : () => {};
    this.queue = [];
    this.active = null;
    this.state = 'starting';
    this.detail = 'The local converter is starting.';
    this.writeChain = Promise.resolve();
  }

  async initialize() {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
      const loaded = await this.readQueue();
      this.queue = loaded.items;
      if (loaded.migrated) await this.persistQueue();
      this.state = 'ready';
      this.detail = 'The local converter is ready. Bounded text, structured-data, and binary-encoding routes are available; unbundled format adapters remain unavailable.';
    } catch {
      this.queue = [];
      this.active = null;
      this.state = 'unavailable';
      this.detail = 'The local converter record store is unavailable. New conversion records cannot be created until private app storage is available.';
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
        exactBoundary: 'The app reads only a selected local regular file within bounded limits, uses bundled in-process parsers and encoders, writes a new user-approved local destination atomically, and never retains source or destination paths in persistent converter records.'
      },
      limits: {
        maxSourceBytes: MAX_SOURCE_BYTES,
        maxConvertibleSourceBytes: MAX_CONVERTIBLE_SOURCE_BYTES,
        maxOutputBytes: MAX_OUTPUT_BYTES,
        sniffBytes: MAX_SNIFF_BYTES,
        maxQueueItems: MAX_QUEUE_ITEMS
      },
      categories: categoryCatalog(),
      active: publicActive(this.active),
      queue: this.queue.map(publicHistoryItem)
    };
  }

  async inspectSource(sourcePath) {
    this.requireReady();
    if (this.active?.state === 'converting') throw new Error('Wait for the current local conversion to finish or cancel it before choosing another source.');
    const inspection = await this.inspectFile(sourcePath);
    this.active = {
      id: crypto.randomUUID(),
      state: inspection.mode === 'oversized' ? 'unavailable' : 'ready',
      sourcePath: inspection.sourcePath,
      fileName: inspection.fileName,
      bytes: inspection.bytes,
      modifiedMs: inspection.modifiedMs,
      descriptor: inspection.descriptor,
      mode: inspection.mode,
      tableEligible: inspection.tableEligible === true,
      selectedAt: new Date().toISOString(),
      detail: inspection.detail,
      cancelRequested: false
    };
    this.onEvent({ type: 'file-converter', state: this.active.state, message: 'A local converter source was inspected. No conversion has started.' });
    return { source: publicActive(this.active), snapshot: this.snapshot() };
  }

  targetPlan(id, targetId) {
    this.requireReady();
    const active = this.requireActive(id);
    if (active.state === 'converting') throw new Error('The selected local source is already converting.');
    const target = this.requireAvailableTarget(active, targetId);
    return {
      targetId: target.id,
      label: target.label,
      defaultFileName: `${safeFileStem(active.fileName)}.${target.extension}`,
      filterExtension: target.filterExtension,
      disclosure: target.disclosure
    };
  }

  async convert(id, targetId, destinationPath) {
    this.requireReady();
    const active = this.requireActive(id);
    const target = this.requireAvailableTarget(active, targetId);
    if (active.state === 'converting') throw new Error('The selected local source is already converting.');
    const destination = await this.validateDestination(destinationPath, active.sourcePath);
    active.state = 'converting';
    active.cancelRequested = false;
    active.detail = `Preparing a bounded local ${target.label} output. The source file will not be changed.`;
    this.onEvent({ type: 'file-converter', state: 'converting', message: 'A bounded local conversion is in progress.' });
    try {
      this.throwIfCancelled(active);
      const bytes = await this.readCurrentSource(active);
      this.throwIfCancelled(active);
      const classification = classifyBytes(bytes, sniffSource(bytes.subarray(0, Math.min(bytes.length, MAX_SNIFF_BYTES))));
      if (!targetIdsFor(classification.mode, classification.tableEligible === true).includes(target.id)) throw new Error('The source no longer meets the selected converter target requirements.');
      const output = outputFrom(classification, target.id, bytes);
      if (!Buffer.isBuffer(output) || output.length > MAX_OUTPUT_BYTES) throw new Error('The converted output exceeds the converter safety limit.');
      this.throwIfCancelled(active);
      await this.writeDestination(destination, output, (reopened) => validatesOutput(target.id, reopened, bytes));
      const completedAt = new Date().toISOString();
      const record = await this.recordResult({
        state: 'converted',
        fileName: active.fileName,
        bytes: active.bytes,
        descriptor: classification.descriptor,
        targetId: target.id,
        outputFileName: safeFileName(destination),
        createdAt: active.selectedAt,
        completedAt,
        detail: `A new local ${target.label} output was written after complete bounded validation. The source file was not changed; source and destination paths were not retained.`
      });
      active.state = 'converted';
      active.descriptor = classification.descriptor;
      active.mode = classification.mode;
      active.tableEligible = classification.tableEligible === true;
      active.detail = `A new local ${target.label} output was written. The source file was not changed, and no full path was retained in the converter record.`;
      this.onEvent({ type: 'file-converter', state: 'converted', message: 'A bounded local converter output was written.' });
      return { conversion: publicHistoryItem(record), snapshot: this.snapshot() };
    } catch (error) {
      const cancelled = error?.code === 'CONVERSION_CANCELLED';
      const record = await this.recordResult({
        state: cancelled ? 'cancelled' : 'failed',
        fileName: active.fileName,
        bytes: active.bytes,
        descriptor: active.descriptor,
        targetId: target.id,
        outputFileName: '',
        createdAt: active.selectedAt,
        completedAt: new Date().toISOString(),
        detail: cancelled
          ? 'The local conversion was cancelled before any output was written. The source file was not changed.'
          : 'The local conversion did not produce output within the declared format and safety bounds. The source file was not changed.'
      });
      active.state = 'ready';
      active.cancelRequested = false;
      active.detail = cancelled
        ? 'The local conversion was cancelled before output was written. Choose an available output when ready.'
        : 'The last local conversion did not produce output. The source file was not changed; choose an available output to try again.';
      this.onEvent({ type: 'file-converter', state: record.state, message: cancelled ? 'A local conversion was cancelled before output was written.' : 'A local conversion did not produce output.' });
      return { conversion: publicHistoryItem(record), snapshot: this.snapshot() };
    }
  }

  cancel(id) {
    this.requireReady();
    const active = this.requireActive(id);
    if (active.state !== 'converting') return this.snapshot();
    active.cancelRequested = true;
    active.detail = 'Cancellation was requested. The converter will stop before writing output when the current bounded step yields.';
    this.onEvent({ type: 'file-converter', state: 'cancelling', message: 'A local conversion cancellation was requested.' });
    return this.snapshot();
  }

  requireReady() {
    if (this.state !== 'ready') throw new Error(this.detail || 'The local converter is unavailable.');
  }

  requireActive(id) {
    if (!this.active || typeof id !== 'string' || id !== this.active.id) throw new Error('Choose a current local converter source through the app file picker.');
    return this.active;
  }

  requireAvailableTarget(active, targetId) {
    if (typeof targetId !== 'string' || !Object.prototype.hasOwnProperty.call(TARGETS, targetId) || !targetIdsFor(active.mode, active.tableEligible === true).includes(targetId)) {
      throw new Error('Choose an available converter target for the selected local source.');
    }
    return TARGETS[targetId];
  }

  throwIfCancelled(active) {
    if (active.cancelRequested) throw cancelledError();
  }

  async inspectFile(value) {
    const sourcePath = await this.validateSourcePath(value);
    const stat = await this.localFileStat(sourcePath);
    const prefix = await this.readPrefix(sourcePath, stat.size);
    const sniff = sniffSource(prefix);
    if (stat.size > MAX_CONVERTIBLE_SOURCE_BYTES) {
      return {
        sourcePath,
        fileName: safeFileName(sourcePath),
        bytes: stat.size,
        modifiedMs: Math.trunc(stat.mtimeMs),
        descriptor: sniff,
        mode: 'oversized',
        tableEligible: false,
        detail: `This file exceeds the ${MAX_CONVERTIBLE_SOURCE_BYTES.toLocaleString()}-byte in-process conversion limit. It was classified from a bounded prefix only; no output route is enabled.`
      };
    }
    const bytes = await this.readBoundedSource(sourcePath, stat);
    const classification = classifyBytes(bytes, sniff);
    return {
      sourcePath,
      fileName: safeFileName(sourcePath),
      bytes: stat.size,
      modifiedMs: Math.trunc(stat.mtimeMs),
      descriptor: classification.descriptor,
      mode: classification.mode,
      tableEligible: classification.tableEligible === true,
      detail: classification.detail
    };
  }

  async validateSourcePath(value) {
    if (typeof value !== 'string' || !value.trim() || value.length > MAX_SOURCE_PATH_LENGTH || !path.isAbsolute(value)) {
      throw new Error('Choose one local file through the app file picker.');
    }
    if (/^(?:\\\\|\/\/|file:)/i.test(value)) throw new Error('Choose a direct local file rather than a network or URL source.');
    return path.resolve(value);
  }

  async localFileStat(sourcePath) {
    const entry = await fs.lstat(sourcePath).catch(() => null);
    if (!entry || entry.isSymbolicLink()) throw new Error('Choose a direct local regular file rather than a link or unavailable source.');
    const stat = await fs.stat(sourcePath).catch(() => null);
    if (!stat || !stat.isFile()) throw new Error('The selected local item is not a regular file.');
    if (!Number.isSafeInteger(stat.size) || stat.size < 0 || stat.size > MAX_SOURCE_BYTES) {
      throw new Error(`The selected file exceeds the ${MAX_SOURCE_BYTES.toLocaleString()}-byte source safety limit.`);
    }
    return stat;
  }

  async readPrefix(sourcePath, size) {
    const length = Math.max(0, Math.min(Number(size) || 0, MAX_SNIFF_BYTES));
    if (!length) return Buffer.alloc(0);
    let handle;
    try {
      handle = await fs.open(sourcePath, 'r');
    } catch {
      throw new Error('The selected local source could not be opened for bounded inspection.');
    }
    try {
      const buffer = Buffer.alloc(length);
      let result;
      try {
        result = await handle.read(buffer, 0, length, 0);
      } catch {
        throw new Error('The selected local source could not be read for bounded inspection.');
      }
      return buffer.subarray(0, result.bytesRead);
    } finally {
      await handle.close().catch(() => {});
    }
  }

  async readBoundedSource(sourcePath, expectedStat) {
    const before = await this.localFileStat(sourcePath);
    if (before.size !== expectedStat.size || Math.trunc(before.mtimeMs) !== Math.trunc(expectedStat.mtimeMs) || before.size > MAX_CONVERTIBLE_SOURCE_BYTES) {
      throw new Error('The selected local source changed or exceeds the conversion safety limit. Choose it again before conversion.');
    }
    let bytes;
    try {
      bytes = await fs.readFile(sourcePath);
    } catch {
      throw new Error('The selected local source could not be read within the converter safety bounds.');
    }
    const after = await this.localFileStat(sourcePath);
    if (bytes.length !== before.size || after.size !== before.size || Math.trunc(after.mtimeMs) !== Math.trunc(before.mtimeMs)) {
      throw new Error('The selected local source changed during the bounded read. Choose it again before conversion.');
    }
    return bytes;
  }

  async readCurrentSource(active) {
    const expectedStat = { size: active.bytes, mtimeMs: active.modifiedMs };
    return this.readBoundedSource(active.sourcePath, expectedStat);
  }

  async validateDestination(value, sourcePath) {
    if (typeof value !== 'string' || !value.trim() || value.length > MAX_SOURCE_PATH_LENGTH || !path.isAbsolute(value)) {
      throw new Error('Choose a new local output destination through the app save dialog.');
    }
    if (/^(?:\\\\|\/\/|file:)/i.test(value)) throw new Error('Choose a direct local output destination rather than a network or URL path.');
    const destination = path.resolve(value);
    if (destination === path.resolve(sourcePath)) throw new Error('Choose a new output name; the selected source file is never overwritten.');
    const parent = path.dirname(destination);
    const parentEntry = await fs.lstat(parent).catch(() => null);
    if (!parentEntry || parentEntry.isSymbolicLink() || !parentEntry.isDirectory()) throw new Error('Choose an existing direct local output folder.');
    const existing = await fs.lstat(destination).catch((error) => error?.code === 'ENOENT' ? null : Promise.reject(error));
    if (existing) throw new Error('Choose a new output name. Existing files are not overwritten by this converter.');
    return destination;
  }

  async writeDestination(destination, bytes, validator) {
    const parent = path.dirname(destination);
    const temporary = path.join(parent, `.${safeFileName(destination)}.${crypto.randomUUID()}.tmp`);
    try {
      await fs.writeFile(temporary, bytes, { flag: 'wx', mode: 0o600 });
      const stat = await fs.stat(temporary);
      if (!stat.isFile() || stat.size !== bytes.length) throw new Error('The temporary output could not be validated.');
      const temporaryContents = await fs.readFile(temporary);
      if (!temporaryContents.equals(bytes) || typeof validator !== 'function' || !validator(temporaryContents)) throw new Error('The temporary output did not pass its declared local validator.');
      const existing = await fs.lstat(destination).catch((error) => error?.code === 'ENOENT' ? null : Promise.reject(error));
      if (existing) throw new Error('The selected output name became occupied. Existing files are never overwritten.');
      await fs.rename(temporary, destination);
      const written = await fs.stat(destination);
      if (!written.isFile() || written.size !== bytes.length) throw new Error('The new local output could not be validated after the atomic write.');
      const reopened = await fs.readFile(destination);
      if (!reopened.equals(bytes) || !validator(reopened)) throw new Error('The new local output did not pass its declared validator after the atomic write.');
    } finally {
      await fs.rm(temporary, { force: true }).catch(() => {});
    }
  }

  async recordResult(value) {
    const record = normalizeHistoryItem({ id: crypto.randomUUID(), ...value });
    if (!record) throw new Error('The local converter could not record a bounded result.');
    const previous = this.queue;
    this.queue = [record, ...this.queue].slice(0, MAX_QUEUE_ITEMS);
    try {
      await this.persistQueue();
    } catch {
      this.queue = previous;
      this.state = 'unavailable';
      this.detail = 'The local converter record store became unavailable after the conversion result. The source file was not changed.';
    }
    return record;
  }

  async readQueue() {
    let stats;
    try {
      stats = await fs.stat(this.queueFile);
    } catch (error) {
      if (error?.code === 'ENOENT') return { items: [], migrated: false };
      throw error;
    }
    if (!stats.isFile() || stats.size > MAX_QUEUE_RECORD_BYTES) throw new Error('The persisted converter record store is malformed or exceeds its bounded size.');
    const raw = await fs.readFile(this.queueFile, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !Array.isArray(parsed.items) || parsed.items.length > MAX_QUEUE_ITEMS) {
      throw new Error('The persisted converter record store uses an unsupported schema.');
    }
    if (parsed.schemaVersion === QUEUE_SCHEMA_VERSION) {
      const items = parsed.items.map(normalizeHistoryItem);
      if (items.some((item) => !item)) throw new Error('The persisted converter record store contains an invalid item.');
      return { items, migrated: false };
    }
    if (parsed.schemaVersion === 1) {
      const items = parsed.items.map(migrateLegacyItem);
      if (items.some((item) => !item)) throw new Error('The legacy converter inspection record contains an invalid item.');
      return { items, migrated: true };
    }
    throw new Error('The persisted converter record store uses an unsupported schema.');
  }

  async persistQueue() {
    const payload = JSON.stringify({ schemaVersion: QUEUE_SCHEMA_VERSION, savedAt: new Date().toISOString(), items: this.queue });
    if (Buffer.byteLength(payload, 'utf8') > MAX_QUEUE_RECORD_BYTES) throw new Error('The converter record store exceeds its bounded local size.');
    const write = async () => {
      const tempFile = path.join(this.dataDir, `.converter-records-${crypto.randomUUID()}.tmp`);
      try {
        await fs.writeFile(tempFile, payload, { encoding: 'utf8', mode: 0o600 });
        await fs.rename(tempFile, this.queueFile);
      } finally {
        await fs.rm(tempFile, { force: true }).catch(() => {});
      }
    };
    const queued = this.writeChain.then(write);
    this.writeChain = queued.catch(() => {});
    return queued;
  }
}

module.exports = {
  ADAPTERS,
  CATEGORIES,
  FileConverter,
  MAX_CONVERTIBLE_SOURCE_BYTES,
  MAX_OUTPUT_BYTES,
  MAX_SNIFF_BYTES,
  MAX_SOURCE_BYTES,
  QUEUE_SCHEMA_VERSION,
  sniffSource
};
