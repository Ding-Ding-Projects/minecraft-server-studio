const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { detectImage } = require('./logo-manager.cjs');

const DIM_SUM_SURPRISE_VERSION = 1;
const MAX_CACHE_ENTRIES = 4;
const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
const MAX_PHOTO_DIMENSION = 4096;
const MAX_PHOTO_PIXELS = 16 * 1024 * 1024;
const MAX_DATA_URL_LENGTH = Math.ceil(MAX_PHOTO_BYTES / 3) * 4 + 64;
const NETWORK_TIMEOUT_MS = 12_000;
const MAX_REDIRECTS = 4;
const UPDATE_STATES_THAT_SUPPRESS_SURPRISE = new Set(['checking', 'available', 'downloading', 'ready', 'offline', 'failed', 'unconfigured']);
const RELEASE_ASSET_HOSTS = new Set([
  'github.com',
  'release-assets.githubusercontent.com',
  'objects.githubusercontent.com',
  'github-releases.githubusercontent.com'
]);

// This is a deliberately small, revision-pinned cache of public catalog
// metadata. The images themselves are never tracked by this consumer repo.
const PUBLIC_CATALOG = Object.freeze({
  source: 'https://raw.githubusercontent.com/Ding-Ding-Projects/dim-sum-photos/main/catalog/index.json',
  revision: '736e8c1d9e40e1d146f3c3b11bb329b97c4ef515',
  releaseTag: 'catalog-v1-part-003'
});

const PUBLIC_DIM_SUM_POOL = Object.freeze([
  Object.freeze({
    id: 'hk-dish-3001',
    fileName: 'hk-dish-3001-hong-kong-matcha-red-bean-steamed-bun.png',
    name: Object.freeze({ en: 'Hong Kong Matcha Red Bean Steamed Bun', zhHant: '香港抹茶紅豆蒸包' }),
    alt: Object.freeze({ en: 'One Hong Kong matcha red bean steamed bun on a small tea-house plate.', yue: '一個香港抹茶紅豆蒸包，用茶樓碟上枱。' })
  }),
  Object.freeze({
    id: 'hk-dish-3002',
    fileName: 'hk-dish-3002-hong-kong-matcha-black-sesame-steamed-bun.png',
    name: Object.freeze({ en: 'Hong Kong Matcha Black Sesame Steamed Bun', zhHant: '香港抹茶黑芝麻蒸包' }),
    alt: Object.freeze({ en: 'One Hong Kong matcha black sesame steamed bun on a small tea-house plate.', yue: '一個香港抹茶黑芝麻蒸包，用茶樓碟上枱。' })
  }),
  Object.freeze({
    id: 'hk-dish-3003',
    fileName: 'hk-dish-3003-hong-kong-matcha-coconut-steamed-bun.png',
    name: Object.freeze({ en: 'Hong Kong Matcha Coconut Steamed Bun', zhHant: '香港抹茶椰香蒸包' }),
    alt: Object.freeze({ en: 'One Hong Kong matcha coconut steamed bun on a small tea-house plate.', yue: '一個香港抹茶椰香蒸包，用茶樓碟上枱。' })
  }),
  Object.freeze({
    id: 'hk-dish-3004',
    fileName: 'hk-dish-3004-hong-kong-matcha-taro-steamed-bun.png',
    name: Object.freeze({ en: 'Hong Kong Matcha Taro Steamed Bun', zhHant: '香港抹茶芋泥蒸包' }),
    alt: Object.freeze({ en: 'One Hong Kong matcha taro steamed bun on a small tea-house plate.', yue: '一個香港抹茶芋泥蒸包，用茶樓碟上枱。' })
  })
]);

const POOL_BY_ID = new Map(PUBLIC_DIM_SUM_POOL.map((entry) => [entry.id, entry]));

