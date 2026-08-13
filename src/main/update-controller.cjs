'use strict';

const fs = require('node:fs/promises');
const https = require('node:https');
const path = require('node:path');

const SETTINGS_VERSION = 1;
const STARTUP_DELAY_MS = 10_000;
const SQUIRREL_FIRST_RUN_DELAY_MS = 15_000;
const BACKGROUND_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 12_000;
const NATIVE_CHECK_TIMEOUT_MS = 30_000;
const MAX_RELEASES_BYTES = 128 * 1024;
const MAX_RELEASE_ROWS = 96;
const MAX_REDIRECTS = 4;
const OFFLINE_ERROR_CODES = new Set([
  'EAI_AGAIN',
  'ECONNABORTED',
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETDOWN',
  'ENETUNREACH',
  'ENOTFOUND',
  'ETIMEDOUT'
]);

const OFFICIAL_REPOSITORY = Object.freeze({
  owner: 'Ding-Ding-Projects',
  name: 'minecraft-server-studio'
});

const OFFICIAL_DOWNLOAD_BASE = `https://github.com/${OFFICIAL_REPOSITORY.owner}/${OFFICIAL_REPOSITORY.name}/releases/latest/download/`;
const OFFICIAL_RELEASE_NOTES = `https://github.com/${OFFICIAL_REPOSITORY.owner}/${OFFICIAL_REPOSITORY.name}/releases/latest`;
const PACKAGE_NAME = /^minecraft-server-studio-([0-9]+(?:\.[0-9]+){1,3}(?:[-+][A-Za-z0-9.-]+)?)-(full|delta)\.nupkg$/i;

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

function now() {
  return new Date().toISOString();
}

function text(value, limit = 256) {
  const candidate = String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  return candidate.slice(0, limit);
}

function isApprovedGithubHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  return host === 'github.com' || host.endsWith('.github.com') || host.endsWith('.githubusercontent.com');
}

function asApprovedHttpsUrl(value, { initial = false } = {}) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password || !isApprovedGithubHost(url.hostname)) return null;
  if (!initial) return url;
  const expectedPath = `/${OFFICIAL_REPOSITORY.owner}/${OFFICIAL_REPOSITORY.name}/releases/latest/download/`;
  if (url.hostname !== 'github.com' || url.pathname !== expectedPath || url.search || url.hash) return null;
  return url;
}

function createOfficialFeed() {
  const feedUrl = asApprovedHttpsUrl(OFFICIAL_DOWNLOAD_BASE, { initial: true });
  const releaseNotesUrl = asApprovedHttpsUrl(OFFICIAL_RELEASE_NOTES);
  if (!feedUrl || !releaseNotesUrl) return null;
  return Object.freeze({
    feedUrl: feedUrl.toString(),
    fallbackReleaseNotesUrl: releaseNotesUrl.toString(),
    repository: `${OFFICIAL_REPOSITORY.owner}/${OFFICIAL_REPOSITORY.name}`
  });
}

function packageMetadata(fileName) {
  const match = PACKAGE_NAME.exec(fileName);
  if (!match) return null;
  return { version: match[1], kind: match[2].toLowerCase() };
}

function releaseNotesFromRedirects(redirects, fallback) {
  const expectedPrefix = `/${OFFICIAL_REPOSITORY.owner}/${OFFICIAL_REPOSITORY.name}/releases/download/`;
  for (const candidate of [...redirects].reverse()) {
    let url;
    try {
      url = new URL(candidate);
    } catch {
      continue;
    }
    if (url.hostname !== 'github.com' || !url.pathname.startsWith(expectedPrefix) || !url.pathname.endsWith('/RELEASES')) continue;
    const tag = decodeURIComponent(url.pathname.slice(expectedPrefix.length, -'/RELEASES'.length));
    if (!/^v[0-9A-Za-z._-]+$/.test(tag)) continue;
    return {
      tag,
      releaseNotesUrl: `https://github.com/${OFFICIAL_REPOSITORY.owner}/${OFFICIAL_REPOSITORY.name}/releases/tag/${encodeURIComponent(tag)}`,
      releaseNotesExact: true
    };
  }
  return { tag: null, releaseNotesUrl: fallback, releaseNotesExact: false };
}

