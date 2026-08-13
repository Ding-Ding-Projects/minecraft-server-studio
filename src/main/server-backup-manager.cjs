const crypto = require('node:crypto');
const fsNative = require('node:fs');
const fs = require('node:fs/promises');
const path = require('node:path');
const { Readable, Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');

const BACKUP_SCHEMA_VERSION = 1;
const BACKUP_PLAN_TTL_MS = 5 * 60 * 1000;
const MAX_BACKUP_FILES = 250_000;
const MAX_BACKUP_BYTES = 128 * 1024 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 32 * 1024 * 1024;
const MAX_JAR_BYTES = 1024 * 1024 * 1024;
const STORAGE_HEADROOM_BYTES = 64 * 1024 * 1024;
const COPY_BUFFER_BYTES = 1024 * 1024;
const UUID_PATTERN = /^[A-Za-z0-9._-]{1,160}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;

const CONFIG_FILES = Object.freeze([
  'server.properties',
  'eula.txt',
  'bukkit.yml',
  'spigot.yml',
  'paper.yml',
  'paper-global.yml',
  'paper-world-defaults.yml',
  'permissions.yml',
  'commands.yml',
  'help.yml',
  'ops.json',
  'whitelist.json',
  'banned-players.json',
  'banned-ips.json',
  'usercache.json'
]);

const CONFIG_DIRECTORIES = Object.freeze(['config']);
const TOP_LEVEL_FILE_ROOTS = new Set([...CONFIG_FILES, 'server.jar']);

function text(value, fallback = '') {
  return value === undefined || value === null ? fallback : String(value);
}

function nowToken(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

function safePathSegment(value, label) {
  const candidate = text(value).trim();
  if (!candidate || candidate === '.' || candidate === '..' || /[\\/\0]/.test(candidate)) {
    throw new Error(`${label} must be a single local path segment.`);
  }
  return candidate;
}

function safeRelativePath(value) {
  const normalized = text(value).replace(/\\/g, '/');
  const parts = normalized.split('/');
  if (!parts.length || parts.some((part) => !part || part === '.' || part === '..' || /\0/.test(part))) {
    throw new Error('A backup path was outside the approved local snapshot layout.');
  }
  return parts.join('/');
}

function safeJoin(root, relativePath) {
  const relative = safeRelativePath(relativePath);
  const resolvedRoot = path.resolve(root);
  const candidate = path.resolve(resolvedRoot, ...relative.split('/'));
  const difference = path.relative(resolvedRoot, candidate);
  if (!difference || difference === '' || difference === '..' || difference.startsWith(`..${path.sep}`) || path.isAbsolute(difference)) {
    throw new Error('A backup path escaped its approved local storage directory.');
  }
  return candidate;
}

function isWithin(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return Boolean(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function sha256Text(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function stableDigest(value) {
  return sha256Text(JSON.stringify(value));
}

async function lstatOptional(candidate) {
  try {
    return await fs.lstat(candidate);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function assertDirectory(candidate, label) {
  const info = await lstatOptional(candidate);
  if (!info || !info.isDirectory() || info.isSymbolicLink()) {
    throw new Error(`${label} must be a real local directory and cannot be a symbolic link.`);
  }
  return path.resolve(candidate);
}

async function ensureDirectory(candidate, label) {
  const existing = await lstatOptional(candidate);
  if (existing) {
    if (!existing.isDirectory() || existing.isSymbolicLink()) {
      throw new Error(`${label} must be a real local directory and cannot be a symbolic link.`);
    }
    return path.resolve(candidate);
  }
  await fs.mkdir(candidate, { recursive: true });
  return assertDirectory(candidate, label);
}

async function nearestExistingDirectory(candidate) {
  let current = path.resolve(candidate);
  while (true) {
    const info = await lstatOptional(current);
    if (info) return info.isDirectory() && !info.isSymbolicLink() ? current : null;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function toBigInt(value) {
  if (typeof value === 'bigint') return value;
  if (Number.isFinite(Number(value))) return BigInt(Math.max(0, Math.floor(Number(value))));
  return 0n;
}

function boundedNumber(value) {
  const upper = BigInt(Number.MAX_SAFE_INTEGER);
  if (value > upper) return Number.MAX_SAFE_INTEGER;
  return Number(value);
}

async function freeSpaceFor(candidate) {
  const existing = await nearestExistingDirectory(candidate);
  if (!existing || typeof fs.statfs !== 'function') {
    return { state: 'unavailable', path: existing || null, bytes: null, reason: 'The app could not verify free space for the backup destination.' };
  }
  try {
    const stat = await fs.statfs(existing, { bigint: true });
    const available = toBigInt(stat.bavail ?? stat.bfree) * toBigInt(stat.bsize);
    return { state: 'ready', path: existing, bytes: boundedNumber(available), reason: null };
  } catch (error) {
    return { state: 'unavailable', path: existing, bytes: null, reason: `The app could not verify free space for the backup destination: ${error.message}` };
  }
}

function categorySummary(files) {
  const categories = {};
  for (const file of files) {
    if (!categories[file.category]) categories[file.category] = { fileCount: 0, bytes: 0 };
    categories[file.category].fileCount += 1;
    categories[file.category].bytes += file.bytes;
  }
  return categories;
}

function backupDirectoryFor(backupStorageRoot, server) {
  return path.join(path.resolve(backupStorageRoot), safePathSegment(server.id, 'Server identifier'));
}

function backupNameFor(server, backupId) {
  return `${nowToken()}--${safePathSegment(server.id, 'Server identifier').slice(0, 12)}--${backupId.slice(0, 12)}.snapshot`;
}

function sourceDescriptor(server) {
  return {
    id: safePathSegment(server.id, 'Server identifier'),
    name: text(server.name).slice(0, 160),
    software: text(server.software).toLowerCase(),
    minecraftVersion: text(server.minecraftVersion).slice(0, 64),
    serverPath: path.resolve(server.serverPath),
    levelName: safePathSegment(server.levelName || server.settings?.['level-name'] || 'world', 'Level name')
  };
}

function selectedRoots(server) {
  const source = sourceDescriptor(server);
  const roots = [
    { relativePath: 'server.jar', category: 'server-jar', kind: 'file' },
    ...CONFIG_FILES.map((relativePath) => ({ relativePath, category: 'config', kind: 'file' })),
    ...CONFIG_DIRECTORIES.map((relativePath) => ({ relativePath, category: 'config', kind: 'directory' })),
    { relativePath: 'plugins', category: 'plugin-content', kind: 'directory' },
    { relativePath: 'logs', category: 'log', kind: 'directory' }
  ];
  const worldRoots = [source.levelName, `${source.levelName}_nether`, `${source.levelName}_the_end`];
  for (const relativePath of [...new Set(worldRoots)]) roots.push({ relativePath, category: 'world', kind: 'directory' });
  return roots;
}

function categoryForFile(selection, relativePath) {
  if (selection.category === 'plugin-content') return /\.jar$/i.test(relativePath) ? 'plugin-jar' : 'plugin-config';
  return selection.category;
}

function appendFile(collector, absolutePath, relativePath, category, stat) {
  if (collector.files.length >= MAX_BACKUP_FILES) {
    collector.blockers.push(`The backup includes more than ${MAX_BACKUP_FILES.toLocaleString()} files, which exceeds the safe snapshot limit.`);
    return;
  }
  if (stat.size < 0 || stat.size > MAX_BACKUP_BYTES || collector.totalBytes + stat.size > MAX_BACKUP_BYTES) {
    collector.blockers.push(`The backup exceeds the safe ${Math.floor(MAX_BACKUP_BYTES / 1024 / 1024 / 1024)} GB snapshot limit.`);
    return;
  }
  collector.files.push({
    absolutePath,
    relativePath: safeRelativePath(relativePath),
    category,
    bytes: stat.size,
    modifiedAt: stat.mtime.toISOString()
  });
  collector.totalBytes += stat.size;
}

async function collectDirectory(collector, root, relativeRoot, selection) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    if (collector.blockers.length) return;
    const absolutePath = path.join(root, entry.name);
    const relativePath = `${relativeRoot}/${entry.name}`;
    const stat = await lstatOptional(absolutePath);
    if (!stat) continue;
    if (stat.isSymbolicLink()) {
      collector.blockers.push(`The selected ${selection.category} path '${relativePath}' is a symbolic link. Backups refuse links so they cannot escape the server folder.`);
      return;
    }
    if (stat.isDirectory()) {
      await collectDirectory(collector, absolutePath, relativePath, selection);
      continue;
    }
    if (stat.isFile()) {
      appendFile(collector, absolutePath, relativePath, categoryForFile(selection, relativePath), stat);
      continue;
    }
    collector.skipped.push({ relativePath: safeRelativePath(relativePath), reason: 'The path is not a regular file or directory.' });
  }
}

async function collectServerInventory(server) {
  const source = sourceDescriptor(server);
  await assertDirectory(source.serverPath, 'The selected server folder');
  const collector = { files: [], totalBytes: 0, blockers: [], skipped: [] };
  for (const selection of selectedRoots(server)) {
    if (collector.blockers.length) break;
    const absolutePath = safeJoin(source.serverPath, selection.relativePath);
    const stat = await lstatOptional(absolutePath);
    if (!stat) continue;
    if (stat.isSymbolicLink()) {
      collector.blockers.push(`The selected ${selection.category} path '${selection.relativePath}' is a symbolic link. Backups refuse links so they cannot escape the server folder.`);
      break;
    }
    if (selection.kind === 'file') {
      if (!stat.isFile()) {
        collector.blockers.push(`The selected backup path '${selection.relativePath}' is not a regular file.`);
        break;
      }
      appendFile(collector, absolutePath, selection.relativePath, selection.category, stat);
      continue;
    }
    if (!stat.isDirectory()) {
      collector.blockers.push(`The selected backup path '${selection.relativePath}' is not a directory.`);
      break;
    }
    await collectDirectory(collector, absolutePath, selection.relativePath, selection);
  }
  return {
    source,
    files: collector.files.sort((left, right) => left.relativePath.localeCompare(right.relativePath)),
    totalBytes: collector.totalBytes,
    fileCount: collector.files.length,
    categories: categorySummary(collector.files),
    blockers: collector.blockers,
    skipped: collector.skipped
  };
}

function requiredStorageBytes(bytes) {
  return Math.ceil(bytes * 1.05) + STORAGE_HEADROOM_BYTES;
}

function backupPlanAuthority(plan) {
  return stableDigest({
    kind: 'minecraft-server-backup',
    serverId: plan.server.id,
    backupId: plan.backupId,
    destination: plan.destination.finalPath,
    fileCount: plan.inventory.fileCount,
    bytes: plan.inventory.totalBytes,
    generatedAt: plan.generatedAt
  });
}

async function createServerBackupPlan({ server, backupStorageRoot }) {
  const inventory = await collectServerInventory(server);
  const backupId = crypto.randomUUID();
  const backupDirectory = backupDirectoryFor(backupStorageRoot, server);
  const finalPath = path.join(backupDirectory, backupNameFor(server, backupId));
  const temporaryPath = `${finalPath}.tmp-${crypto.randomUUID()}`;
  const storage = await freeSpaceFor(backupDirectory);
  const requiredBytes = requiredStorageBytes(inventory.totalBytes);
  const blockers = [...inventory.blockers];
  if (!inventory.fileCount) blockers.push('No world, configuration, plugin, log, or server JAR files exist yet to snapshot.');
  if (storage.state !== 'ready') blockers.push(storage.reason);
  else if (storage.bytes < requiredBytes) blockers.push(`The backup destination has ${storage.bytes.toLocaleString()} free bytes but needs at least ${requiredBytes.toLocaleString()} bytes including headroom.`);
  const generatedAt = new Date().toISOString();
  const plan = {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    kind: 'minecraft-server-backup',
    backupId,
    generatedAt,
    expiresAt: new Date(Date.now() + BACKUP_PLAN_TTL_MS).toISOString(),
    server: inventory.source,
    state: blockers.length ? 'blocked' : 'ready',
    blockers,
    inventory,
    storage: {
      ...storage,
      requiredBytes
    },
    destination: {
      format: 'directory-snapshot',
      backupDirectory,
      finalPath,
      temporaryPath,
      manifestPath: path.join(finalPath, 'manifest.json')
    },
    restoration: {
      requiresStoppedServer: true,
      requiresDestructiveConfirmation: true,
      vaultCredentialsIncluded: false,
      instructions: [
        'Stop the server before restoring a snapshot.',
        'Prepare the restore plan, review the affected roots, complete both confirmations, and move the authorization control to its full value.',
        'The app creates a new pre-restore snapshot before replacing the selected managed server state.'
      ]
    }
  };
  plan.authority = { digest: backupPlanAuthority(plan), expiresAt: plan.expiresAt };
  return plan;
}

function publicBackupPlan(plan) {
  if (!plan) return null;
  return {
    kind: plan.kind,
    backupId: plan.backupId,
    generatedAt: plan.generatedAt,
    expiresAt: plan.expiresAt,
    state: plan.state,
    blockers: [...plan.blockers],
    authority: { ...plan.authority },
    inventory: {
      fileCount: plan.inventory.fileCount,
      totalBytes: plan.inventory.totalBytes,
      categories: { ...plan.inventory.categories },
      skipped: plan.inventory.skipped.map((entry) => ({ ...entry }))
    },
    storage: { ...plan.storage },
    consistency: plan.consistency ? { ...plan.consistency } : null,
    destination: {
      format: plan.destination.format,
      backupPath: plan.destination.finalPath,
      manifestPath: plan.destination.manifestPath
    },
    restoration: { ...plan.restoration }
  };
}

function assertCurrentPlan(plan, expectedKind) {
  if (!plan || plan.kind !== expectedKind) throw new Error('Prepare a current local plan before starting this operation.');
  if (Date.parse(plan.expiresAt) <= Date.now()) throw new Error('The prepared local plan expired. Refresh the preview before starting this operation.');
}

function assertDestructiveConfirmation(plan, confirmation, label) {
  const input = confirmation && typeof confirmation === 'object' ? confirmation : {};
  if (input.confirmed !== true || input.firstConfirmation !== true || input.secondConfirmation !== true || Number(input.sliderValue) < 100) {
    throw new Error(`${label} requires both independent confirmations and a full authorization slider.`);
  }
  if (text(input.digest) !== plan.authority?.digest) {
    throw new Error(`${label} must use the current reviewed plan. Refresh the preview and confirm it again.`);
  }
  return input;
}

async function sha256File(candidate) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    let bytes = 0;
    const input = fsNative.createReadStream(candidate, { highWaterMark: COPY_BUFFER_BYTES });
    input.on('data', (chunk) => {
      bytes += chunk.length;
      hash.update(chunk);
    });
    input.once('error', reject);
    input.once('end', () => resolve({ sha256: hash.digest('hex'), bytes }));
  });
}

async function copySnapshotFile(item, payloadRoot, onProgress) {
  const sourceStat = await lstatOptional(item.absolutePath);
  if (!sourceStat || !sourceStat.isFile() || sourceStat.isSymbolicLink()) {
    throw new Error(`The planned source '${item.relativePath}' changed into an unavailable or unsafe path before the snapshot could start.`);
  }
  const destination = safeJoin(payloadRoot, item.relativePath);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.copyFile(item.absolutePath, destination);
  const targetStat = await lstatOptional(destination);
  if (!targetStat || !targetStat.isFile() || targetStat.isSymbolicLink()) {
    throw new Error(`The snapshot target for '${item.relativePath}' could not be validated.`);
  }
  const digest = await sha256File(destination);
  onProgress?.({ relativePath: item.relativePath, copiedBytes: digest.bytes });
  return {
    category: item.category,
    relativePath: item.relativePath,
    bytes: digest.bytes,
    sha256: digest.sha256,
    modifiedAt: sourceStat.mtime.toISOString()
  };
}

async function writeJsonAtomically(target, payload) {
  const directory = path.dirname(target);
  await ensureDirectory(directory, 'The snapshot manifest directory');
  const temporary = `${target}.tmp-${crypto.randomUUID()}`;
  await fs.writeFile(temporary, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  await fs.rename(temporary, target);
}

async function executeServerBackupPlan(plan, { onProgress } = {}) {
  assertCurrentPlan(plan, 'minecraft-server-backup');
  if (plan.state !== 'ready') throw new Error(plan.blockers[0] || 'The prepared backup plan is blocked.');
  const refreshedInventory = await collectServerInventory({
    id: plan.server.id,
    name: plan.server.name,
    software: plan.server.software,
    minecraftVersion: plan.server.minecraftVersion,
    serverPath: plan.server.serverPath,
    settings: { 'level-name': plan.server.levelName }
  });
  if (refreshedInventory.blockers.length) throw new Error(refreshedInventory.blockers[0]);
  if (!refreshedInventory.fileCount) throw new Error('No managed server files remain available for the snapshot.');
  const requiredBytes = requiredStorageBytes(refreshedInventory.totalBytes);
  const storage = await freeSpaceFor(plan.destination.backupDirectory);
  if (storage.state !== 'ready') throw new Error(storage.reason);
  if (storage.bytes < requiredBytes) throw new Error(`The backup destination has insufficient free space after the current server inventory was read. It needs at least ${requiredBytes.toLocaleString()} bytes.`);
  await ensureDirectory(plan.destination.backupDirectory, 'The app backup storage directory');
  const finalExists = await lstatOptional(plan.destination.finalPath);
  if (finalExists) throw new Error('The planned snapshot destination already exists. Prepare a new backup preview.');
  await fs.mkdir(plan.destination.temporaryPath, { recursive: false });
  const payloadRoot = path.join(plan.destination.temporaryPath, 'payload');
  try {
    await ensureDirectory(payloadRoot, 'The temporary snapshot payload directory');
    const files = [];
    for (const [index, item] of refreshedInventory.files.entries()) {
      files.push(await copySnapshotFile(item, payloadRoot, (progress) => onProgress?.({ ...progress, completedFiles: index + 1, totalFiles: refreshedInventory.fileCount })));
    }
    const manifest = {
      schemaVersion: BACKUP_SCHEMA_VERSION,
      kind: 'minecraft-server-studio-directory-snapshot',
      backupId: plan.backupId,
      createdAt: new Date().toISOString(),
      server: {
        id: plan.server.id,
        name: plan.server.name,
        software: plan.server.software,
        minecraftVersion: plan.server.minecraftVersion
      },
      source: {
        format: 'selected-world-config-plugin-log-and-server-jar-state',
        consistency: 'The server was either stopped or the local process acknowledged save-all before this snapshot was copied.',
        vaultCredentialsIncluded: false,
        credentialBoundary: 'The snapshot never reads, copies, or serializes the app credential vault.'
      },
      inventory: {
        fileCount: files.length,
        totalBytes: files.reduce((total, file) => total + file.bytes, 0),
        categories: categorySummary(files),
        skipped: refreshedInventory.skipped
      },
      files,
      restoration: {
        requiresStoppedServer: true,
        requiresDestructiveConfirmation: true,
        createsPreRestoreBackup: true,
        instructions: [
          'Choose this snapshot in the Backups and Paper updates tab.',
          'Stop the selected server, prepare the restore plan, and review every affected root.',
          'Complete both confirmations and the full authorization slider before replacement begins.',
          'The app creates a new safety snapshot before replacing the managed files listed in this manifest.'
        ]
      }
    };
    await writeJsonAtomically(path.join(plan.destination.temporaryPath, 'manifest.json'), manifest);
    await fs.rename(plan.destination.temporaryPath, plan.destination.finalPath);
    return {
      backupId: manifest.backupId,
      createdAt: manifest.createdAt,
      backupPath: plan.destination.finalPath,
      manifestPath: path.join(plan.destination.finalPath, 'manifest.json'),
      fileCount: manifest.inventory.fileCount,
      totalBytes: manifest.inventory.totalBytes,
      categories: { ...manifest.inventory.categories },
      restoreAvailable: true
    };
  } catch (error) {
    await fs.rm(plan.destination.temporaryPath, { recursive: true, force: true });
    throw error;
  }
}

async function readManifest(manifestPath) {
  const stat = await lstatOptional(manifestPath);
  if (!stat || !stat.isFile() || stat.isSymbolicLink()) throw new Error('The selected backup manifest is missing or unsafe.');
  if (stat.size > MAX_MANIFEST_BYTES) throw new Error('The selected backup manifest exceeds the safe size limit.');
  let parsed;
  try {
    parsed = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  } catch {
    throw new Error('The selected backup manifest is not valid JSON.');
  }
  return validateManifest(parsed);
}

function validateManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || manifest.schemaVersion !== BACKUP_SCHEMA_VERSION || manifest.kind !== 'minecraft-server-studio-directory-snapshot') {
    throw new Error('The selected backup manifest does not use a supported snapshot schema.');
  }
  if (!UUID_PATTERN.test(text(manifest.backupId)) || !manifest.server || !UUID_PATTERN.test(text(manifest.server.id))) {
    throw new Error('The selected backup manifest has an invalid server or backup identifier.');
  }
  if (!Array.isArray(manifest.files) || manifest.files.length > MAX_BACKUP_FILES) throw new Error('The selected backup manifest has an unsafe file list.');
  const seen = new Set();
  let totalBytes = 0;
  for (const file of manifest.files) {
    if (!file || typeof file !== 'object') throw new Error('The selected backup manifest contains an invalid file record.');
    const relativePath = safeRelativePath(file.relativePath);
    if (seen.has(relativePath)) throw new Error('The selected backup manifest contains a duplicate file path.');
    seen.add(relativePath);
    if (!['world', 'config', 'plugin-jar', 'plugin-config', 'log', 'server-jar'].includes(file.category)) {
      throw new Error('The selected backup manifest contains an unknown file category.');
    }
    if (!Number.isSafeInteger(file.bytes) || file.bytes < 0 || file.bytes > MAX_BACKUP_BYTES) throw new Error('The selected backup manifest contains an invalid file size.');
    if (!SHA256_PATTERN.test(text(file.sha256))) throw new Error('The selected backup manifest contains an invalid SHA-256 value.');
    if (file.category === 'server-jar' && relativePath !== 'server.jar') throw new Error('The selected backup manifest has an invalid server JAR path.');
    if ((file.category === 'plugin-jar' || file.category === 'plugin-config') && !relativePath.startsWith('plugins/')) throw new Error('The selected backup manifest has an invalid plugin path.');
    if (file.category === 'log' && !relativePath.startsWith('logs/')) throw new Error('The selected backup manifest has an invalid log path.');
    totalBytes += file.bytes;
    if (totalBytes > MAX_BACKUP_BYTES) throw new Error('The selected backup manifest exceeds the safe snapshot byte limit.');
  }
  return manifest;
}

function validateManifestForServer(manifest, server) {
  const source = sourceDescriptor(server);
  if (manifest.server.id !== source.id) throw new Error('The selected backup belongs to a different local server.');
  const worldRoots = new Set([source.levelName, `${source.levelName}_nether`, `${source.levelName}_the_end`]);
  for (const file of manifest.files) {
    const relativePath = safeRelativePath(file.relativePath);
    const root = relativePath.split('/')[0];
    if (file.category === 'world' && !worldRoots.has(root)) throw new Error('The selected backup has a world path that does not match the selected server configuration.');
    if (file.category === 'config' && !TOP_LEVEL_FILE_ROOTS.has(root) && root !== 'config') throw new Error('The selected backup has an unexpected configuration restore root.');
    if ((file.category === 'plugin-jar' || file.category === 'plugin-config') && root !== 'plugins') throw new Error('The selected backup has an unexpected plugin restore root.');
    if (file.category === 'log' && root !== 'logs') throw new Error('The selected backup has an unexpected log restore root.');
    if (file.category === 'server-jar' && root !== 'server.jar') throw new Error('The selected backup has an unexpected server JAR restore root.');
  }
  return manifest;
}

async function listServerBackups({ server, backupStorageRoot }) {
  const backupDirectory = backupDirectoryFor(backupStorageRoot, server);
  const rootStat = await lstatOptional(backupDirectory);
  if (!rootStat) return [];
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error('The app backup storage directory is unsafe.');
  const entries = await fs.readdir(backupDirectory, { withFileTypes: true });
  const records = [];
  for (const entry of entries.filter((candidate) => candidate.isDirectory() && !candidate.isSymbolicLink()).slice(0, 512)) {
    const backupPath = path.join(backupDirectory, entry.name);
    try {
      const manifest = await readManifest(path.join(backupPath, 'manifest.json'));
      if (manifest.server.id !== server.id) continue;
      const fileCount = manifest.files.length;
      const totalBytes = manifest.files.reduce((total, file) => total + file.bytes, 0);
      records.push({
        backupId: manifest.backupId,
        createdAt: manifest.createdAt,
        backupPath,
        manifestPath: path.join(backupPath, 'manifest.json'),
        fileCount,
        totalBytes,
        categories: categorySummary(manifest.files),
        restoreAvailable: true
      });
    } catch {
      // Ignore corrupt or incomplete directories while preserving them for manual inspection.
    }
  }
  return records.sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
}

async function findServerBackup({ server, backupStorageRoot, backupId }) {
  const requested = text(backupId).trim();
  if (!UUID_PATTERN.test(requested)) throw new Error('Choose a valid local backup before preparing a restore.');
  const records = await listServerBackups({ server, backupStorageRoot });
  const record = records.find((candidate) => candidate.backupId === requested);
  if (!record) throw new Error('The selected local backup is unavailable, incomplete, or belongs to another server.');
  const manifest = validateManifestForServer(await readManifest(record.manifestPath), server);
  return { record, manifest };
}

function restoreTargetsFor(manifest) {
  const targets = new Set();
  for (const file of manifest.files) {
    const relativePath = safeRelativePath(file.relativePath);
    const target = relativePath.includes('/') ? relativePath.split('/')[0] : relativePath;
    if (target === '.minecraft-server-studio' || target === 'credential-vault') throw new Error('The selected backup attempts to restore a protected app-control path.');
    if (!TOP_LEVEL_FILE_ROOTS.has(target) && !['plugins', 'logs', 'config'].includes(target) && !safePathSegment(target, 'Backup restore root')) {
      throw new Error('The selected backup has an unsafe restore root.');
    }
    targets.add(target);
  }
  return [...targets].sort((left, right) => left.localeCompare(right));
}

function createServerRestorePlan({ server, backup }) {
  const generatedAt = new Date().toISOString();
  const plan = {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    kind: 'minecraft-server-restore',
    id: crypto.randomUUID(),
    generatedAt,
    expiresAt: new Date(Date.now() + BACKUP_PLAN_TTL_MS).toISOString(),
    state: 'ready',
    blockers: [],
    server: sourceDescriptor(server),
    backup: { ...backup.record },
    targets: restoreTargetsFor(backup.manifest),
    destructive: {
      requiresStoppedServer: true,
      requiresBackupFirst: true,
      requiresDestructiveConfirmation: true,
      note: 'Restore replaces the listed world, configuration, plugin, log, and server JAR roots. Plugin updates are never fetched or changed separately.'
    }
  };
  plan.authority = {
    digest: stableDigest({ kind: plan.kind, id: plan.id, backupId: plan.backup.backupId, targets: plan.targets, generatedAt }),
    expiresAt: plan.expiresAt
  };
  return plan;
}

function publicRestorePlan(plan) {
  if (!plan) return null;
  return {
    kind: plan.kind,
    id: plan.id,
    generatedAt: plan.generatedAt,
    expiresAt: plan.expiresAt,
    state: plan.state,
    blockers: [...(plan.blockers || [])],
    backup: { ...plan.backup },
    targets: [...plan.targets],
    destructive: { ...plan.destructive },
    authority: { ...plan.authority }
  };
}

async function stageRestorePayload(plan) {
  assertCurrentPlan(plan, 'minecraft-server-restore');
  const serverRoot = await assertDirectory(plan.server.serverPath, 'The selected server folder');
  const controlRoot = await ensureDirectory(path.join(serverRoot, '.minecraft-server-studio'), 'The server control directory');
  const stagingRoot = await ensureDirectory(path.join(controlRoot, 'restore-staging'), 'The server restore staging directory');
  const stagePath = path.join(stagingRoot, `restore-${plan.id}`);
  const stageExists = await lstatOptional(stagePath);
  if (stageExists) throw new Error('The prepared restore staging directory already exists. Prepare a new restore plan.');
  const manifest = validateManifestForServer(await readManifest(plan.backup.manifestPath), plan.server);
  if (manifest.backupId !== plan.backup.backupId) throw new Error('The selected backup no longer matches the prepared restore plan.');
  await fs.mkdir(stagePath, { recursive: false });
  const payloadTarget = path.join(stagePath, 'payload');
  try {
    await ensureDirectory(payloadTarget, 'The temporary restore payload directory');
    for (const file of manifest.files) {
      const source = safeJoin(path.join(plan.backup.backupPath, 'payload'), file.relativePath);
      const sourceStat = await lstatOptional(source);
      if (!sourceStat || !sourceStat.isFile() || sourceStat.isSymbolicLink()) throw new Error(`The backup payload for '${file.relativePath}' is missing or unsafe.`);
      const sourceDigest = await sha256File(source);
      if (sourceDigest.bytes !== file.bytes || sourceDigest.sha256.toLowerCase() !== file.sha256.toLowerCase()) throw new Error(`The backup payload for '${file.relativePath}' no longer matches its manifest hash.`);
      const destination = safeJoin(payloadTarget, file.relativePath);
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.copyFile(source, destination);
      const copiedDigest = await sha256File(destination);
      if (copiedDigest.bytes !== file.bytes || copiedDigest.sha256.toLowerCase() !== file.sha256.toLowerCase()) throw new Error(`The staged restore copy for '${file.relativePath}' did not match its manifest hash.`);
    }
    return { stagePath, payloadTarget, manifest };
  } catch (error) {
    await fs.rm(stagePath, { recursive: true, force: true });
    throw error;
  }
}

async function assertReplaceableTarget(serverRoot, target) {
  const destination = path.join(serverRoot, target);
  const stat = await lstatOptional(destination);
  if (stat?.isSymbolicLink()) throw new Error(`The existing restore target '${target}' is a symbolic link. Restore refuses to replace links.`);
  return { destination, exists: Boolean(stat) };
}

async function restoreServerSnapshot(plan) {
  const staged = await stageRestorePayload(plan);
  const serverRoot = path.resolve(plan.server.serverPath);
  const rollbackRoot = path.join(staged.stagePath, 'previous');
  const rejectedRoot = path.join(staged.stagePath, 'rejected');
  const moves = [];
  try {
    for (const target of plan.targets) {
      const source = path.join(staged.payloadTarget, target);
      const sourceStat = await lstatOptional(source);
      if (!sourceStat || sourceStat.isSymbolicLink()) throw new Error(`The staged restore target '${target}' is missing or unsafe.`);
      const { destination, exists } = await assertReplaceableTarget(serverRoot, target);
      const previous = path.join(rollbackRoot, target);
      await fs.mkdir(path.dirname(previous), { recursive: true });
      if (exists) await fs.rename(destination, previous);
      moves.push({ target, destination, previous, movedExisting: exists, installed: false });
      await fs.rename(source, destination);
      moves[moves.length - 1].installed = true;
    }
    let stagingRetained = false;
    try {
      await fs.rm(staged.stagePath, { recursive: true, force: true });
    } catch {
      stagingRetained = true;
    }
    return {
      restoredBackupId: plan.backup.backupId,
      restoredAt: new Date().toISOString(),
      targets: [...plan.targets],
      stagingRetained
    };
  } catch (error) {
    for (const move of [...moves].reverse()) {
      try {
        if (move.installed && await lstatOptional(move.destination)) {
          const rejected = path.join(rejectedRoot, move.target);
          await fs.mkdir(path.dirname(rejected), { recursive: true });
          await fs.rename(move.destination, rejected);
        }
        if (move.movedExisting && await lstatOptional(move.previous)) await fs.rename(move.previous, move.destination);
      } catch {
        // The staging directory remains in place with the most recent recoverable paths for manual repair.
      }
    }
    throw new Error(`${error.message} The app retained the server-local restore staging directory for recovery.`);
  }
}

async function fetchJson(url, { userAgent, timeoutMs = 30_000 } = {}) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') throw new Error('Official Paper metadata must use HTTPS.');
  const response = await fetch(parsed, {
    headers: { 'User-Agent': userAgent || 'Minecraft Server Studio/0.1.0 (https://github.com/Ding-Ding-Projects/minecraft-server-studio)' },
    redirect: 'error',
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!response.ok) throw new Error(`Official Paper metadata request failed with HTTP ${response.status}.`);
  const payload = await response.json();
  return payload;
}

function buildNumber(build) {
  const value = Number(build?.number ?? build?.id ?? build?.build);
  return Number.isFinite(value) ? value : -1;
}

function parsePaperStableBuild(minecraftVersion, payload) {
  if (!Array.isArray(payload)) throw new Error('Official Paper metadata returned an unsupported build list.');
  const candidates = payload
    .filter((build) => text(build?.channel).toUpperCase() === 'STABLE')
    .map((build) => ({ build, download: build?.downloads?.['server:default'] }))
    .filter((candidate) => candidate.download && typeof candidate.download === 'object')
    .sort((left, right) => buildNumber(right.build) - buildNumber(left.build));
  const candidate = candidates[0];
  if (!candidate) throw new Error(`Paper does not currently publish a stable build for Minecraft ${minecraftVersion}.`);
  const url = text(candidate.download.url).trim();
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'fill-data.papermc.io') {
    throw new Error('Official Paper metadata did not provide an approved HTTPS data URL.');
  }
  const sha256 = text(candidate.download.checksums?.sha256).trim().toLowerCase();
  if (!SHA256_PATTERN.test(sha256)) throw new Error('Official Paper metadata did not provide a valid SHA-256 value for the stable server JAR.');
  const bytes = Number(candidate.download.size);
  if (!Number.isSafeInteger(bytes) || bytes < 1024 || bytes > MAX_JAR_BYTES) throw new Error('Official Paper metadata did not provide a safe server JAR size.');
  const name = text(candidate.download.name).trim();
  if (!name || !/\.jar$/i.test(name)) throw new Error('Official Paper metadata did not provide a server JAR filename.');
  return {
    project: 'paper',
    minecraftVersion,
    channel: 'STABLE',
    build: buildNumber(candidate.build),
    name,
    url: parsed.toString(),
    sha256,
    bytes,
    fetchedAt: new Date().toISOString(),
    source: 'PaperMC Downloads Service v3'
  };
}

async function fetchLatestStablePaperBuild(minecraftVersion) {
  const version = text(minecraftVersion).trim();
  if (!/^\d+\.\d+(?:\.\d+)?$/.test(version) && !/^\d+\.\d+$/.test(version)) throw new Error('Choose a numeric Minecraft version before checking for a Paper update.');
  const endpoint = `https://fill.papermc.io/v3/projects/paper/versions/${encodeURIComponent(version)}/builds`;
  return parsePaperStableBuild(version, await fetchJson(endpoint));
}

async function validateJarFile(candidate, expected = null) {
  const stat = await lstatOptional(candidate);
  if (!stat || !stat.isFile() || stat.isSymbolicLink()) throw new Error('The server JAR is missing or unsafe.');
  if (stat.size < 1024 || stat.size > MAX_JAR_BYTES) throw new Error('The server JAR size is outside the safe local validation range.');
  const handle = await fs.open(candidate, 'r');
  const header = Buffer.alloc(4);
  try {
    await handle.read(header, 0, header.length, 0);
  } finally {
    await handle.close();
  }
  const zipHeader = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
  const emptyZipHeader = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
  if (!header.equals(zipHeader) && !header.equals(emptyZipHeader)) throw new Error('The staged server file is not a JAR/ZIP archive. The existing server JAR was not changed.');
  const digest = await sha256File(candidate);
  if (expected?.sha256 && digest.sha256.toLowerCase() !== text(expected.sha256).toLowerCase()) throw new Error('The staged server JAR did not match the SHA-256 value from official Paper metadata.');
  if (expected?.bytes && digest.bytes !== Number(expected.bytes)) throw new Error('The staged server JAR size did not match the size from official Paper metadata.');
  return digest;
}

async function downloadVerifiedJar(url, destination, expected, onProgress) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'fill-data.papermc.io') throw new Error('Paper updates only download from the approved HTTPS Paper data host.');
  const destinationStat = await lstatOptional(destination);
  if (destinationStat) throw new Error('The Paper update staging target already exists. Prepare a new update preview.');
  const response = await fetch(parsed, {
    headers: { 'User-Agent': 'Minecraft Server Studio/0.1.0 (https://github.com/Ding-Ding-Projects/minecraft-server-studio)' },
    redirect: 'error',
    signal: AbortSignal.timeout(120_000)
  });
  if (!response.ok || !response.body) throw new Error(`Paper update download failed with HTTP ${response.status}.`);
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && (contentLength < 1024 || contentLength > MAX_JAR_BYTES || contentLength !== expected.bytes)) {
    throw new Error('The Paper download response did not match the reviewed size metadata.');
  }
  await fs.mkdir(path.dirname(destination), { recursive: true });
  let bytes = 0;
  const hash = crypto.createHash('sha256');
  const counter = new Transform({
    transform(chunk, _encoding, callback) {
      bytes += chunk.length;
      if (bytes > MAX_JAR_BYTES) {
        callback(new Error('The Paper download exceeded the safe server JAR size limit.'));
        return;
      }
      hash.update(chunk);
      onProgress?.({ bytes, expectedBytes: expected.bytes });
      callback(null, chunk);
    }
  });
  try {
    await pipeline(Readable.fromWeb(response.body), counter, fsNative.createWriteStream(destination, { flags: 'wx' }));
    const sha256 = hash.digest('hex');
    if (bytes !== expected.bytes || sha256.toLowerCase() !== text(expected.sha256).toLowerCase()) {
      throw new Error('The Paper download did not match the reviewed official checksum or byte size.');
    }
    return validateJarFile(destination, expected);
  } catch (error) {
    await fs.rm(destination, { force: true });
    throw error;
  }
}

