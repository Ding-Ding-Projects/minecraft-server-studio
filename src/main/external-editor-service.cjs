'use strict';

/**
 * Local external-editor integration.
 *
 * The renderer never receives an editor executable path or a server filesystem
 * path. It can select only a candidate identifier supplied by this service or
 * ask the main process to open one of two fixed target kinds for a selected
 * managed server. The service starts the editor directly with `shell: false`;
 * it never accepts free-form arguments, command text, URLs, or network input.
 */

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');

const SETTINGS_SCHEMA_VERSION = 1;
const MAX_PATH_LENGTH = 8_192;
const MAX_CANDIDATES = 64;
const MAX_ID_LENGTH = 64;
const MAX_SERVER_ID_LENGTH = 128;
const EDITOR_FILE_NAMES = Object.freeze(['Code.exe', 'Code - Insiders.exe', 'code.exe']);
const TARGET_KINDS = new Set(['server-root', 'handoff-record']);

function externalEditorError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function isPlainRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function stableCandidateId(executablePath) {
  return `editor-${crypto.createHash('sha256').update(executablePath, 'utf8').digest('hex').slice(0, 24)}`;
}

function displayLabelFor(executablePath) {
  const base = path.basename(executablePath).toLowerCase();
  if (base === 'code - insiders.exe') return 'Visual Studio Code Insiders';
  return 'Visual Studio Code';
}

function safeEnvironmentValue(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_PATH_LENGTH ? value : '';
}

function uniquePaths(values) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    if (typeof value !== 'string' || !value || value.length > MAX_PATH_LENGTH) continue;
    const normalized = path.normalize(value);
    const key = process.platform === 'win32' ? normalized.toLowerCase() : normalized;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

function candidateLocations(environment = process.env) {
  const localAppData = safeEnvironmentValue(environment.LOCALAPPDATA);
  const programFiles = safeEnvironmentValue(environment.ProgramFiles);
  const programFilesX86 = safeEnvironmentValue(environment['ProgramFiles(x86)']);
  const userProfile = safeEnvironmentValue(environment.USERPROFILE);
  const portableDirectory = safeEnvironmentValue(environment.PORTABLE_EXECUTABLE_DIR);
  const roots = [
    localAppData && path.join(localAppData, 'Programs', 'Microsoft VS Code'),
    localAppData && path.join(localAppData, 'Programs', 'Microsoft VS Code Insiders'),
    programFiles && path.join(programFiles, 'Microsoft VS Code'),
    programFiles && path.join(programFiles, 'Microsoft VS Code Insiders'),
    programFilesX86 && path.join(programFilesX86, 'Microsoft VS Code'),
    programFilesX86 && path.join(programFilesX86, 'Microsoft VS Code Insiders'),
    userProfile && path.join(userProfile, 'scoop', 'apps', 'vscode', 'current'),
    userProfile && path.join(userProfile, 'scoop', 'apps', 'vscode-insiders', 'current'),
    portableDirectory
  ].filter(Boolean);

  const direct = roots.flatMap((root) => EDITOR_FILE_NAMES.map((fileName) => path.join(root, fileName)));
  const pathDirectories = safeEnvironmentValue(environment.PATH).split(path.delimiter).filter(Boolean).slice(0, 256);
  const fromPath = pathDirectories.flatMap((directory) => {
    const normalized = directory.replace(/^"|"$/g, '');
    return [
      ...EDITOR_FILE_NAMES.map((fileName) => path.join(normalized, fileName)),
      ...EDITOR_FILE_NAMES.map((fileName) => path.join(normalized, '..', fileName))
    ];
  });
  return uniquePaths([...direct, ...fromPath]).slice(0, MAX_CANDIDATES * 4);
}