function parseReleasesIndex(body, { feedUrl, redirects, fallbackReleaseNotesUrl }) {
  const source = String(body || '');
  if (!source || Buffer.byteLength(source, 'utf8') > MAX_RELEASES_BYTES) throw new Error('The Squirrel RELEASES index is missing or exceeds the safe size limit.');
  const entries = [];
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.length > 2048) throw new Error('The Squirrel RELEASES index contains an oversized row.');
    const fields = line.split(/\s+/);
    if (fields.length !== 3 || !/^[a-f0-9]{40}$/i.test(fields[0])) throw new Error('The Squirrel RELEASES index contains an invalid package hash row.');
    const fileName = fields[1];
    const metadata = packageMetadata(fileName);
    if (!metadata) throw new Error('The Squirrel RELEASES index references an unsupported package name.');
    const bytes = Number(fields[2]);
    if (!Number.isSafeInteger(bytes) || bytes < 1 || bytes > 4 * 1024 * 1024 * 1024) throw new Error('The Squirrel RELEASES index contains an invalid package size.');
    const packageUrl = new URL(fileName, feedUrl);
    if (!asApprovedHttpsUrl(packageUrl)) throw new Error('The Squirrel RELEASES index resolves a package outside the approved HTTPS delivery origin.');
    entries.push({
      sha1: fields[0].toLowerCase(),
      fileName,
      bytes,
      packageUrl: packageUrl.toString(),
      ...metadata
    });
    if (entries.length > MAX_RELEASE_ROWS) throw new Error('The Squirrel RELEASES index contains too many package rows.');
  }
  const selected = [...entries].reverse().find((entry) => entry.kind === 'full');
  if (!selected) throw new Error('The Squirrel RELEASES index has no full package for this application.');
  return {
    source: 'Squirrel RELEASES',
    ...releaseNotesFromRedirects(redirects, fallbackReleaseNotesUrl),
    package: selected,
    rows: entries.length,
    validatedAt: now()
  };
}

function fetchTrustedText(urlValue, { redirects = [], remaining = MAX_REDIRECTS } = {}) {
  const url = asApprovedHttpsUrl(urlValue);
  if (!url) return Promise.reject(new Error('The update feed is not an approved HTTPS endpoint.'));
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      headers: { 'User-Agent': 'Minecraft-Server-Studio-Update-Check' }
    }, (response) => {
      const status = Number(response.statusCode || 0);
      if ([301, 302, 303, 307, 308].includes(status)) {
        const location = response.headers.location;
        response.resume();
        if (!location || remaining < 1) return reject(new Error('The update feed redirect chain is invalid or too long.'));
        let next;
        try {
          next = new URL(location, url);
        } catch {
          return reject(new Error('The update feed returned an invalid redirect.'));
        }
        if (!asApprovedHttpsUrl(next)) return reject(new Error('The update feed redirected outside the approved HTTPS delivery origin.'));
        return resolve(fetchTrustedText(next.toString(), { redirects: [...redirects, url.toString(), next.toString()], remaining: remaining - 1 }));
      }
      if (status !== 200) {
        response.resume();
        const failure = new Error(`The update feed returned HTTP ${status || 'an unknown status'}.`);
        failure.code = `HTTP_${status || 'UNKNOWN'}`;
        return reject(failure);
      }
      const chunks = [];
      let byteLength = 0;
      response.on('data', (chunk) => {
        byteLength += chunk.length;
        if (byteLength > MAX_RELEASES_BYTES) {
          const failure = new Error('The update feed metadata exceeds the safe size limit.');
          failure.code = 'UPDATE_METADATA_TOO_LARGE';
          request.destroy(failure);
          return;
        }
        chunks.push(chunk);
      });
      response.once('error', reject);
      response.once('end', () => resolve({
        body: Buffer.concat(chunks).toString('utf8'),
        redirects: [...redirects, url.toString()]
      }));
    });
    request.setTimeout(REQUEST_TIMEOUT_MS, () => {
      const failure = new Error('The update feed did not respond before the bounded timeout.');
      failure.code = 'ETIMEDOUT';
      request.destroy(failure);
    });
    request.once('error', reject);
  });
}

