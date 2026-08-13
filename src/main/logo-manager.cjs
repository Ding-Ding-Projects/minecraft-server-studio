'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const LOGO_SETTINGS_VERSION = 1;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_IMAGE_WIDTH = 4096;
const MAX_IMAGE_HEIGHT = 4096;
const MAX_IMAGE_PIXELS = 16 * 1024 * 1024;
const MAX_CUSTOM_DATA_URL_LENGTH = Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 64;

const PRESETS = Object.freeze([
  Object.freeze({ id: 'studio-aqua', mark: 'MS', theme: 'aqua' }),
  Object.freeze({ id: 'server-slate', mark: 'SV', theme: 'slate' }),
  Object.freeze({ id: 'world-spruce', mark: 'WL', theme: 'spruce' })
]);
const PRESET_IDS = new Set(PRESETS.map((preset) => preset.id));
const IMAGE_MIME_TYPES = Object.freeze({ png: 'image/png', jpeg: 'image/jpeg' });
const IMAGE_EXTENSIONS = Object.freeze({ png: 'png', jpeg: 'jpg' });
const FIT_MODES = new Set(['contain', 'cover', 'fill']);
const BACKGROUND_MODES = new Set(['transparent', 'color']);

function logoError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function isPlainRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function assertExactKeys(value, keys, message) {
  if (!isPlainRecord(value)) throw logoError('LOGO_INVALID_RECORD', message);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw logoError('LOGO_INVALID_RECORD', message);
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function normalizeAbsolutePath(value, label) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) throw logoError('LOGO_INVALID_PATH', `${label} must be an absolute path.`);
  return path.normalize(value);
}

function normalizeUnitPercent(value, label) {
  if (!Number.isFinite(value) || value < 0 || value > 100) throw logoError('LOGO_INVALID_VALUE', `${label} must be a number from 0 through 100.`);
  return Math.round(value * 100) / 100;
}

function normalizeZoom(value) {
  if (!Number.isFinite(value) || value < 1 || value > 3) throw logoError('LOGO_INVALID_VALUE', 'Logo zoom must be a number from 1 through 3.');
  return Math.round(value * 100) / 100;
}

function normalizeColor(value) {
  if (typeof value !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(value)) throw logoError('LOGO_INVALID_VALUE', 'Logo background color must be a six-digit hexadecimal color.');
  return value.toLowerCase();
}

function normalizePresentation(value) {
  assertExactKeys(value, ['fit', 'crop', 'focalPoint', 'background'], 'Logo presentation settings are invalid.');
  if (!FIT_MODES.has(value.fit)) throw logoError('LOGO_INVALID_VALUE', 'Logo fit mode is invalid.');
  assertExactKeys(value.crop, ['x', 'y', 'zoom'], 'Logo crop settings are invalid.');
  assertExactKeys(value.focalPoint, ['x', 'y'], 'Logo focal-point settings are invalid.');
  assertExactKeys(value.background, ['mode', 'color'], 'Logo background settings are invalid.');
  if (!BACKGROUND_MODES.has(value.background.mode)) throw logoError('LOGO_INVALID_VALUE', 'Logo background mode is invalid.');
  return {
    fit: value.fit,
    crop: {
      x: normalizeUnitPercent(value.crop.x, 'Logo crop horizontal position'),
      y: normalizeUnitPercent(value.crop.y, 'Logo crop vertical position'),
      zoom: normalizeZoom(value.crop.zoom)
    },
    focalPoint: {
      x: normalizeUnitPercent(value.focalPoint.x, 'Logo focal-point horizontal position'),
      y: normalizeUnitPercent(value.focalPoint.y, 'Logo focal-point vertical position')
    },
    background: {
      mode: value.background.mode,
      color: normalizeColor(value.background.color)
    }
  };
}

function defaultPresentation() {
  return {
    fit: 'contain',
    crop: { x: 50, y: 50, zoom: 1 },
    focalPoint: { x: 50, y: 50 },
    background: { mode: 'transparent', color: '#10131a' }
  };
}

function defaultSettings() {
  return {
    version: LOGO_SETTINGS_VERSION,
    source: { kind: 'preset', presetId: 'studio-aqua' },
    presentation: defaultPresentation()
  };
}