function surpriseError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function isPlainRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function exactKeys(value, keys, message) {
  if (!isPlainRecord(value)) throw surpriseError('DIM_SUM_INVALID_RECORD', message);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw surpriseError('DIM_SUM_INVALID_RECORD', message);
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function insideDirectory(directory, candidate) {
  const relative = path.relative(directory, candidate);
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function normalizeDirectory(value, label) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) throw surpriseError('DIM_SUM_INVALID_PATH', `${label} must be an absolute path.`);
  return path.normalize(value);
}

function normalizeCacheMetadata(value) {
  exactKeys(value, ['sha256', 'bytes', 'width', 'height'], 'Dim sum cache metadata is invalid.');
  if (typeof value.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.sha256)) throw surpriseError('DIM_SUM_INVALID_RECORD', 'Dim sum cache metadata has an invalid digest.');
  if (!Number.isInteger(value.bytes) || value.bytes < 1 || value.bytes > MAX_PHOTO_BYTES) throw surpriseError('DIM_SUM_INVALID_RECORD', 'Dim sum cache metadata has an invalid byte count.');
  if (!Number.isInteger(value.width) || !Number.isInteger(value.height) || value.width < 1 || value.height < 1 || value.width > MAX_PHOTO_DIMENSION || value.height > MAX_PHOTO_DIMENSION || value.width * value.height > MAX_PHOTO_PIXELS) {
    throw surpriseError('DIM_SUM_INVALID_RECORD', 'Dim sum cache metadata has invalid dimensions.');
  }
  return { sha256: value.sha256, bytes: value.bytes, width: value.width, height: value.height };
}

function defaultState() {
  return {
    version: DIM_SUM_SURPRISE_VERSION,
    launchCount: 0,
    catalogSource: PUBLIC_CATALOG.source,
    catalogRevision: PUBLIC_CATALOG.revision,
    cache: {}
  };
}

function normalizeState(value) {
  exactKeys(value, ['version', 'launchCount', 'catalogSource', 'catalogRevision', 'cache'], 'Dim sum surprise settings are invalid.');
  if (value.version !== DIM_SUM_SURPRISE_VERSION) throw surpriseError('DIM_SUM_UNSUPPORTED_VERSION', 'Dim sum surprise settings use an unsupported version.');
  if (!Number.isInteger(value.launchCount) || value.launchCount < 0 || value.launchCount > 0x7fffffff) throw surpriseError('DIM_SUM_INVALID_RECORD', 'Dim sum surprise launch state is invalid.');
  if (value.catalogSource !== PUBLIC_CATALOG.source || value.catalogRevision !== PUBLIC_CATALOG.revision) throw surpriseError('DIM_SUM_INVALID_RECORD', 'Dim sum cache state does not match the supported public catalog revision.');
  if (!isPlainRecord(value.cache)) throw surpriseError('DIM_SUM_INVALID_RECORD', 'Dim sum cache state is invalid.');
  const cache = {};
  const ids = Object.keys(value.cache);
  if (ids.length > MAX_CACHE_ENTRIES) throw surpriseError('DIM_SUM_INVALID_RECORD', 'Dim sum cache state exceeds its entry limit.');
  for (const id of ids) {
    if (!POOL_BY_ID.has(id)) throw surpriseError('DIM_SUM_INVALID_RECORD', 'Dim sum cache state references an unsupported image.');
    cache[id] = normalizeCacheMetadata(value.cache[id]);
  }
  return {
    version: DIM_SUM_SURPRISE_VERSION,
    launchCount: value.launchCount,
    catalogSource: PUBLIC_CATALOG.source,
    catalogRevision: PUBLIC_CATALOG.revision,
    cache
  };
}

function cachePath(cacheDirectory, entry) {
  const candidate = path.join(cacheDirectory, `${entry.id}.png`);
  if (!insideDirectory(cacheDirectory, candidate)) throw surpriseError('DIM_SUM_INVALID_PATH', 'Dim sum cache path is invalid.');
  return candidate;
}

function publicAssetUrl(entry) {
  return `https://github.com/Ding-Ding-Projects/dim-sum-photos/releases/download/${PUBLIC_CATALOG.releaseTag}/${entry.fileName}`;
}

function allowedReleaseUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw surpriseError('DIM_SUM_INVALID_SOURCE', 'The public dim sum asset source is invalid.');
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port || !RELEASE_ASSET_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw surpriseError('DIM_SUM_INVALID_SOURCE', 'The public dim sum asset source is not allowed.');
  }
  return parsed;
}

function updateAllowsSurprise(updateState) {
  return !UPDATE_STATES_THAT_SUPPRESS_SURPRISE.has(String(updateState || '').toLowerCase());
}

async function readBoundedPublicAsset(source) {
  let current = allowedReleaseUrl(source);
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS);
    let response;
    try {
      response = await fetch(current, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: { accept: 'image/png' }
      });
    } catch {
      clearTimeout(timer);
      throw surpriseError('DIM_SUM_NETWORK_UNAVAILABLE', 'The public dim sum cache could not be refreshed.');
    }
    try {
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        if (!location || redirects === MAX_REDIRECTS) throw surpriseError('DIM_SUM_INVALID_SOURCE', 'The public dim sum asset redirect is invalid.');
        current = allowedReleaseUrl(new URL(location, current).toString());
        continue;
      }
      if (!response.ok || !response.body) throw surpriseError('DIM_SUM_NETWORK_UNAVAILABLE', 'The public dim sum cache could not be refreshed.');

      const advertised = Number(response.headers.get('content-length'));
      if (Number.isFinite(advertised) && (advertised < 1 || advertised > MAX_PHOTO_BYTES)) {
        throw surpriseError('DIM_SUM_PHOTO_LIMIT', 'The public dim sum image exceeds the cache limit.');
      }
      const reader = response.body.getReader();
      const chunks = [];
      let bytes = 0;
      let completed = false;
      try {
        while (true) {
          const next = await reader.read();
          if (next.done) break;
          if (!(next.value instanceof Uint8Array)) throw surpriseError('DIM_SUM_INVALID_IMAGE', 'The public dim sum image returned an invalid response.');
          bytes += next.value.byteLength;
          if (bytes > MAX_PHOTO_BYTES) throw surpriseError('DIM_SUM_PHOTO_LIMIT', 'The public dim sum image exceeds the cache limit.');
          chunks.push(Buffer.from(next.value));
        }
        completed = true;
      } finally {
        if (!completed) await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
      if (bytes < 1) throw surpriseError('DIM_SUM_INVALID_IMAGE', 'The public dim sum image is empty.');
      return Buffer.concat(chunks, bytes);
    } finally {
      clearTimeout(timer);
    }
  }
  throw surpriseError('DIM_SUM_INVALID_SOURCE', 'The public dim sum asset redirect limit was reached.');
}

function validatePng(nativeImage, bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 1 || bytes.length > MAX_PHOTO_BYTES) throw surpriseError('DIM_SUM_PHOTO_LIMIT', 'The public dim sum image exceeds the cache limit.');
  const header = detectImage(bytes);
  if (header.format !== 'png') throw surpriseError('DIM_SUM_INVALID_IMAGE', 'The public dim sum image must be PNG.');
  if (!nativeImage || typeof nativeImage.createFromBuffer !== 'function') throw surpriseError('DIM_SUM_DECODER_UNAVAILABLE', 'The packaged image decoder is unavailable.');
  let decoded;
  try {
    decoded = nativeImage.createFromBuffer(bytes);
  } catch {
    throw surpriseError('DIM_SUM_INVALID_IMAGE', 'The public dim sum image could not be decoded.');
  }
  if (!decoded || typeof decoded.isEmpty !== 'function' || decoded.isEmpty() || typeof decoded.getSize !== 'function') {
    throw surpriseError('DIM_SUM_INVALID_IMAGE', 'The public dim sum image could not be decoded.');
  }
  const size = decoded.getSize();
  const width = Number(size?.width);
  const height = Number(size?.height);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > MAX_PHOTO_DIMENSION || height > MAX_PHOTO_DIMENSION || width * height > MAX_PHOTO_PIXELS) {
    throw surpriseError('DIM_SUM_INVALID_IMAGE', 'The public dim sum image has unsupported dimensions.');
  }
  return {
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    bytes: bytes.length,
    width,
    height
  };
}