function safeFailure(error) {
  const code = String(error?.code || '').toUpperCase();
  const offline = OFFLINE_ERROR_CODES.has(code) || /network|offline|timed out|timeout|dns|connect/i.test(String(error?.message || ''));
  return {
    state: offline ? 'offline' : 'failed',
    message: offline
      ? 'The configured update feed could not be reached. The installed application remains usable; reconnect and check again.'
      : 'The configured update feed or staged package could not be validated. The installed application remains usable; review the unsigned release source and check again.',
    errorCode: code || 'UPDATE_CHECK_FAILED'
  };
}

function releaseNameFromEvent(values, fallback) {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const candidate = text(value, 160);
    if (candidate && !candidate.includes('://')) return candidate;
  }
  return fallback || null;
}

class UpdateController {
  constructor({ app, autoUpdater, dataDir, onStateChange, processArgs = process.argv, platform = process.platform }) {
    if (!app || !autoUpdater || !dataDir) throw new Error('UpdateController requires the Electron app, autoUpdater, and application data directory.');
    this.app = app;
    this.autoUpdater = autoUpdater;
    this.dataDir = dataDir;
    this.processArgs = Array.isArray(processArgs) ? [...processArgs] : [];
    this.platform = platform;
    this.onStateChange = typeof onStateChange === 'function' ? onStateChange : () => {};
    this.settingsPath = path.join(dataDir, 'update-settings.json');
    this.feed = createOfficialFeed();
    this.settings = { version: SETTINGS_VERSION, enabled: true };
    this.startupTimer = null;
    this.intervalTimer = null;
    this.checkInFlight = null;
    this.nativeCheckTimer = null;
    this.manifest = null;
    this.handlersAttached = false;
    this.snapshot = {
      state: 'unconfigured',
      enabled: true,
      currentVersion: this.version(),
      availableVersion: null,
      releaseTag: null,
      releaseNotesUrl: null,
      releaseNotesExact: false,
      unsignedWarning: 'Updates use unsigned Squirrel.Windows artifacts and can trigger an unknown-publisher or SmartScreen warning.',
      integrity: { state: 'not-checked', detail: 'No Squirrel RELEASES index has been validated during this application session.' },
      message: 'Application update checking has not been configured.',
      restartBlocked: false,
      deferredAt: null,
      updatedAt: now()
    };
  }

  version() {
    try {
      return text(this.app.getVersion(), 80) || 'unknown';
    } catch {
      return 'unknown';
    }
  }

  status() {
    return copy(this.snapshot);
  }

  publish(patch) {
    this.snapshot = {
      ...this.snapshot,
      ...patch,
      enabled: this.settings.enabled,
      currentVersion: this.version(),
      updatedAt: now()
    };
    try {
      this.onStateChange(this.status());
    } catch {
      // Rendering an update state must never interrupt the main process.
    }
    return this.status();
  }

  async loadSettings() {
    try {
      const parsed = JSON.parse(await fs.readFile(this.settingsPath, 'utf8'));
      if (!parsed || parsed.version !== SETTINGS_VERSION || typeof parsed.enabled !== 'boolean' || Object.keys(parsed).some((key) => !['version', 'enabled'].includes(key))) throw new Error('unsupported settings');
      return { version: SETTINGS_VERSION, enabled: parsed.enabled };
    } catch (error) {
      if (error?.code === 'ENOENT') return { version: SETTINGS_VERSION, enabled: true };
      return { version: SETTINGS_VERSION, enabled: true };
    }
  }