function normalizeSha256(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw logoError('LOGO_INVALID_RECORD', 'Logo cache metadata contains an invalid SHA-256 value.');
  return value;
}

function normalizeImageFormat(value) {
  if (value !== 'png' && value !== 'jpeg') throw logoError('LOGO_INVALID_RECORD', 'Logo cache metadata contains an unsupported image format.');
  return value;
}

function normalizeDimension(value, label) {
  if (!Number.isInteger(value) || value < 1 || value > MAX_IMAGE_WIDTH) throw logoError('LOGO_INVALID_RECORD', `${label} is invalid.`);
  return value;
}

function normalizeByteCount(value) {
  if (!Number.isInteger(value) || value < 1 || value > MAX_IMAGE_BYTES) throw logoError('LOGO_INVALID_RECORD', 'Logo cache metadata contains an invalid byte count.');
  return value;
}

function normalizeCustomAsset(value) {
  assertExactKeys(value, ['sha256', 'format', 'width', 'height', 'bytes'], 'Logo cache metadata is invalid.');
  const width = normalizeDimension(value.width, 'Logo width');
  const height = normalizeDimension(value.height, 'Logo height');
  if (width * height > MAX_IMAGE_PIXELS) throw logoError('LOGO_INVALID_RECORD', 'Logo cache metadata exceeds the supported pixel limit.');
  return {
    sha256: normalizeSha256(value.sha256),
    format: normalizeImageFormat(value.format),
    width,
    height,
    bytes: normalizeByteCount(value.bytes)
  };
}

function normalizeSource(value) {
  if (!isPlainRecord(value) || typeof value.kind !== 'string') throw logoError('LOGO_INVALID_RECORD', 'Logo source settings are invalid.');
  if (value.kind === 'preset') {
    assertExactKeys(value, ['kind', 'presetId'], 'Preset logo settings are invalid.');
    if (!PRESET_IDS.has(value.presetId)) throw logoError('LOGO_INVALID_RECORD', 'Logo settings reference an unknown shipped preset.');
    return { kind: 'preset', presetId: value.presetId };
  }
  if (value.kind === 'custom') {
    assertExactKeys(value, ['kind', 'asset'], 'Custom logo settings are invalid.');
    return { kind: 'custom', asset: normalizeCustomAsset(value.asset) };
  }
  throw logoError('LOGO_INVALID_RECORD', 'Logo settings contain an unsupported source type.');
}

function normalizeSettings(value) {
  assertExactKeys(value, ['version', 'source', 'presentation'], 'Logo settings are invalid.');
  if (value.version !== LOGO_SETTINGS_VERSION) throw logoError('LOGO_UNSUPPORTED_VERSION', 'Logo settings use an unsupported version.');
  return {
    version: LOGO_SETTINGS_VERSION,
    source: normalizeSource(value.source),
    presentation: normalizePresentation(value.presentation)
  };
}

function sameSettings(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function insideDirectory(directory, candidate) {
  const relative = path.relative(directory, candidate);
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function assetPath(cacheDirectory, asset) {
  const candidate = path.join(cacheDirectory, `${asset.sha256}.${IMAGE_EXTENSIONS[asset.format]}`);
  if (!insideDirectory(cacheDirectory, candidate)) throw logoError('LOGO_INVALID_PATH', 'Logo cache path is invalid.');
  return candidate;
}

function isPng(buffer) {
  return buffer.length >= 24
    && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
}

function isJpeg(buffer) {
  return buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
}

function boundedDimensions(width, height, label) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) throw logoError('LOGO_INVALID_IMAGE', `${label} has invalid dimensions.`);
  if (width > MAX_IMAGE_WIDTH || height > MAX_IMAGE_HEIGHT || width * height > MAX_IMAGE_PIXELS) {
    throw logoError('LOGO_IMAGE_LIMIT', `${label} exceeds the supported ${MAX_IMAGE_WIDTH}px dimension or ${MAX_IMAGE_PIXELS.toLocaleString('en-US')} pixel limit.`);
  }
  return { width, height };
}

