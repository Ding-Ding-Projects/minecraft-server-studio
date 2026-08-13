const state = {
  servers: [],
  selectedId: null,
  dependencies: null,
  dependencyErrors: {},
  logs: [],
  activeTab: 'general',
  pluginPath: ''
};

const ADVANCED_FIELDS = [
  { key: 'accepts-transfers', label: 'Accept player transfers', type: 'boolean', help: 'Allow compatible server-transfer requests.' },
  { key: 'broadcast-console-to-ops', label: 'Broadcast console messages to operators', type: 'boolean', help: 'Forward console output to online operators.' },
  { key: 'bug-report-link', label: 'Bug report link', type: 'url', help: 'Optional URL included in crash reporting context.' },
  { key: 'debug', label: 'Debug logging', type: 'boolean', help: 'Enable additional server debug output.' },
  { key: 'enable-jmx-monitoring', label: 'Enable JMX monitoring', type: 'boolean', help: 'Expose Java management metrics for supported monitoring tools.' },
  { key: 'enable-status', label: 'Enable server-list status', type: 'boolean', help: 'Respond to normal Minecraft status pings.' },
  { key: 'enforce-whitelist', label: 'Enforce whitelist after reload', type: 'boolean', help: 'Remove non-whitelisted players after whitelist updates.' },
  { key: 'generator-settings', label: 'Generator settings', type: 'text', help: 'Version-specific generator configuration text.' },
  { key: 'initial-disabled-packs', label: 'Initially disabled data packs', type: 'text', help: 'Comma-separated pack IDs for new worlds.' },
  { key: 'initial-enabled-packs', label: 'Initially enabled data packs', type: 'text', help: 'Comma-separated pack IDs for new worlds.' },
  { key: 'log-ips', label: 'Log player IP addresses', type: 'boolean', help: 'Include IP addresses in Minecraft server logs.' },
  { key: 'max-chained-neighbor-updates', label: 'Maximum chained neighbor updates', type: 'number', min: 1, max: 100000000, help: 'Bound chained redstone and block updates.' },
  { key: 'max-tick-time', label: 'Maximum tick time (ms)', type: 'number', min: -1, max: 2147483647, help: 'Use -1 to disable the watchdog limit.' },
  { key: 'network-compression-threshold', label: 'Network compression threshold (bytes)', type: 'number', min: -1, max: 2147483647, help: 'Use -1 to disable packet compression.' },
  { key: 'pause-when-empty-seconds', label: 'Pause when empty (seconds)', type: 'number', min: -1, max: 2147483647, help: 'Use -1 when the server version does not support empty-server pause.' },
  { key: 'rate-limit', label: 'Packet rate limit', type: 'number', min: 0, max: 2147483647, help: 'Set 0 to disable the packet-rate limit.' },
  { key: 'region-file-compression', label: 'Region file compression', type: 'select', options: [['deflate', 'Deflate'], ['lz4', 'LZ4'], ['none', 'None']], help: 'Choose the region file storage compression supported by the selected version.' },
  { key: 'require-resource-pack', label: 'Require resource pack', type: 'boolean', help: 'Disconnect clients that decline the configured resource pack.' },
  { key: 'resource-pack-id', label: 'Resource pack identifier', type: 'text', help: 'Optional UUID for resource-pack updates.' },
  { key: 'resource-pack-sha1', label: 'Resource pack SHA-1', type: 'text', help: 'Optional checksum value provided by the pack publisher.' },
  { key: 'server-ip', label: 'Server bind address', type: 'text', help: 'Leave empty to listen on all local network interfaces.' },
  { key: 'spawn-npcs', label: 'Spawn NPCs', type: 'boolean', help: 'Allow villagers and other NPCs to spawn naturally.' },
  { key: 'text-filtering-config', label: 'Text filtering configuration', type: 'url', help: 'Optional server-side text filtering service URL.' },
  { key: 'use-native-transport', label: 'Use native transport', type: 'boolean', help: 'Use the platform-native network transport when supported.' }
];

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function selectedServer() {
  return state.servers.find((server) => server.id === state.selectedId) || null;
}

function toast(message, kind = 'info') {
  const item = document.createElement('div');
  item.className = `toast ${kind}`;
  item.textContent = message;
  $('#toast-region').append(item);
  setTimeout(() => item.remove(), kind === 'error' ? 9000 : 5000);
}