async function updateControlDirectories(serverPath) {
  const serverRoot = await assertDirectory(serverPath, 'The selected server folder');
  const controlRoot = await ensureDirectory(path.join(serverRoot, '.minecraft-server-studio'), 'The server control directory');
  const stagingRoot = await ensureDirectory(path.join(controlRoot, 'update-staging'), 'The Paper update staging directory');
  const rollbackRoot = await ensureDirectory(path.join(controlRoot, 'jar-rollbacks'), 'The Paper update rollback directory');
  return { serverRoot, controlRoot, stagingRoot, rollbackRoot };
}

function updatePlanAuthority(plan) {
  return stableDigest({
    kind: plan.kind,
    id: plan.id,
    serverId: plan.server.id,
    currentSha256: plan.currentJar.sha256,
    releaseSha256: plan.release.sha256,
    releaseBuild: plan.release.build,
    generatedAt: plan.generatedAt
  });
}

async function createPaperUpdatePlan({ server, backupPlan }) {
  const source = sourceDescriptor(server);
  const serverRoot = await assertDirectory(source.serverPath, 'The selected server folder');
  const jarPath = path.join(serverRoot, 'server.jar');
  const currentJar = await validateJarFile(jarPath);
  const release = await fetchLatestStablePaperBuild(source.minecraftVersion);
  const generatedAt = new Date().toISOString();
  const id = crypto.randomUUID();
  const controlPath = path.join(serverRoot, '.minecraft-server-studio', 'update-staging', `paper-${id}`);
  const state = currentJar.sha256.toLowerCase() === release.sha256.toLowerCase()
    ? 'up-to-date'
    : backupPlan?.state === 'ready' ? 'ready' : 'blocked';
  const blockers = [];
  if (state === 'blocked') blockers.push(backupPlan?.blockers?.[0] || 'A current server backup preview is required before a Paper update can start.');
  const plan = {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    kind: 'paper-server-update',
    id,
    generatedAt,
    expiresAt: new Date(Date.now() + BACKUP_PLAN_TTL_MS).toISOString(),
    state,
    blockers,
    server: source,
    currentJar: { path: jarPath, sha256: currentJar.sha256, bytes: currentJar.bytes },
    release,
    backupPlan,
    staging: { directory: controlPath, jarPath: path.join(controlPath, 'server.jar') },
    replacement: {
      requiresStoppedServer: true,
      requiresBackupFirst: true,
      requiresDestructiveConfirmation: true,
      autoUpdatesPlugins: false,
      note: 'Only server.jar is replaced. Plugin JARs and plugin configuration are never downloaded, upgraded, or replaced by the Paper update flow.'
    }
  };
  plan.authority = { digest: updatePlanAuthority(plan), expiresAt: plan.expiresAt };
  return plan;
}