function parsePng(buffer) {
  if (!isPng(buffer)) throw logoError('LOGO_INVALID_IMAGE', 'The selected file is not a PNG image.');
  let offset = 8;
  let sawHeader = false;
  let sawEnd = false;
  let dimensions = null;
  while (offset < buffer.length) {
    if (offset + 12 > buffer.length) throw logoError('LOGO_INVALID_IMAGE', 'The PNG image is truncated.');
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const crcEnd = dataEnd + 4;
    if (dataEnd < dataStart || crcEnd > buffer.length) throw logoError('LOGO_INVALID_IMAGE', 'The PNG image has an invalid chunk length.');
    if (!sawHeader) {
      if (type !== 'IHDR' || length !== 13) throw logoError('LOGO_INVALID_IMAGE', 'The PNG image is missing a valid header.');
      dimensions = boundedDimensions(buffer.readUInt32BE(dataStart), buffer.readUInt32BE(dataStart + 4), 'The PNG image');
      sawHeader = true;
    }
    if (type === 'acTL' || type === 'fcTL' || type === 'fdAT') throw logoError('LOGO_ANIMATED_IMAGE', 'Animated PNG images are not supported for custom logos.');
    if (type === 'IEND') {
      if (length !== 0 || crcEnd !== buffer.length) throw logoError('LOGO_INVALID_IMAGE', 'The PNG image has an invalid ending.');
      sawEnd = true;
      break;
    }
    offset = crcEnd;
  }
  if (!sawHeader || !sawEnd || !dimensions) throw logoError('LOGO_INVALID_IMAGE', 'The PNG image is incomplete.');
  return { format: 'png', ...dimensions };
}

function parseJpeg(buffer) {
  if (!isJpeg(buffer)) throw logoError('LOGO_INVALID_IMAGE', 'The selected file is not a JPEG image.');
  let offset = 2;
  while (offset < buffer.length) {
    while (offset < buffer.length && buffer[offset] === 0xff) offset += 1;
    if (offset >= buffer.length) break;
    const marker = buffer[offset++];
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > buffer.length) throw logoError('LOGO_INVALID_IMAGE', 'The JPEG image is truncated.');
    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > buffer.length) throw logoError('LOGO_INVALID_IMAGE', 'The JPEG image has an invalid segment length.');
    const isFrame = (marker >= 0xc0 && marker <= 0xc3)
      || (marker >= 0xc5 && marker <= 0xc7)
      || (marker >= 0xc9 && marker <= 0xcb)
      || (marker >= 0xcd && marker <= 0xcf);
    if (isFrame) {
      if (segmentLength < 8) throw logoError('LOGO_INVALID_IMAGE', 'The JPEG image has an invalid frame header.');
      return {
        format: 'jpeg',
        ...boundedDimensions(buffer.readUInt16BE(offset + 3), buffer.readUInt16BE(offset + 5), 'The JPEG image')
      };
    }
    offset += segmentLength;
  }
  throw logoError('LOGO_INVALID_IMAGE', 'The JPEG image does not contain a supported frame.');
}

function detectImage(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw logoError('LOGO_INVALID_IMAGE', 'Choose a non-empty PNG or JPEG image.');
  if (buffer.length > MAX_IMAGE_BYTES) throw logoError('LOGO_IMAGE_LIMIT', `Custom logos must be ${MAX_IMAGE_BYTES / (1024 * 1024)} MiB or smaller.`);
  if (isPng(buffer)) return parsePng(buffer);
  if (isJpeg(buffer)) return parseJpeg(buffer);
  throw logoError('LOGO_UNSUPPORTED_IMAGE', 'Choose a PNG or JPEG image. File extensions alone are not accepted as image proof.');
}

function imageDataUrl(format, buffer) {
  const url = `data:${IMAGE_MIME_TYPES[format]};base64,${buffer.toString('base64')}`;
  if (url.length > MAX_CUSTOM_DATA_URL_LENGTH) throw logoError('LOGO_IMAGE_LIMIT', 'The custom logo is too large to display safely.');
  return url;
}