class ExternalEditorService {
  constructor({ dataDir, environment = process.env }) {
    if (typeof dataDir !== 'string' || !path.isAbsolute(dataDir)) {
      throw externalEditorError('EDITOR_INVALID_DATA_DIRECTORY', 'The app-private external-editor directory is unavailable.');
    }
    this.dataDir = path.resolve(dataDir);
    this.environment = environment && typeof environment === 'object' ? environment : process.env;
    this.settingsPath = path.join(this.dataDir, 'external-editor-settings.json');
    this.exportsDir = path.join(this.dataDir, 'exports');
    this.settings = { schema: SETTINGS_SCHEMA_VERSION, selection: { mode: 'automatic' } };
    this.settingsState = 'not-loaded';
    this.candidates = [];
    this.activeEditor = null;
  }

  async initialize() {
    await fs.mkdir(this.dataDir, { recursive: true, mode: 0o700 });
    await fs.mkdir(this.exportsDir, { recursive: true, mode: 0o700 });
    await this.#loadSettings();
    await this.refresh();
    return this.snapshot();
  }

  async refresh() {
    const locations = candidateLocations(this.environment);
    const resolved = [];
    for (const candidatePath of locations) {
      const candidate = await this.#candidateFromExecutable(candidatePath, 'detected');
      if (candidate) resolved.push(candidate);
      if (resolved.length >= MAX_CANDIDATES) break;
    }
    this.candidates = this.#uniqueCandidates(resolved);
    this.activeEditor = await this.#selectedEditor();
    return this.snapshot();
  }

  async snapshot() {
    const selected = this.activeEditor;
    const publicCandidates = this.candidates.map((candidate) => publicCandidate(candidate, selected?.id));
    const hasDetected = publicCandidates.length > 0;
    const selectedState = this.settings.selection.mode === 'custom' && !selected
      ? 'saved-selection-unavailable'
      : selected
        ? 'ready'
        : 'no-editor';
    const detail = selectedState === 'ready'
      ? `${selected.label} is ready for direct local handoff.`
      : selectedState === 'saved-selection-unavailable'
        ? 'The saved editor selection is unavailable. Choose another local executable or return to automatic detection.'
        : hasDetected
          ? 'Choose a detected local editor before opening a server folder or handoff record.'
          : 'No supported local Visual Studio Code executable was detected. Choose a local executable or editor folder to continue.';
    return Object.freeze({
      schemaVersion: SETTINGS_SCHEMA_VERSION,
      state: selectedState,
      detail,
      selection: selected ? Object.freeze({ id: selected.id, label: selected.label, source: selected.source }) : null,
      candidates: Object.freeze(publicCandidates),
      automaticAvailable: hasDetected,
      boundaries: Object.freeze([
        'No network request or editor installation is performed.',
        'The renderer receives no editor executable or server path.',
        'Opening uses a fixed direct argument list with no shell or free-form command text.'
      ])
    });
  }

  availability() {
    const selected = this.activeEditor;
    return Object.freeze(selected
      ? { state: 'available', detail: `${selected.label} is available for a real app-private exported file.` }
      : { state: 'unavailable', detail: 'No configured local Visual Studio Code executable is available. Choose one before opening a generated export.' });
  }

  async chooseExecutable(executablePath) {
    const candidate = await this.#candidateFromExecutable(executablePath, 'custom');
    if (!candidate) throw externalEditorError('EDITOR_INVALID_EXECUTABLE', 'Choose an existing local Visual Studio Code executable.');
    await this.#setCustomSelection(candidate);
    this.activeEditor = candidate;
    return this.snapshot();
  }