function publicPaperUpdatePlan(plan) {
  if (!plan) return null;
  return {
    kind: plan.kind,
    id: plan.id,
    generatedAt: plan.generatedAt,
    expiresAt: plan.expiresAt,
    state: plan.state,
    blockers: [...plan.blockers],
    authority: { ...plan.authority },
    currentJar: { sha256: plan.currentJar.sha256, bytes: plan.currentJar.bytes },
    release: {
      minecraftVersion: plan.release.minecraftVersion,
      channel: plan.release.channel,
      build: plan.release.build,
      name: plan.release.name,
      sha256: plan.release.sha256,
      bytes: plan.release.bytes,
      source: plan.release.source,
      fetchedAt: plan.release.fetchedAt
    },
    backupPreflight: publicBackupPlan(plan.backupPlan),
    replacement: { ...plan.replacement }
  };
}

async function promoteStagedJar({ serverPath, stagedJar, rollbackLabel }) {
  const { serverRoot, rollbackRoot } = await updateControlDirectories(serverPath);
  const destination = path.join(serverRoot, 'server.jar');
  const current = await validateJarFile(destination);
  const rollbackJar = path.join(rollbackRoot, `${nowToken()}--${safePathSegment(rollbackLabel, 'Rollback label')}.jar`);
  await fs.rename(destination, rollbackJar);
  try {
    await fs.rename(stagedJar, destination);
  } catch (error) {
    try {
      await fs.rename(rollbackJar, destination);
    } catch {
      // The rollback file remains in the app-controlled rollback directory for recovery.
    }
    throw new Error(`${error.message} The current server JAR was retained in the app-controlled rollback directory.`);
  }
  return { destination, rollbackJar, previous: current };
}