  async saveSettings() {
    await fs.mkdir(this.dataDir, { recursive: true });
    const temporaryPath = `${this.settingsPath}.${process.pid}.tmp`;
    await fs.writeFile(temporaryPath, JSON.stringify(this.settings), { encoding: 'utf8', mode: 0o600 });
    await fs.rename(temporaryPath, this.settingsPath);
  }

  supportedConfiguration() {
    if (this.platform !== 'win32') return { available: false, reason: 'Application updates are available only for the installed Windows Squirrel.Windows package.' };
    if (!this.app.isPackaged) return { available: false, reason: 'Application updates are available only from an installed Squirrel.Windows package, not this development launch.' };
    if (!this.feed) return { available: false, reason: 'No approved public HTTPS Squirrel.Windows feed can be derived for this application.' };
    return { available: true };
  }

  attachUpdaterHandlers() {
    if (this.handlersAttached) return;
    this.handlersAttached = true;
    this.autoUpdater.on('checking-for-update', () => {
      this.publish({ state: 'checking', message: 'Validating the public Squirrel.Windows update feed.', restartBlocked: false });
    });
    this.autoUpdater.on('update-available', (...values) => {
      this.clearNativeCheckTimeout();
      const availableVersion = releaseNameFromEvent([this.manifest?.package?.version, ...values], null);
      this.publish({
        state: 'available',
        availableVersion,
        releaseTag: this.manifest?.tag || null,
        releaseNotesUrl: this.manifest?.releaseNotesUrl || this.feed?.fallbackReleaseNotesUrl || null,
        releaseNotesExact: Boolean(this.manifest?.releaseNotesExact),
        integrity: this.integrityState('Squirrel accepted the validated RELEASES index and began its package transfer.'),
        message: `Version ${availableVersion || 'from the validated feed'} is available and is downloading in the background.`,
        restartBlocked: false,
        deferredAt: null
      });
      setTimeout(() => {
        if (this.snapshot.state === 'available') this.publish({ state: 'downloading', message: `Version ${availableVersion || 'from the validated feed'} is downloading in the background.` });
      }, 0);
    });
    this.autoUpdater.on('update-not-available', () => {
      this.clearNativeCheckTimeout();
      this.publish({
        state: 'current',
        availableVersion: null,
        releaseTag: this.manifest?.tag || null,
        releaseNotesUrl: this.manifest?.releaseNotesUrl || this.feed?.fallbackReleaseNotesUrl || null,
        releaseNotesExact: Boolean(this.manifest?.releaseNotesExact),
        integrity: this.integrityState('The Squirrel RELEASES index was validated and no newer applicable package was reported.'),
        message: `Minecraft Server Studio ${this.version()} is current for the validated public feed.`,
        restartBlocked: false,
        deferredAt: null
      });
    });
    this.autoUpdater.on('update-downloaded', (...values) => {
      this.clearNativeCheckTimeout();
      const availableVersion = releaseNameFromEvent([this.manifest?.package?.version, ...values], null);
      this.publish({
        state: 'ready',
        availableVersion,
        releaseTag: this.manifest?.tag || null,
        releaseNotesUrl: this.manifest?.releaseNotesUrl || this.feed?.fallbackReleaseNotesUrl || null,
        releaseNotesExact: Boolean(this.manifest?.releaseNotesExact),
        integrity: this.integrityState('Squirrel completed the staged package transfer using the validated RELEASES hash and size metadata.'),
        message: `Version ${availableVersion || 'from the validated feed'} is ready. Restart only after you save or discard unsaved work.`,
        restartBlocked: false,
        deferredAt: null
      });
    });
    this.autoUpdater.on('error', (error) => {
      this.clearNativeCheckTimeout();
      const failure = safeFailure(error);
      this.publish({
        ...failure,
        integrity: this.integrityState(failure.state === 'offline' ? 'The prior RELEASES validation is retained, but the current network check did not complete.' : 'The current Squirrel metadata or package transfer could not be validated.'),
        restartBlocked: false
      });
    });
  }