function nativeImageDimensions(nativeImage, buffer, header) {
  if (!nativeImage || typeof nativeImage.createFromBuffer !== 'function') {
    throw logoError('LOGO_DECODER_UNAVAILABLE', 'The packaged image decoder is unavailable, so the custom logo was not applied.');
  }
  let decoded;
  try {
    decoded = nativeImage.createFromBuffer(buffer);
  } catch {
    throw logoError('LOGO_INVALID_IMAGE', 'The selected image could not be decoded safely.');
  }
  if (!decoded || typeof decoded.isEmpty !== 'function' || decoded.isEmpty() || typeof decoded.getSize !== 'function') {
    throw logoError('LOGO_INVALID_IMAGE', 'The selected image could not be decoded safely.');
  }
  const size = decoded.getSize();
  const dimensions = boundedDimensions(Number(size?.width), Number(size?.height), 'The decoded image');
  return { ...header, ...dimensions };
}

class LogoManager {
  constructor(options = {}) {
    if (!isPlainRecord(options)) throw logoError('LOGO_INVALID_OPTIONS', 'Logo manager options are invalid.');
    const allowed = new Set(['dataDir', 'nativeImage']);
    for (const key of Object.keys(options)) {
      if (!allowed.has(key)) throw logoError('LOGO_INVALID_OPTIONS', 'Logo manager options are invalid.');
    }
    this.dataDir = normalizeAbsolutePath(options.dataDir, 'Logo data directory');
    this.cacheDirectory = path.join(this.dataDir, 'cache');
    this.settingsPath = path.join(this.dataDir, 'logo-settings.json');
    this.nativeImage = options.nativeImage;
    this.settings = defaultSettings();
    this.storageState = 'not-loaded';
    this.storageDetail = 'Logo settings have not been loaded.';
    this.cachedAsset = null;
    this.cacheState = 'not-loaded';
    this.cacheDetail = 'No custom logo is selected.';
  }

  async initialize() {
    await fs.mkdir(this.dataDir, { recursive: true });
    await fs.mkdir(this.cacheDirectory, { recursive: true });
    await this._loadSettings();
    await this._resolveCustomAsset();
    return this.snapshot();
  }

  async snapshot() {
    await this._resolveCustomAsset();
    const source = clone(this.settings.source);
    const activeSource = source.kind === 'custom' && this.cachedAsset
      ? { kind: 'custom', asset: clone(this.cachedAsset.metadata), dataUrl: this.cachedAsset.dataUrl }
      : { kind: 'preset', presetId: source.kind === 'preset' ? source.presetId : 'studio-aqua' };
    return deepFreeze({
      schemaVersion: LOGO_SETTINGS_VERSION,
      presets: PRESETS.map((preset) => ({ ...preset })),
      source,
      activeSource,
      presentation: clone(this.settings.presentation),
      storage: { state: this.storageState, detail: this.storageDetail },
      cache: {
        state: this.cacheState,
        detail: this.cacheDetail,
        customSelected: source.kind === 'custom',
        active: Boolean(this.cachedAsset)
      }
    });
  }

  async selectPreset(presetId) {
    if (typeof presetId !== 'string' || !PRESET_IDS.has(presetId)) throw logoError('LOGO_UNKNOWN_PRESET', 'Choose one of the shipped logo presets.');
    const previousAsset = this.settings.source.kind === 'custom' ? this.settings.source.asset : null;
    const next = {
      ...this.settings,
      source: { kind: 'preset', presetId }
    };
    await this._saveSettings(next);
    this.cachedAsset = null;
    this.cacheState = 'not-applicable';
    this.cacheDetail = 'A shipped preset is selected.';
    await this._removeCachedAsset(previousAsset);
    return this.snapshot();
  }

  async updatePresentation(presentation) {
    const next = {
      ...this.settings,
      presentation: normalizePresentation(presentation)
    };
    if (!sameSettings(next, this.settings)) await this._saveSettings(next);
    return this.snapshot();
  }