async function applyPaperUpdatePlan(plan, { onProgress } = {}) {
  assertCurrentPlan(plan, 'paper-server-update');
  if (plan.state !== 'ready') throw new Error(plan.state === 'up-to-date' ? 'The selected server JAR already matches the latest reviewed stable Paper build.' : (plan.blockers[0] || 'The Paper update plan is blocked.'));
  const current = await validateJarFile(plan.currentJar.path);
  if (current.sha256.toLowerCase() !== plan.currentJar.sha256.toLowerCase()) throw new Error('The current server JAR changed after the update preview. Review a new Paper update plan before replacement.');
  const { stagingRoot } = await updateControlDirectories(plan.server.serverPath);
  if (!isWithin(stagingRoot, plan.staging.jarPath)) throw new Error('The Paper update staging target is outside the app-controlled server staging directory.');
  const stageDirectory = path.dirname(plan.staging.jarPath);
  const stageExisting = await lstatOptional(stageDirectory);
  if (stageExisting) throw new Error('The Paper update staging directory already exists. Prepare a new update preview.');
  await fs.mkdir(stageDirectory, { recursive: false });
  try {
    const verified = await downloadVerifiedJar(plan.release.url, plan.staging.jarPath, plan.release, onProgress);
    const promotion = await promoteStagedJar({
      serverPath: plan.server.serverPath,
      stagedJar: plan.staging.jarPath,
      rollbackLabel: `before-paper-${plan.release.build}`
    });
    try {
      await fs.rm(stageDirectory, { recursive: true, force: true });
    } catch {
      // A completed promotion remains valid; an empty app-controlled staging folder is safe to retain for later cleanup.
    }
    return {
      updatedAt: new Date().toISOString(),
      jarPath: promotion.destination,
      rollbackJar: promotion.rollbackJar,
      backupReference: null,
      previousJar: promotion.previous,
      release: { ...plan.release, sha256: verified.sha256, bytes: verified.bytes }
    };
  } catch (error) {
    await fs.rm(stageDirectory, { recursive: true, force: true });
    throw error;
  }
}