function imageDataUrl(bytes) {
  const dataUrl = `data:image/png;base64,${bytes.toString('base64')}`;
  if (dataUrl.length > MAX_DATA_URL_LENGTH) throw surpriseError('DIM_SUM_PHOTO_LIMIT', 'The public dim sum image is too large to display safely.');
  return dataUrl;
}

class DimSumSurprise {
  constructor(options = {}) {
    if (!isPlainRecord(options)) throw surpriseError('DIM_SUM_INVALID_OPTIONS', 'Dim sum surprise options are invalid.');
    const allowed = new Set(['dataDir', 'nativeImage']);
    for (const key of Object.keys(options)) {
      if (!allowed.has(key)) throw surpriseError('DIM_SUM_INVALID_OPTIONS', 'Dim sum surprise options are invalid.');
    }
    this.dataDir = normalizeDirectory(options.dataDir, 'Dim sum data directory');
    this.cacheDirectory = path.join(this.dataDir, 'cache');
    this.statePath = path.join(this.dataDir, 'dim-sum-surprise.json');
    this.nativeImage = options.nativeImage;
    this.state = defaultState();
    this.storageState = 'not-loaded';
    this.cache = new Map();
    this.cacheLoaded = false;
    this.cacheLoading = null;
    this.startupPrepared = false;
    this.startupEligible = false;
    this.warming = false;
  }

  async initialize() {
    await fs.mkdir(this.dataDir, { recursive: true, mode: 0o700 });
    await fs.mkdir(this.cacheDirectory, { recursive: true, mode: 0o700 });
    await this._loadState();
  }

  async prepareStartup({ schoolModeActive = false, updateState = '' } = {}) {
    if (this.startupPrepared) return;
    this.startupPrepared = true;
    if (this.storageState !== 'ready') return;
    const isFirstRun = this.state.launchCount === 0;
    this.state = { ...this.state, launchCount: this.state.launchCount + 1 };
    try {
      await this._saveState(this.state);
    } catch {
      this.storageState = 'unavailable';
      return;
    }
    this.startupEligible = !isFirstRun && !schoolModeActive && updateAllowsSurprise(updateState);
  }

  async consumeStartupCandidate({ schoolModeActive = false, updateState = '' } = {}) {
    if (!this.startupEligible || schoolModeActive || !updateAllowsSurprise(updateState)) return null;
    this.startupEligible = false;
    await this._ensureCacheLoaded();
    if (this.cache.size === 0 || crypto.randomInt(10) !== 0) return null;
    const available = [...this.cache.keys()];
    const entry = POOL_BY_ID.get(available[crypto.randomInt(available.length)]);
    const cached = entry ? this.cache.get(entry.id) : null;
    if (!entry || !cached) return null;
    return clone({
      id: entry.id,
      name: entry.name,
      alt: entry.alt,
      imageDataUrl: cached.dataUrl
    });
  }

  async warmCache({ schoolModeActive = false, updateState = '' } = {}) {
    if (this.storageState !== 'ready' || this.warming || schoolModeActive || !updateAllowsSurprise(updateState)) return;
    this.warming = true;
    try {
      await this._ensureCacheLoaded();
      for (const entry of PUBLIC_DIM_SUM_POOL) {
        if (this.cache.has(entry.id)) continue;
        try {
          const bytes = await readBoundedPublicAsset(publicAssetUrl(entry));
          const metadata = validatePng(this.nativeImage, bytes);
          await this._storeCachedPhoto(entry, metadata, bytes);
          this.state = {
            ...this.state,
            cache: { ...this.state.cache, [entry.id]: metadata }
          };
          await this._saveState(this.state);
        } catch {
          // A cache refresh is deliberately silent, non-blocking, and never changes
          // the launch surprise into a network-dependent or error-path surface.
        }
      }
    } finally {
      this.warming = false;
    }
  }