  clearNativeCheckTimeout() {
    if (!this.nativeCheckTimer) return;
    clearTimeout(this.nativeCheckTimer);
    this.nativeCheckTimer = null;
  }

  beginNativeCheckTimeout() {
    this.clearNativeCheckTimeout();
    this.nativeCheckTimer = setTimeout(() => {
      this.nativeCheckTimer = null;
      if (this.snapshot.state !== 'checking') return;
      this.publish({
        state: 'offline',
        message: 'The configured update feed did not complete its Squirrel.Windows response before the bounded timeout. The installed application remains usable; check again after connectivity recovers.',
        integrity: { state: 'not-checked', detail: 'The current Squirrel update request timed out before a usable update result was reported.' },
        restartBlocked: false
      });
    }, NATIVE_CHECK_TIMEOUT_MS);
  }

  integrityState(detail) {
    if (!this.manifest?.package) return { state: 'not-checked', detail };
    return {
      state: 'releases-validated',
      detail,
      packageFile: this.manifest.package.fileName,
      packageSha1: this.manifest.package.sha1,
      packageBytes: this.manifest.package.bytes
    };
  }

  async initialize() {
    this.settings = await this.loadSettings();
    this.attachUpdaterHandlers();
    const configuration = this.supportedConfiguration();
    if (!configuration.available) return this.publish({ state: 'unconfigured', message: configuration.reason });
    if (!this.settings.enabled) return this.publish({ state: 'disabled', message: 'Automatic update checks are disabled on this device. You can enable them at any time.' });
    const startupDelay = this.processArgs.includes('--squirrel-firstrun') ? SQUIRREL_FIRST_RUN_DELAY_MS : STARTUP_DELAY_MS;
    const startupMessage = this.processArgs.includes('--squirrel-firstrun')
      ? 'Automatic update checking is enabled. The first check is delayed while Squirrel.Windows releases its first-run installer lock.'
      : 'Automatic update checking is enabled. The first bounded check is scheduled after startup.';
    this.intervalTimer = setInterval(() => this.checkForUpdates({ reason: 'scheduled' }), BACKGROUND_CHECK_INTERVAL_MS);
    this.publish({
      state: 'idle',
      releaseNotesUrl: this.feed.fallbackReleaseNotesUrl,
      message: startupMessage
    });
    this.startupTimer = setTimeout(() => this.checkForUpdates({ reason: 'startup' }), startupDelay);
    return this.status();
  }

  async setEnabled(enabled) {
    this.settings = { version: SETTINGS_VERSION, enabled: Boolean(enabled) };
    await this.saveSettings();
    const configuration = this.supportedConfiguration();
    if (!configuration.available) return this.publish({ state: 'unconfigured', message: configuration.reason });
    if (!this.settings.enabled) return this.publish({ state: 'disabled', message: 'Automatic update checks are disabled on this device. No background update request will be made.' });
    this.publish({ state: 'idle', message: 'Automatic update checks are enabled. A fresh bounded check will run shortly.', restartBlocked: false });
    if (this.startupTimer) clearTimeout(this.startupTimer);
    this.startupTimer = setTimeout(() => this.checkForUpdates({ reason: 'enabled' }), 1_000);
    return this.status();
  }

  async validateFeed() {
    const feedUrl = asApprovedHttpsUrl(this.feed?.feedUrl, { initial: true });
    if (!feedUrl) throw new Error('No approved public HTTPS Squirrel.Windows feed can be derived for this application.');
    const manifestUrl = new URL('RELEASES', feedUrl);
    const result = await fetchTrustedText(manifestUrl.toString());
    return parseReleasesIndex(result.body, {
      feedUrl: feedUrl.toString(),
      redirects: result.redirects,
      fallbackReleaseNotesUrl: this.feed.fallbackReleaseNotesUrl
    });
  }