async function createPaperRollbackPlan({ server, lastPaperUpdate, backupPlan }) {
  const source = sourceDescriptor(server);
  const generatedAt = new Date().toISOString();
  const blockers = [];
  const rollbackJar = text(lastPaperUpdate?.rollbackJar).trim();
  if (!rollbackJar) blockers.push('No retained Paper JAR rollback record is available for this server.');
  const controlRoot = path.join(source.serverPath, '.minecraft-server-studio', 'jar-rollbacks');
  if (rollbackJar && !isWithin(controlRoot, rollbackJar)) blockers.push('The retained Paper rollback reference is outside the app-controlled rollback directory.');
  if (rollbackJar) {
    const stat = await lstatOptional(rollbackJar);
    if (!stat || !stat.isFile() || stat.isSymbolicLink()) blockers.push('The retained Paper rollback JAR is no longer available.');
  }
  if (backupPlan?.state !== 'ready') blockers.push(backupPlan?.blockers?.[0] || 'A current server backup preview is required before a JAR replacement.');
  const currentJar = await validateJarFile(path.join(source.serverPath, 'server.jar'));
  const plan = {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    kind: 'paper-server-rollback',
    id: crypto.randomUUID(),
    generatedAt,
    expiresAt: new Date(Date.now() + BACKUP_PLAN_TTL_MS).toISOString(),
    state: blockers.length ? 'blocked' : 'ready',
    blockers,
    server: source,
    currentJar,
    rollbackJar,
    backupPlan,
    replacement: {
      requiresStoppedServer: true,
      requiresBackupFirst: true,
      requiresDestructiveConfirmation: true,
      autoUpdatesPlugins: false,
      note: 'Only server.jar is replaced. Plugin JARs and plugin configuration are never changed by rollback.'
    }
  };
  plan.authority = {
    digest: stableDigest({ kind: plan.kind, id: plan.id, serverId: source.id, currentSha256: currentJar.sha256, rollbackJar, generatedAt }),
    expiresAt: plan.expiresAt
  };
  return plan;
}