  async importFile(filePath) {
    const candidate = normalizeAbsolutePath(filePath, 'Selected logo path');
    let stat;
    try {
      stat = await fs.lstat(candidate);
    } catch {
      throw logoError('LOGO_READ_FAILED', 'The selected image could not be read. Choose the image again.');
    }
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1 || stat.size > MAX_IMAGE_BYTES) {
      throw logoError('LOGO_IMAGE_LIMIT', `Choose a regular PNG or JPEG file that is no larger than ${MAX_IMAGE_BYTES / (1024 * 1024)} MiB.`);
    }
    let bytes;
    try {
      bytes = await fs.readFile(candidate);
    } catch {
      throw logoError('LOGO_READ_FAILED', 'The selected image could not be read. Choose the image again.');
    }
    return this.importBuffer(bytes);
  }

  async importBuffer(bytes) {
    const header = detectImage(bytes);
    const decoded = nativeImageDimensions(this.nativeImage, bytes, header);
    const asset = {
      sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
      format: decoded.format,
      width: decoded.width,
      height: decoded.height,
      bytes: bytes.length
    };
    await this._storeAsset(asset, bytes);
    const previousAsset = this.settings.source.kind === 'custom' ? this.settings.source.asset : null;
    const next = {
      ...this.settings,
      source: { kind: 'custom', asset }
    };
    await this._saveSettings(next);
    this.cachedAsset = { metadata: asset, dataUrl: imageDataUrl(asset.format, bytes) };
    this.cacheState = 'ready';
    this.cacheDetail = 'The validated local raster logo is active.';
    if (!previousAsset || previousAsset.sha256 !== asset.sha256 || previousAsset.format !== asset.format) {
      await this._removeCachedAsset(previousAsset);
    }
    return this.snapshot();
  }

  async reset() {
    const previousAsset = this.settings.source.kind === 'custom' ? this.settings.source.asset : null;
    await this._saveSettings(defaultSettings());
    this.cachedAsset = null;
    this.cacheState = 'not-applicable';
    this.cacheDetail = 'The shipped Studio Aqua preset is active.';
    await this._removeCachedAsset(previousAsset);
    return this.snapshot();
  }

  async _loadSettings() {
    let raw;
    try {
      const stat = await fs.lstat(this.settingsPath);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 64 * 1024) throw logoError('LOGO_INVALID_RECORD', 'Logo settings are invalid.');
      raw = await fs.readFile(this.settingsPath, 'utf8');
    } catch (error) {
      if (error?.code === 'ENOENT') {
        this.settings = defaultSettings();
        this.storageState = 'missing';
        this.storageDetail = 'No saved logo settings were found; the shipped Studio Aqua preset is active.';
        return;
      }
      if (error?.code === 'LOGO_INVALID_RECORD') {
        this.settings = defaultSettings();
        this.storageState = 'invalid';
        this.storageDetail = 'Saved logo settings are invalid or unsupported; the shipped Studio Aqua preset is active until you save a new selection.';
        return;
      }
      this.settings = defaultSettings();
      this.storageState = 'unavailable';
      this.storageDetail = 'Logo settings could not be read; the shipped Studio Aqua preset is active.';
      return;
    }
    try {
      if (Buffer.byteLength(raw, 'utf8') > 64 * 1024) throw logoError('LOGO_INVALID_RECORD', 'Logo settings exceed the supported size.');
      this.settings = normalizeSettings(JSON.parse(raw));
      this.storageState = 'ready';
      this.storageDetail = 'Validated app-private logo settings are active.';
    } catch {
      this.settings = defaultSettings();
      this.storageState = 'invalid';
      this.storageDetail = 'Saved logo settings are invalid or unsupported; the shipped Studio Aqua preset is active until you save a new selection.';
    }
  }

  async _resolveCustomAsset() {
    if (this.settings.source.kind !== 'custom') {
      this.cachedAsset = null;
      if (this.cacheState === 'not-loaded') {
        this.cacheState = 'not-applicable';
        this.cacheDetail = 'A shipped preset is selected.';
      }
      return;
    }
    const metadata = this.settings.source.asset;
    const candidate = assetPath(this.cacheDirectory, metadata);
    let bytes;
    try {
      const stat = await fs.lstat(candidate);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== metadata.bytes || stat.size > MAX_IMAGE_BYTES) throw logoError('LOGO_CACHE_INVALID', 'The local custom logo cache is unavailable.');
      bytes = await fs.readFile(candidate);
    } catch {
      this.cachedAsset = null;
      this.cacheState = 'missing';
      this.cacheDetail = 'The saved custom logo cache is unavailable; the shipped Studio Aqua preset is being shown.';
      return;
    }
    try {
      const header = detectImage(bytes);
      const decoded = nativeImageDimensions(this.nativeImage, bytes, header);
      const actualHash = crypto.createHash('sha256').update(bytes).digest('hex');
      if (actualHash !== metadata.sha256 || decoded.format !== metadata.format || decoded.width !== metadata.width || decoded.height !== metadata.height || bytes.length !== metadata.bytes) {
        throw logoError('LOGO_CACHE_INVALID', 'The local custom logo cache does not match its validated metadata.');
      }
      this.cachedAsset = { metadata: clone(metadata), dataUrl: imageDataUrl(metadata.format, bytes) };
      this.cacheState = 'ready';
      this.cacheDetail = 'The validated local raster logo is active.';
    } catch {
      this.cachedAsset = null;
      this.cacheState = 'invalid';
      this.cacheDetail = 'The saved custom logo cache could not be revalidated; the shipped Studio Aqua preset is being shown.';
    }
  }

  async _storeAsset(asset, bytes) {
    const destination = assetPath(this.cacheDirectory, asset);
    await fs.mkdir(this.cacheDirectory, { recursive: true });
    try {
      const existingStat = await fs.lstat(destination);
      if (!existingStat.isFile() || existingStat.isSymbolicLink() || existingStat.size > MAX_IMAGE_BYTES) throw logoError('LOGO_CACHE_INVALID', 'The existing cache entry is invalid.');
      const existing = await fs.readFile(destination);
      if (existing.length === bytes.length && crypto.createHash('sha256').update(existing).digest('hex') === asset.sha256) return;
    } catch {
      // A missing cache entry is created below. No source path or image content is logged.
    }
    const temporary = path.join(this.cacheDirectory, `.${asset.sha256}.${crypto.randomUUID()}.tmp`);
    if (!insideDirectory(this.cacheDirectory, temporary)) throw logoError('LOGO_INVALID_PATH', 'Logo cache staging path is invalid.');
    try {
      await fs.writeFile(temporary, bytes, { mode: 0o600, flag: 'wx' });
      await fs.rename(temporary, destination);
    } catch {
      throw logoError('LOGO_CACHE_WRITE_FAILED', 'The validated image could not be stored in the app-private logo cache.');
    } finally {
      await fs.rm(temporary, { force: true }).catch(() => {});
    }
  }

  async _saveSettings(value) {
    const normalized = normalizeSettings(value);
    await fs.mkdir(this.dataDir, { recursive: true });
    const serialized = JSON.stringify(normalized, null, 2);
    const temporary = path.join(this.dataDir, `.logo-settings.${crypto.randomUUID()}.tmp`);
    if (!insideDirectory(this.dataDir, temporary)) throw logoError('LOGO_INVALID_PATH', 'Logo settings staging path is invalid.');
    try {
      await fs.writeFile(temporary, serialized, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      await fs.rename(temporary, this.settingsPath);
    } catch {
      throw logoError('LOGO_SETTINGS_WRITE_FAILED', 'Logo settings could not be saved. The previously active logo remains unchanged.');
    } finally {
      await fs.rm(temporary, { force: true }).catch(() => {});
    }
    this.settings = normalized;
    this.storageState = 'ready';
    this.storageDetail = 'Validated app-private logo settings are active.';
  }

  async _removeCachedAsset(asset) {
    if (!asset) return;
    let candidate;
    try {
      candidate = assetPath(this.cacheDirectory, normalizeCustomAsset(asset));
    } catch {
      return;
    }
    await fs.unlink(candidate).catch(() => {});
  }
}

module.exports = {
  BACKGROUND_MODES,
  FIT_MODES,
  IMAGE_EXTENSIONS,
  LOGO_SETTINGS_VERSION,
  LogoManager,
  MAX_CUSTOM_DATA_URL_LENGTH,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_HEIGHT,
  MAX_IMAGE_PIXELS,
  MAX_IMAGE_WIDTH,
  PRESETS,
  defaultPresentation,
  defaultSettings,
  detectImage,
  normalizePresentation
};