async function safely(work, successMessage) {
  try {
    const result = await work();
    if (successMessage) toast(successMessage, 'success');
    return result;
  } catch (error) {
    toast(error?.message || String(error), 'error');
    return null;
  }
}

function propertyInput(id, value) {
  const element = $(`#${id}`);
  if (!element) return;
  if (element.type === 'checkbox') element.checked = String(value) === 'true';
  else element.value = value ?? '';
}

function propertyValue(id) {
  const element = $(`#${id}`);
  return element.type === 'checkbox' ? String(element.checked) : element.value;
}

function settingsFromForm() {
  const settings = {
    'motd': propertyValue('motd'),
    'online-mode': propertyValue('online-mode'),
    'white-list': propertyValue('white-list'),
    'level-name': propertyValue('level-name'),
    'level-seed': propertyValue('level-seed'),
    'level-type': propertyValue('level-type'),
    'spawn-protection': propertyValue('spawn-protection'),
    'max-world-size': propertyValue('max-world-size'),
    'generate-structures': propertyValue('generate-structures'),
    'allow-nether': propertyValue('allow-nether'),
    'gamemode': propertyValue('gamemode'),
    'difficulty': propertyValue('difficulty'),
    'max-players': propertyValue('max-players'),
    'player-idle-timeout': propertyValue('player-idle-timeout'),
    'view-distance': propertyValue('view-distance'),
    'simulation-distance': propertyValue('simulation-distance'),
    'pvp': propertyValue('pvp'),
    'hardcore': propertyValue('hardcore'),
    'allow-flight': propertyValue('allow-flight'),
    'spawn-animals': propertyValue('spawn-animals'),
    'spawn-monsters': propertyValue('spawn-monsters'),
    'enable-command-block': propertyValue('enable-command-block'),
    'force-gamemode': propertyValue('force-gamemode'),
    'server-port': propertyValue('server-port'),
    'query.port': propertyValue('query-port'),
    'rcon.port': propertyValue('rcon-port'),
    'rcon.password': propertyValue('rcon-password'),
    'op-permission-level': propertyValue('op-permission-level'),
    'function-permission-level': propertyValue('function-permission-level'),
    'enable-query': propertyValue('enable-query'),
    'enable-rcon': propertyValue('enable-rcon'),
    'broadcast-rcon-to-ops': propertyValue('broadcast-rcon-to-ops'),
    'enforce-secure-profile': propertyValue('enforce-secure-profile'),
    'prevent-proxy-connections': propertyValue('prevent-proxy-connections'),
    'entity-broadcast-range-percentage': propertyValue('entity-broadcast-range'),
    'resource-pack': propertyValue('resource-pack'),
    'resource-pack-prompt': propertyValue('resource-pack-prompt'),
    'sync-chunk-writes': propertyValue('sync-chunk-writes'),
    'hide-online-players': propertyValue('hide-online-players')
  };
  $$('.advanced-control').forEach((control) => {
    settings[control.dataset.property] = control.type === 'checkbox' ? String(control.checked) : control.value;
  });
  return settings;
}

function renderAdvancedControls() {
  const container = $('#advanced-controls');
  container.replaceChildren();
  for (const field of ADVANCED_FIELDS) {
    if (field.type === 'boolean') {
      const label = document.createElement('label');
      label.className = 'switch-field';
      const control = document.createElement('input');
      control.type = 'checkbox';
      control.className = 'advanced-control';
      control.dataset.property = field.key;
      const copy = document.createElement('span');
      copy.innerHTML = `<strong>${escapeHtml(field.label)}</strong><small>${escapeHtml(field.help)}</small>`;
      label.append(control, copy);
      container.append(label);
      continue;
    }
    const label = document.createElement('label');
    label.className = 'field';
    const title = document.createElement('span');
    title.textContent = field.label;
    let control;
    if (field.type === 'select') {
      control = document.createElement('select');
      for (const [value, text] of field.options) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = text;
        control.append(option);
      }
    } else {
      control = document.createElement('input');
      control.type = field.type === 'url' ? 'url' : field.type === 'number' ? 'number' : 'text';
      if (field.min !== undefined) control.min = String(field.min);
      if (field.max !== undefined) control.max = String(field.max);
    }
    control.className = 'advanced-control';
    control.dataset.property = field.key;
    const help = document.createElement('small');
    help.textContent = field.help;
    label.append(title, control, help);
    container.append(label);
  }
}