function publicPaperRollbackPlan(plan) {
  if (!plan) return null;
  return {
    kind: plan.kind,
    id: plan.id,
    generatedAt: plan.generatedAt,
    expiresAt: plan.expiresAt,
    state: plan.state,
    blockers: [...plan.blockers],
    authority: { ...plan.authority },
    rollbackJar: plan.rollbackJar || null,
    currentJar: { sha256: plan.currentJar.sha256, bytes: plan.currentJar.bytes },
    backupPreflight: publicBackupPlan(plan.backupPlan),
    replacement: { ...plan.replacement }
  };
}

async function applyPaperRollbackPlan(plan) {
  assertCurrentPlan(plan, 'paper-server-rollback');
  if (plan.state !== 'ready') throw new Error(plan.blockers[0] || 'The Paper rollback plan is blocked.');
  const current = await validateJarFile(path.join(plan.server.serverPath, 'server.jar'));
  if (current.sha256.toLowerCase() !== plan.currentJar.sha256.toLowerCase()) throw new Error('The current server JAR changed after the rollback preview. Review a new rollback plan before replacement.');
  const staged = await validateJarFile(plan.rollbackJar);
  const promotion = await promoteStagedJar({
    serverPath: plan.server.serverPath,
    stagedJar: plan.rollbackJar,
    rollbackLabel: 'before-paper-rollback'
  });
  return {
    rolledBackAt: new Date().toISOString(),
    jarPath: promotion.destination,
    rollbackJar: promotion.rollbackJar,
    restoredJar: staged,
    previousJar: promotion.previous
  };
}

module.exports = {
  BACKUP_PLAN_TTL_MS,
  applyPaperRollbackPlan,
  applyPaperUpdatePlan,
  assertCurrentPlan,
  assertDestructiveConfirmation,
  createPaperRollbackPlan,
  createPaperUpdatePlan,
  createServerBackupPlan,
  createServerRestorePlan,
  executeServerBackupPlan,
  fetchLatestStablePaperBuild,
  findServerBackup,
  listServerBackups,
  publicBackupPlan,
  publicPaperRollbackPlan,
  publicPaperUpdatePlan,
  publicRestorePlan,
  restoreServerSnapshot,
  sha256File,
  validateJarFile
};