  async checkForUpdates({ reason = 'manual' } = {}) {
    const configuration = this.supportedConfiguration();
    if (!configuration.available) return this.publish({ state: 'unconfigured', message: configuration.reason });
    if (!this.settings.enabled) return this.publish({ state: 'disabled', message: 'Automatic update checks are disabled on this device. Enable them before requesting a check.' });
    if (this.checkInFlight || ['checking', 'available', 'downloading'].includes(this.snapshot.state)) return this.status();
    this.manifest = null;
    this.publish({
      state: 'checking',
      availableVersion: null,
      releaseTag: null,
      releaseNotesUrl: this.feed.fallbackReleaseNotesUrl,
      releaseNotesExact: false,
      integrity: { state: 'checking', detail: 'Fetching and validating the Squirrel RELEASES index before Electron requests an update.' },
      message: reason === 'manual' ? 'Checking the public Squirrel.Windows update feed.' : 'Checking the public Squirrel.Windows update feed in the background.',
      restartBlocked: false
    });
    this.checkInFlight = (async () => {
      try {
        this.manifest = await this.validateFeed();
        this.autoUpdater.setFeedURL({ url: this.feed.feedUrl });
        this.beginNativeCheckTimeout();
        await this.autoUpdater.checkForUpdates();
      } catch (error) {
        this.clearNativeCheckTimeout();
        const failure = safeFailure(error);
        this.publish({ ...failure, integrity: this.integrityState(failure.state === 'offline' ? 'The public feed could not be reached before RELEASES validation completed.' : 'The Squirrel RELEASES index did not meet the accepted package contract.'), restartBlocked: false });
      } finally {
        this.checkInFlight = null;
      }
    })();
    await this.checkInFlight;
    return this.status();
  }

  deferUpdate() {
    if (this.snapshot.state !== 'ready') return this.status();
    return this.publish({
      state: 'ready',
      deferredAt: now(),
      message: `Version ${this.snapshot.availableVersion || 'from the validated feed'} remains staged. Restart is deferred until you choose Restart to install update.`,
      restartBlocked: false
    });
  }

  async restartForUpdate(queryUnsavedWork) {
    if (this.snapshot.state !== 'ready') return this.status();
    let unsaved = { hasUnsavedWork: true, detail: 'The application could not confirm unsaved work.' };
    try {
      const response = await queryUnsavedWork();
      if (response && typeof response === 'object') unsaved = { hasUnsavedWork: Boolean(response.hasUnsavedWork), detail: text(response.detail, 160) };
    } catch {
      // A failed app-state query is intentionally treated as unsaved work.
    }
    if (unsaved.hasUnsavedWork) {
      return this.publish({
        state: 'ready',
        restartBlocked: true,
        message: 'The staged update is ready, but restart is blocked until unsaved work is saved or discarded.'
      });
    }
    try {
      this.autoUpdater.quitAndInstall();
      return this.publish({ state: 'ready', restartBlocked: false, message: 'Restart was requested by the user to install the staged unsigned update.' });
    } catch (error) {
      const failure = safeFailure(error);
      return this.publish({ ...failure, integrity: this.integrityState('The staged update remains uninstalled because the user-selected restart could not begin.') });
    }
  }

  shutdown() {
    if (this.startupTimer) clearTimeout(this.startupTimer);
    if (this.intervalTimer) clearInterval(this.intervalTimer);
    this.clearNativeCheckTimeout();
    this.startupTimer = null;
    this.intervalTimer = null;
  }
}

module.exports = {
  UpdateController,
  OFFICIAL_DOWNLOAD_BASE,
  OFFICIAL_RELEASE_NOTES
};