function renderServers() {
  const query = $('#server-search').value.trim().toLowerCase();
  const container = $('#server-list');
  container.replaceChildren();
  const visible = state.servers.filter((server) => `${server.name} ${server.software} ${server.minecraftVersion}`.toLowerCase().includes(query));
  if (!visible.length) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = query ? 'No matching servers.' : 'No local servers yet.';
    container.append(empty);
    return;
  }
  for (const server of visible) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = `server-card ${server.id === state.selectedId ? 'selected' : ''}`;
    item.innerHTML = `<strong>${escapeHtml(server.name)}</strong><span class="server-meta"><span>${escapeHtml(server.software)} · ${escapeHtml(server.minecraftVersion)}</span><span><i class="dot ${server.status}"></i>${escapeHtml(server.status)}</span></span>`;
    item.addEventListener('click', () => { state.selectedId = server.id; renderAll(); });
    container.append(item);
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

function renderDependencies() {
  const container = $('#dependency-list');
  container.replaceChildren();
  if (!state.dependencies) {
    container.textContent = 'Detecting Java and Git…';
    return;
  }
  for (const dependency of Object.values(state.dependencies.dependencies)) {
    const pill = document.createElement('span');
    const error = state.dependencyErrors[dependency.id];
    pill.className = `dependency-pill ${dependency.available ? 'available' : ''}`;
    pill.textContent = `${dependency.available ? '✓' : error ? '!' : '○'} ${dependency.label}${dependency.version ? ` — ${dependency.version}` : error ? ' — install failed; retry available' : ' — not found'}`;
    container.append(pill);
  }
  const missing = Object.values(state.dependencies.dependencies).some((item) => !item.available);
  $('#install-dependencies-button').disabled = !missing;
  $('#install-dependencies-button').textContent = Object.keys(state.dependencyErrors).length ? 'Retry missing tools' : 'Install missing tools';
  $('#install-dependencies-button').title = missing ? 'Uses Windows package managers first, then an app-private portable fallback.' : 'All required tools are installed.';
}

function renderEditor() {
  const server = selectedServer();
  const editor = $('#server-editor');
  const empty = $('#empty-state');
  if (!server) {
    editor.classList.add('hidden');
    empty.classList.remove('hidden');
    $('#server-title').textContent = 'Create your first Minecraft server';
    $('#server-software').textContent = 'NO SERVER SELECTED';
    $('#server-status').textContent = 'Stopped';
    $('#server-status').className = 'status-chip status-stopped';
    ['open-folder-button', 'setup-button', 'start-button', 'stop-button'].forEach((id) => { $(`#${id}`).disabled = true; });
    return;
  }
  empty.classList.add('hidden');
  editor.classList.remove('hidden');
  $('#server-title').textContent = server.name;
  $('#server-software').textContent = `${server.software.toUpperCase()} · MINECRAFT ${server.minecraftVersion}`;
  $('#server-status').textContent = server.status[0].toUpperCase() + server.status.slice(1);
  $('#server-status').className = `status-chip status-${server.status}`;
  $('#open-folder-button').disabled = false;
  $('#setup-button').disabled = false;
  $('#start-button').disabled = server.status === 'running';
  $('#stop-button').disabled = server.status !== 'running';
  $('#edit-name').value = server.name;
  $('#edit-software').value = server.software[0].toUpperCase() + server.software.slice(1);
  $('#edit-version').value = server.minecraftVersion;
  $('#edit-path').value = server.serverPath;
  $('#java-path').value = server.javaPath || '';
  $('#memory-gb').value = server.memoryGb;
  $('#memory-output').value = server.memoryGb;
  $('#eula-accepted').checked = server.eulaAccepted;
  for (const [key, value] of Object.entries(server.settings)) {
    const inputId = key === 'entity-broadcast-range-percentage' ? 'entity-broadcast-range' : key.replace('.', '-');
    propertyInput(inputId, value);
  }
  $$('.advanced-control').forEach((control) => {
    const value = server.settings[control.dataset.property] ?? '';
    if (control.type === 'checkbox') control.checked = String(value) === 'true';
    else control.value = value;
  });
  $('#view-distance-output').value = $('#view-distance').value;
  $('#simulation-distance-output').value = $('#simulation-distance').value;
  refreshPlugins();
}

function renderConsole() {
  const output = $('#console-output');
  output.textContent = state.logs.length ? state.logs.join('\n') : 'Waiting for a server event…';
  output.scrollTop = output.scrollHeight;
}