  async _loadState() {
    try {
      const parsed = JSON.parse(await fs.readFile(this.statePath, 'utf8'));
      this.state = normalizeState(parsed);
      this.storageState = 'ready';
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        this.storageState = 'unavailable';
        return;
      }
      const initial = defaultState();
      try {
        await this._saveState(initial);
        this.state = initial;
        this.storageState = 'ready';
      } catch {
        this.storageState = 'unavailable';
      }
    }
  }

  async _loadCachedEntries() {
    this.cache.clear();
    if (this.storageState !== 'ready') return;
    for (const [id, metadata] of Object.entries(this.state.cache)) {
      const entry = POOL_BY_ID.get(id);
      if (!entry) continue;
      try {
        const candidate = cachePath(this.cacheDirectory, entry);
        const stat = await fs.lstat(candidate);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== metadata.bytes || stat.size > MAX_PHOTO_BYTES) continue;
        const bytes = await fs.readFile(candidate);
        const actual = validatePng(this.nativeImage, bytes);
        if (actual.sha256 !== metadata.sha256 || actual.bytes !== metadata.bytes || actual.width !== metadata.width || actual.height !== metadata.height) continue;
        this.cache.set(id, { dataUrl: imageDataUrl(bytes) });
      } catch {
        // A missing or corrupt cache is ignored. The next safe background cache
        // refresh may repair it without displaying a surprise first.
      }
    }
  }

  async _ensureCacheLoaded() {
    if (this.cacheLoaded) return;
    if (this.cacheLoading) return this.cacheLoading;
    this.cacheLoading = (async () => {
      await this._loadCachedEntries();
      this.cacheLoaded = true;
    })();
    try {
      await this.cacheLoading;
    } finally {
      this.cacheLoading = null;
    }
  }

  async _storeCachedPhoto(entry, metadata, bytes) {
    const destination = cachePath(this.cacheDirectory, entry);
    const temporary = path.join(this.cacheDirectory, `.${entry.id}.${crypto.randomUUID()}.tmp`);
    if (!insideDirectory(this.cacheDirectory, temporary)) throw surpriseError('DIM_SUM_INVALID_PATH', 'Dim sum cache staging path is invalid.');
    try {
      await fs.writeFile(temporary, bytes, { mode: 0o600, flag: 'wx' });
      await fs.rename(temporary, destination);
    } catch {
      throw surpriseError('DIM_SUM_CACHE_WRITE_FAILED', 'The public dim sum image could not be stored in the app-private cache.');
    } finally {
      await fs.rm(temporary, { force: true }).catch(() => {});
    }
  }

  async _saveState(value) {
    const normalized = normalizeState(value);
    const temporary = path.join(this.dataDir, `.dim-sum-surprise.${crypto.randomUUID()}.tmp`);
    if (!insideDirectory(this.dataDir, temporary)) throw surpriseError('DIM_SUM_INVALID_PATH', 'Dim sum settings staging path is invalid.');
    try {
      await fs.writeFile(temporary, JSON.stringify(normalized), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      await fs.rename(temporary, this.statePath);
    } catch {
      throw surpriseError('DIM_SUM_SETTINGS_WRITE_FAILED', 'Dim sum surprise settings could not be saved.');
    } finally {
      await fs.rm(temporary, { force: true }).catch(() => {});
    }
    this.state = normalized;
    this.storageState = 'ready';
  }
}

module.exports = {
  DIM_SUM_SURPRISE_VERSION,
  DimSumSurprise,
  MAX_CACHE_ENTRIES,
  MAX_PHOTO_BYTES,
  PUBLIC_CATALOG,
  PUBLIC_DIM_SUM_POOL,
  UPDATE_STATES_THAT_SUPPRESS_SURPRISE
};