  async chooseFolder(folderPath) {
    if (typeof folderPath !== 'string' || !path.isAbsolute(folderPath) || folderPath.length > MAX_PATH_LENGTH) {
      throw externalEditorError('EDITOR_INVALID_FOLDER', 'Choose an existing local editor folder.');
    }
    let canonicalFolder;
    try {
      canonicalFolder = await fs.realpath(folderPath);
      const stat = await fs.stat(canonicalFolder);
      if (!stat.isDirectory()) throw new Error('not directory');
    } catch {
      throw externalEditorError('EDITOR_INVALID_FOLDER', 'Choose an existing local editor folder.');
    }
    const candidates = [];
    for (const fileName of EDITOR_FILE_NAMES) {
      const candidate = await this.#candidateFromExecutable(path.join(canonicalFolder, fileName), 'custom-folder');
      if (candidate) candidates.push(candidate);
    }
    for (const productFolder of ['Microsoft VS Code', 'Microsoft VS Code Insiders']) {
      for (const fileName of EDITOR_FILE_NAMES) {
        const candidate = await this.#candidateFromExecutable(path.join(canonicalFolder, productFolder, fileName), 'custom-folder');
        if (candidate) candidates.push(candidate);
      }
    }
    const selected = this.#uniqueCandidates(candidates)[0];
    if (!selected) throw externalEditorError('EDITOR_FOLDER_NO_EXECUTABLE', 'No supported Visual Studio Code executable was found directly inside the chosen folder.');
    await this.#setCustomSelection(selected);
    this.activeEditor = selected;
    return this.snapshot();
  }

  async selectCandidate(candidateId) {
    if (typeof candidateId !== 'string' || !/^editor-[a-f0-9]{24}$/.test(candidateId) || candidateId.length > MAX_ID_LENGTH) {
      throw externalEditorError('EDITOR_INVALID_SELECTION', 'Choose a detected local editor.');
    }
    const candidate = this.candidates.find((entry) => entry.id === candidateId);
    if (!candidate) throw externalEditorError('EDITOR_INVALID_SELECTION', 'The selected local editor is no longer available. Refresh detection and choose again.');
    await this.#setCustomSelection(candidate);
    this.activeEditor = candidate;
    return this.snapshot();
  }

  async useAutomaticSelection() {
    this.settings = { schema: SETTINGS_SCHEMA_VERSION, selection: { mode: 'automatic' } };
    await this.#writeSettings();
    this.activeEditor = this.candidates[0] || null;
    return this.snapshot();
  }

  async openServerTarget(server, targetKind) {
    if (!TARGET_KINDS.has(targetKind)) throw externalEditorError('EDITOR_INVALID_TARGET', 'Choose a supported external-editor handoff target.');
    const editor = await this.#selectedEditor();
    if (!editor) throw externalEditorError('EDITOR_UNAVAILABLE', 'Choose an available local editor before opening a target.');
    this.activeEditor = editor;
    const targetPath = targetKind === 'server-root'
      ? await this.#verifiedServerRoot(server)
      : await this.#writeSafeHandoffRecord(server);
    await this.#spawnEditor(editor.executablePath, targetPath);
    return Object.freeze({
      state: 'opened',
      target: targetKind,
      editor: editor.label,
      detail: targetKind === 'server-root'
        ? 'The selected local server root was opened in the configured editor.'
        : 'A safe app-private handoff record was generated and opened in the configured editor.'
    });
  }

  async openTrustedFile(filePath) {
    const editor = await this.#selectedEditor();
    if (!editor) throw externalEditorError('EDITOR_UNAVAILABLE', 'Choose an available local editor before opening a generated export.');
    this.activeEditor = editor;
    const targetPath = await this.#verifiedFile(filePath);
    await this.#spawnEditor(editor.executablePath, targetPath);
    return Object.freeze({
      state: 'opened',
      editor: editor.label,
      detail: 'The selected app-private generated file was opened in the configured editor.'
    });
  }