function renderAll() {
  renderServers();
  renderDependencies();
  renderEditor();
  renderConsole();
  setActiveTab(state.activeTab);
}

function setActiveTab(tab) {
  state.activeTab = tab;
  $$('.tab').forEach((button) => {
    const active = button.dataset.tab === tab;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  $$('.settings-panel').forEach((panel) => {
    const active = panel.dataset.panel === tab;
    panel.classList.toggle('active', active);
    panel.hidden = !active;
  });
}

async function refreshServers() {
  const servers = await safely(() => window.studio.listServers());
  if (!servers) return;
  state.servers = servers;
  if (!selectedServer() && servers.length) state.selectedId = servers[0].id;
  renderAll();
}

async function refreshDependencies() {
  const inspection = await safely(() => window.studio.inspectDependencies());
  if (inspection) {
    state.dependencies = inspection;
    for (const dependency of Object.values(inspection.dependencies)) {
      if (dependency.available) delete state.dependencyErrors[dependency.id];
    }
    renderDependencies();
  }
}

async function refreshVersions() {
  const versions = await safely(() => window.studio.paperVersions());
  if (!versions) return;
  const list = $('#paper-versions');
  list.replaceChildren(...versions.map((version) => {
    const option = document.createElement('option');
    option.value = version;
    return option;
  }));
}

async function refreshPlugins() {
  const server = selectedServer();
  const container = $('#plugin-list');
  if (!server) return;
  const plugins = await safely(() => window.studio.listPlugins(server.id));
  if (!plugins) return;
  container.replaceChildren();
  if (!plugins.length) {
    const text = document.createElement('p');
    text.className = 'muted';
    text.textContent = 'No plugin JARs are installed for this server.';
    container.append(text);
  } else {
    plugins.forEach((plugin) => {
      const pill = document.createElement('span');
      pill.className = 'plugin-pill';
      pill.textContent = plugin;
      container.append(pill);
    });
  }
}

function openCreateDialog() {
  $('#create-dialog').showModal();
  $('#create-name').focus();
}

async function createServer(event) {
  event.preventDefault();
  const software = document.querySelector('input[name="create-software"]:checked').value;
  const draft = {
    name: $('#create-name').value,
    directoryName: $('#create-directory').value,
    software,
    minecraftVersion: $('#create-version').value,
    rootPath: $('#create-root').value,
    memoryGb: $('#create-memory').value,
    eulaAccepted: $('#create-eula').checked,
    port: $('#create-port').value,
    settings: {
      'server-port': $('#create-port').value,
      'query.port': $('#create-port').value
    }
  };
  const created = await safely(() => window.studio.createServer(draft), 'Server created. Choose Set up server to fetch its official software.');
  if (created) {
    state.selectedId = created.id;
    $('#create-dialog').close();
    await refreshServers();
  }
}

async function saveSettings(event) {
  event.preventDefault();
  const server = selectedServer();
  if (!server) return;
  const saved = await safely(() => window.studio.updateServer(server.id, {
    name: $('#edit-name').value,
    memoryGb: $('#memory-gb').value,
    javaPath: $('#java-path').value,
    eulaAccepted: $('#eula-accepted').checked,
    settings: settingsFromForm()
  }), 'Server settings saved.');
  if (saved) await refreshServers();
}

function logEvent(event) {
  const prefix = new Date(event.at || Date.now()).toLocaleTimeString();
  const label = event.serverId ? `[${event.serverId.slice(0, 8)}] ` : '';
  if (event.message) state.logs.push(`${prefix} ${label}${event.message}`);
  else if (event.type === 'server-state') state.logs.push(`${prefix} ${label}Server state: ${event.status}`);
  if (state.logs.length > 800) state.logs.splice(0, state.logs.length - 800);
  renderConsole();
  if (event.type === 'server-state') refreshServers();
}

function bindEvents() {
  $('#new-server-button').addEventListener('click', openCreateDialog);
  $('#empty-create-button').addEventListener('click', openCreateDialog);
  $('#close-create-dialog').addEventListener('click', () => $('#create-dialog').close());
  $('#cancel-create-button').addEventListener('click', () => $('#create-dialog').close());
  $('#create-form').addEventListener('submit', createServer);
  $('#browse-root-button').addEventListener('click', async () => {
    const folder = await safely(() => window.studio.pickFolder());
    if (folder) $('#create-root').value = folder;
  });
  $('#create-memory').addEventListener('input', () => { $('#create-memory-output').value = $('#create-memory').value; });
  $('#server-search').addEventListener('input', renderServers);
  $('#refresh-button').addEventListener('click', () => { refreshServers(); refreshDependencies(); });
  $('#refresh-dependencies-button').addEventListener('click', refreshDependencies);
  $('#install-dependencies-button').addEventListener('click', async () => {
    const missing = Object.values(state.dependencies?.dependencies || {}).filter((item) => !item.available).map((item) => item.id);
    if (!missing.length) return toast('All required tools are already available.', 'success');
    $('#install-dependencies-button').disabled = true;
    const result = await safely(() => window.studio.installDependencies(missing));
    if (result) {
      const failed = result.results.filter((item) => item.status === 'failed');
      toast(failed.length ? `Some tool installations need attention: ${failed.map((item) => item.id).join(', ')}.` : 'Requested tools installed or already present.', failed.length ? 'error' : 'success');
      state.dependencyErrors = Object.fromEntries(failed.map((item) => [item.id, item.error || 'Installation failed.']));
      state.dependencies = result.inspection;
      renderDependencies();
    }
  });
  $$('.tab').forEach((button) => button.addEventListener('click', () => setActiveTab(button.dataset.tab)));
  $('#settings-form').addEventListener('submit', saveSettings);
  $('#memory-gb').addEventListener('input', () => { $('#memory-output').value = $('#memory-gb').value; });
  $('#view-distance').addEventListener('input', () => { $('#view-distance-output').value = $('#view-distance').value; });
  $('#simulation-distance').addEventListener('input', () => { $('#simulation-distance-output').value = $('#simulation-distance').value; });
  $('#clear-java-button').addEventListener('click', () => { $('#java-path').value = ''; });
  $('#open-folder-button').addEventListener('click', () => { const server = selectedServer(); if (server) safely(() => window.studio.openFolder(server.serverPath)); });
  $('#edit-open-folder').addEventListener('click', () => { const server = selectedServer(); if (server) safely(() => window.studio.openFolder(server.serverPath)); });
  $('#setup-button').addEventListener('click', async () => { const server = selectedServer(); if (server) await safely(() => window.studio.provision(server.id), 'Official server software is ready.'); });
  $('#start-button').addEventListener('click', async () => { const server = selectedServer(); if (server) await safely(() => window.studio.start(server.id), 'Server start requested.'); });
  $('#stop-button').addEventListener('click', async () => { const server = selectedServer(); if (server) await safely(() => window.studio.stop(server.id), 'Graceful server stop requested.'); });
  $('#browse-plugin-button').addEventListener('click', async () => { const selected = await safely(() => window.studio.pickPlugin()); if (selected) { state.pluginPath = selected; $('#plugin-path').value = selected; } });
  $('#install-plugin-button').addEventListener('click', async () => { const server = selectedServer(); if (!server) return; if (!state.pluginPath) return toast('Choose a plugin JAR first.', 'error'); const result = await safely(() => window.studio.installPlugin(server.id, state.pluginPath), 'Plugin installed. Restart the server to load it.'); if (result) { state.pluginPath = ''; $('#plugin-path').value = ''; refreshPlugins(); } });
  $('#send-console-button').addEventListener('click', async () => { const server = selectedServer(); if (!server) return; const command = $('#console-command').value; const result = await safely(() => window.studio.console(server.id, command)); if (result) $('#console-command').value = ''; });
  $('#send-rcon-button').addEventListener('click', async () => { const server = selectedServer(); if (!server) return; const command = $('#console-command').value; const response = await safely(() => window.studio.rcon(server.id, command)); if (response !== null) { state.logs.push(`RCON: ${response || '(no response)'}`); renderConsole(); } });
  $('#clear-console-button').addEventListener('click', () => { state.logs = []; renderConsole(); });
  $$('.command-presets button').forEach((button) => button.addEventListener('click', () => { $('#console-command').value = button.dataset.command; $('#console-command').focus(); }));
}

async function initialize() {
  renderAdvancedControls();
  bindEvents();
  window.studio.onEvent(logEvent);
  const directory = await safely(() => window.studio.dataDirectory());
  if (directory) $('#data-directory').textContent = `Data: ${directory}`;
  await Promise.all([refreshServers(), refreshDependencies(), refreshVersions()]);
}

initialize();