  async #loadSettings() {
    try {
      const raw = await fs.readFile(this.settingsPath, 'utf8');
      const parsed = JSON.parse(raw);
      this.settings = this.#normalizeSettings(parsed);
      this.settingsState = 'ready';
    } catch (error) {
      if (error?.code === 'ENOENT') {
        this.settings = { schema: SETTINGS_SCHEMA_VERSION, selection: { mode: 'automatic' } };
        this.settingsState = 'ready';
        return;
      }
      this.settings = { schema: SETTINGS_SCHEMA_VERSION, selection: { mode: 'automatic' } };
      this.settingsState = 'invalid';
    }
  }

  #normalizeSettings(value) {
    if (!isPlainRecord(value) || Object.keys(value).some((key) => !['schema', 'selection'].includes(key)) || value.schema !== SETTINGS_SCHEMA_VERSION || !isPlainRecord(value.selection)) {
      throw externalEditorError('EDITOR_INVALID_SETTINGS', 'The saved external-editor setting is invalid.');
    }
    const selection = value.selection;
    if (selection.mode === 'automatic' && Object.keys(selection).length === 1) {
      return { schema: SETTINGS_SCHEMA_VERSION, selection: { mode: 'automatic' } };
    }
    if (selection.mode === 'custom' && Object.keys(selection).every((key) => ['mode', 'executable'].includes(key)) && typeof selection.executable === 'string' && path.isAbsolute(selection.executable) && selection.executable.length <= MAX_PATH_LENGTH) {
      return { schema: SETTINGS_SCHEMA_VERSION, selection: { mode: 'custom', executable: path.normalize(selection.executable) } };
    }
    throw externalEditorError('EDITOR_INVALID_SETTINGS', 'The saved external-editor setting is invalid.');
  }

  async #writeSettings() {
    await fs.mkdir(this.dataDir, { recursive: true, mode: 0o700 });
    const temporary = path.join(this.dataDir, `.external-editor-settings-${process.pid}-${crypto.randomUUID()}.tmp`);
    try {
      await fs.writeFile(temporary, JSON.stringify(this.settings), { encoding: 'utf8', mode: 0o600 });
      await fs.rename(temporary, this.settingsPath);
      this.settingsState = 'ready';
    } catch {
      throw externalEditorError('EDITOR_SETTINGS_WRITE_FAILED', 'The external-editor preference could not be saved.');
    } finally {
      await fs.rm(temporary, { force: true }).catch(() => {});
    }
  }

  async #setCustomSelection(candidate) {
    this.settings = {
      schema: SETTINGS_SCHEMA_VERSION,
      selection: { mode: 'custom', executable: candidate.executablePath }
    };
    await this.#writeSettings();
    this.candidates = this.#uniqueCandidates([...this.candidates, candidate]);
  }

  async #candidateFromExecutable(candidatePath, source) {
    if (typeof candidatePath !== 'string' || !path.isAbsolute(candidatePath) || candidatePath.length > MAX_PATH_LENGTH || path.extname(candidatePath).toLowerCase() !== '.exe') return null;
    let canonical;
    try {
      canonical = await fs.realpath(candidatePath);
      const stat = await fs.stat(canonical);
      if (!stat.isFile()) return null;
      const header = Buffer.alloc(2);
      const file = await fs.open(canonical, 'r');
      try {
        const result = await file.read(header, 0, header.length, 0);
        if (result.bytesRead !== 2 || header.toString('ascii') !== 'MZ') return null;
      } finally {
        await file.close();
      }
    } catch {
      return null;
    }
    return Object.freeze({
      id: stableCandidateId(canonical),
      executablePath: canonical,
      label: displayLabelFor(canonical),
      source
    });
  }

  #uniqueCandidates(candidates) {
    const seen = new Set();
    const result = [];
    for (const candidate of candidates) {
      if (!candidate || seen.has(candidate.id)) continue;
      seen.add(candidate.id);
      result.push(candidate);
      if (result.length >= MAX_CANDIDATES) break;
    }
    return result;
  }

  async #selectedEditor() {
    if (this.settings.selection.mode === 'custom') {
      const custom = await this.#candidateFromExecutable(this.settings.selection.executable, 'custom');
      return custom || null;
    }
    return this.candidates[0] || null;
  }

  async #verifiedServerRoot(server) {
    const serverId = typeof server?.id === 'string' ? server.id : '';
    const configuredPath = typeof server?.serverPath === 'string' ? server.serverPath : '';
    if (!serverId || serverId.length > MAX_SERVER_ID_LENGTH || !path.isAbsolute(configuredPath) || configuredPath.length > MAX_PATH_LENGTH) {
      throw externalEditorError('EDITOR_INVALID_SERVER_TARGET', 'The selected server has no usable local root folder.');
    }
    try {
      const canonical = await fs.realpath(configuredPath);
      const stat = await fs.stat(canonical);
      if (!stat.isDirectory()) throw new Error('not directory');
      return canonical;
    } catch {
      throw externalEditorError('EDITOR_INVALID_SERVER_TARGET', 'The selected server root folder is unavailable. Refresh the local server record before trying again.');
    }
  }

  async #verifiedFile(filePath) {
    if (typeof filePath !== 'string' || !path.isAbsolute(filePath) || filePath.length > MAX_PATH_LENGTH) {
      throw externalEditorError('EDITOR_INVALID_FILE_TARGET', 'The generated local file is unavailable for editor handoff.');
    }
    try {
      const canonical = await fs.realpath(filePath);
      const stat = await fs.stat(canonical);
      if (!stat.isFile()) throw new Error('not file');
      return canonical;
    } catch {
      throw externalEditorError('EDITOR_INVALID_FILE_TARGET', 'The generated local file is unavailable for editor handoff.');
    }
  }

  async #writeSafeHandoffRecord(server) {
    const serverId = typeof server?.id === 'string' ? server.id : '';
    if (!serverId || serverId.length > MAX_SERVER_ID_LENGTH) {
      throw externalEditorError('EDITOR_INVALID_SERVER_TARGET', 'The selected server cannot create a safe editor handoff record.');
    }
    await fs.mkdir(this.exportsDir, { recursive: true, mode: 0o700 });
    const recordPath = path.join(this.exportsDir, 'minecraft-server-studio-handoff.md');
    const software = String(server?.software || 'Minecraft server').replace(/[\r\n]/g, ' ').slice(0, 80);
    const minecraftVersion = String(server?.minecraftVersion || 'not recorded').replace(/[\r\n]/g, ' ').slice(0, 80);
    const markdown = [
      '# Minecraft Server Studio external editor handoff',
      '',
      'This app-private record was generated locally for a selected managed server.',
      '',
      `- Server software: ${software || 'not recorded'}`,
      `- Minecraft version: ${minecraftVersion || 'not recorded'}`,
      '- The server display name, root path, credentials, tokens, player data, and configuration contents are intentionally omitted.',
      '- Open the server root separately through the explicit “Open server root in editor” action when you need to inspect local files.',
      '',
      'No network request or command text was created by this handoff.'
    ].join('\n');
    const temporary = path.join(this.exportsDir, `.handoff-${process.pid}-${crypto.randomUUID()}.tmp`);
    try {
      await fs.writeFile(temporary, markdown, { encoding: 'utf8', mode: 0o600 });
      await fs.rename(temporary, recordPath);
      return recordPath;
    } catch {
      throw externalEditorError('EDITOR_HANDOFF_WRITE_FAILED', 'The safe external-editor handoff record could not be created.');
    } finally {
      await fs.rm(temporary, { force: true }).catch(() => {});
    }
  }

  async #spawnEditor(executablePath, targetPath) {
    await new Promise((resolve, reject) => {
      let child;
      try {
        child = spawn(executablePath, [targetPath], {
          detached: false,
          shell: false,
          stdio: 'ignore',
          windowsHide: true
        });
      } catch {
        reject(externalEditorError('EDITOR_LAUNCH_FAILED', 'The selected local editor could not be started. Check its installation and choose it again.'));
        return;
      }
      child.once('error', () => reject(externalEditorError('EDITOR_LAUNCH_FAILED', 'The selected local editor could not be started. Check its installation and choose it again.')));
      child.once('spawn', () => {
        child.unref();
        resolve();
      });
    });
  }
}

function publicCandidate(candidate, selectedId) {
  return Object.freeze({
    id: candidate.id,
    label: candidate.label,
    source: candidate.source,
    selected: candidate.id === selectedId
  });
}

module.exports = {
  ExternalEditorService,
  candidateLocations
};
