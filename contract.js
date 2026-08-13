(function (global) {
  "use strict";

  if (global.MinecraftServerStudioContract) {
    return;
  }

  const STORAGE_KEY = "minecraft-server-studio.site.contract.v2";
  const SCHEMA_VERSION = 4;
  const SCHEDULE_RULE_VERSION = 1;
  const LIMITS = Object.freeze({
    stateBytes: 1024 * 1024,
    notifications: 200,
    auditRecords: 500,
    tabs: 120,
    tabGroups: 40,
    collections: 25,
    collectionRecords: 500,
    collectionSelection: 500,
    schedules: 100,
    locks: 250,
    totpEntries: 250,
    conversionJobs: 100,
    conversionInputBytes: 1024 * 1024,
    conversionSniffBytes: 512,
    conversionSelectionFiles: 12,
    conversionSessionQueue: 24,
    conversionOutputBytes: 2 * 1024 * 1024,
    commandPaletteEntries: 600,
    statusEvidence: 160,
    statusInteractions: 100,
    statusNextSteps: 100,
    inventorySurfaces: 80,
    inventoryFeaturesPerSurface: 320,
    regexPatternCharacters: 512,
    regexSampleCharacters: 16 * 1024,
    regexMatches: 200,
    vocabularyBytes: 64 * 1024,
    vocabularyNestingDepth: 3,
    vocabularyEntries: 250,
    vocabularyKeyCharacters: 128,
    vocabularyValueCharacters: 512,
    schoolModeCodeMinimum: 4,
    schoolModeCodeMaximum: 64,
    schoolModeCredentialSaltBytes: 16
  });

  const LANGUAGE_MODES = Object.freeze(["english", "cantonese", "bilingual"]);
  const THEMES = Object.freeze(["system", "light", "dark"]);
  const DENSITIES = Object.freeze(["compact", "comfortable", "spacious"]);
  const ORIENTATIONS = Object.freeze(["vertical", "horizontal"]);
  const TAB_DOCKS = Object.freeze(["left", "right", "top", "bottom"]);
  const SCHEDULE_SOURCES = Object.freeze(["local"]);
  const SCHEDULED_SETTING_IDS = Object.freeze([
    "languageMode",
    "appearance.theme",
    "appearance.density",
    "appearance.accent",
    "appearance.font.family",
    "appearance.font.scale",
    "appearance.font.weight"
  ]);
  const SCHEDULE_FONT_FAMILIES = Object.freeze(["system-ui", "Inter, system-ui, sans-serif", "Arial, sans-serif", "Segoe UI, sans-serif", "Georgia, serif", "Cascadia Code, Consolas, monospace"]);
  const STATUS_STATES = Object.freeze(["idle", "running", "waiting", "blocked", "verified", "failed"]);
  const EVIDENCE_STATES = Object.freeze(["missing", "planned", "in-progress", "verified", "not-applicable"]);
  const CONVERSION_STATUSES = Object.freeze(["planned", "queued", "ready", "converting", "converted", "download-requested", "unsupported", "unavailable", "cancelled", "failed", "removed"]);
  const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;
  const SAFE_COLOR = /^#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$/;
  const BASE64_SALT = /^[A-Za-z0-9+/]{22}==$/;
  const BASE64_SHA256 = /^[A-Za-z0-9+/]{43}=$/;

  const FILE_ADAPTERS = Object.freeze([
    { id: "documents-pdf", category: "Documents/PDF", label: "PDF inspect and conversion", sourceFormats: ["PDF bytes"], targetFormats: ["PDF operations"], bundled: false, enabled: false, reason: "Unavailable: this static page does not bundle a PDF parser, renderer, or writer." },
    { id: "images", category: "Images", label: "Image conversion", sourceFormats: ["Image bytes"], targetFormats: ["PNG, JPEG, WebP"], bundled: false, enabled: false, reason: "Unavailable: this static page does not bundle an image decoder or encoder." },
    { id: "audio", category: "Audio", label: "Audio conversion", sourceFormats: ["Audio bytes"], targetFormats: ["WAV, MP3"], bundled: false, enabled: false, reason: "Unavailable: this static page does not bundle an audio decoder or encoder." },
    { id: "video", category: "Video", label: "Video conversion", sourceFormats: ["Video bytes"], targetFormats: ["MP4, WebM"], bundled: false, enabled: false, reason: "Unavailable: this static page does not bundle a video decoder or encoder." },
    { id: "archives", category: "Archives", label: "Archive conversion", sourceFormats: ["ZIP, 7z, RAR bytes"], targetFormats: ["Archive operations"], bundled: false, enabled: false, reason: "Unavailable: this static page does not bundle an archive reader or writer." },
    { id: "structured-spreadsheet", category: "Structured Data/Spreadsheets", label: "Workbook conversion", sourceFormats: ["Workbook container bytes"], targetFormats: ["Spreadsheet formats"], bundled: false, enabled: false, reason: "Unavailable: this static page does not bundle a workbook parser or writer." },
    { id: "structured-utf8", category: "Structured Data/Spreadsheets", label: "UTF-8 JSON, CSV, and TSV", sourceFormats: ["UTF-8 JSON, CSV, TSV"], targetFormats: ["JSON, CSV, TSV, YAML-style text"], bundled: true, enabled: true, reason: "Available locally after byte inspection and bounded parsing." },
    { id: "code-text-utf8", category: "Code/Text", label: "UTF-8 text", sourceFormats: ["UTF-8 text"], targetFormats: ["UTF-8 text"], bundled: true, enabled: true, reason: "Available locally after UTF-8 validation." },
    { id: "binary-base64", category: "Binary Encodings", label: "Base64 encoding", sourceFormats: ["Bounded source bytes"], targetFormats: ["Base64 text"], bundled: true, enabled: true, reason: "Available locally; this is an encoding, not a media, archive, or PDF conversion." },
    { id: "binary-hex", category: "Binary Encodings", label: "Hex encoding", sourceFormats: ["Bounded source bytes"], targetFormats: ["Hex text"], bundled: true, enabled: true, reason: "Available locally; this is an encoding, not a media, archive, or PDF conversion." }
  ]);

  const listeners = new Set();
  const commandEntries = new Map();
  let teleportHandler = null;
  let storageAvailable = true;
  let state = hydrate();

  function now() {
    return new Date().toISOString();
  }

  function hasOwn(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
  }

  function isPlainObject(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return false;
    }
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function trimString(value, maximum, fallback) {
    if (typeof value !== "string") {
      return fallback;
    }
    return value.trim().slice(0, maximum);
  }

  function boundedText(value, maximum, fallback) {
    if (typeof value !== "string") {
      return fallback;
    }
    return value.slice(0, maximum);
  }

  function boundedInteger(value, minimum, maximum, fallback) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return fallback;
    }
    return Math.max(minimum, Math.min(maximum, Math.round(numeric)));
  }

  function enumValue(value, choices, fallback) {
    return choices.includes(value) ? value : fallback;
  }

  function safeId(value, fallback) {
    const candidate = trimString(value, 80, "");
    return SAFE_ID.test(candidate) ? candidate : fallback;
  }

  function safeColor(value, fallback) {
    const candidate = trimString(value, 9, "");
    return SAFE_COLOR.test(candidate) ? candidate.toLowerCase() : fallback;
  }

  function safeFileName(value, fallback) {
    if (typeof value !== "string") {
      return fallback;
    }
    const withoutControls = value.replace(/[\u0000-\u001f\u007f]/g, "");
    const basename = withoutControls.split(/[\\/]/).pop().trim();
    return basename.slice(0, 160) || fallback;
  }

  function hasUnsafeKeys(value) {
    if (!isPlainObject(value)) {
      return false;
    }
    return Object.keys(value).some((key) => key === "__proto__" || key === "prototype" || key === "constructor");
  }

  function createDefaultState() {
    return {
      version: SCHEMA_VERSION,
      settings: {
        languageMode: "english",
        funnyLevel: { english: 2, cantonese: 2 },
        showDialogEmoji: true,
        schoolMode: { enabled: false, name: "School mode" },
        appearance: {
          theme: "system",
          density: "comfortable",
          accent: "#3f7cff",
          font: { family: "system-ui", scale: 1, weight: 400 }
        },
        narrator: {
          enabled: false,
          language: "english",
          englishVoice: "auto",
          cantoneseVoice: "auto",
          rate: 1,
          pitch: 1
        }
      },
      notifications: [],
      audit: [],
      tabs: {
        dock: "left",
        orientation: "vertical",
        activeId: null,
        appearance: { accent: "#3f7cff", fontScale: 1, fontWeight: 600 },
        groups: [],
        items: []
      },
      collections: [],
      personalVocabulary: { status: "empty", payload: null },
      schoolModeCredential: { algorithm: "", salt: "", verifier: "", configuredAt: null },
      locks: [],
      totp: [],
      schedules: [],
      logo: { sourceType: "preset", presetId: "default", custom: null, updatedAt: null },
      conversion: { jobs: [] },
      status: {
        currentState: "idle",
        summary: "This browser-local status model has not been connected to a host surface yet.",
        lastUpdatedAt: null,
        evidence: [],
        activeInteractions: [],
        nextSteps: [],
        chatBridge: { available: false, message: "No chat bridge is connected. This status exists only in this browser." }
      },
      completenessInventory: { surfaces: [] },
      ollama: {
        endpoint: "http://127.0.0.1:11434",
        status: "unknown",
        lastUpdatedAt: null,
        pendingOperation: null
      }
    };
  }

  function migrate(source) {
    if (!isPlainObject(source) || hasUnsafeKeys(source)) {
      return createDefaultState();
    }
    const migrated = clone(source);
    const version = boundedInteger(migrated.version, 1, SCHEMA_VERSION, 1);
    if (version < 2 && isPlainObject(migrated.settings) && typeof migrated.settings.funnyLevel === "number") {
      const level = boundedInteger(migrated.settings.funnyLevel, 1, 5, 2);
      migrated.settings.funnyLevel = { english: level, cantonese: level };
    }
    if (version < 3) {
      migrated.schoolModeCredential = { algorithm: "", salt: "", verifier: "", configuredAt: null };
    }
    if (version < 4 && Array.isArray(migrated.schedules)) {
      migrated.schedules = migrated.schedules.map((rule) => {
        if (!isPlainObject(rule) || hasUnsafeKeys(rule) || hasOwn(rule, "version")) return rule;
        return Object.assign({}, rule, { version: SCHEDULE_RULE_VERSION });
      });
    }
    migrated.version = SCHEMA_VERSION;
    return migrated;
  }

  function normalizeSettings(raw, defaults) {
    const settings = isPlainObject(raw) && !hasUnsafeKeys(raw) ? raw : {};
    const funny = isPlainObject(settings.funnyLevel) && !hasUnsafeKeys(settings.funnyLevel) ? settings.funnyLevel : {};
    const school = isPlainObject(settings.schoolMode) && !hasUnsafeKeys(settings.schoolMode) ? settings.schoolMode : {};
    const appearance = isPlainObject(settings.appearance) && !hasUnsafeKeys(settings.appearance) ? settings.appearance : {};
    const font = isPlainObject(appearance.font) && !hasUnsafeKeys(appearance.font) ? appearance.font : {};
    const narrator = isPlainObject(settings.narrator) && !hasUnsafeKeys(settings.narrator) ? settings.narrator : {};
    return {
      languageMode: enumValue(settings.languageMode, LANGUAGE_MODES, defaults.languageMode),
      funnyLevel: {
        english: boundedInteger(funny.english, 1, 5, defaults.funnyLevel.english),
        cantonese: boundedInteger(funny.cantonese, 1, 5, defaults.funnyLevel.cantonese)
      },
      showDialogEmoji: typeof settings.showDialogEmoji === "boolean" ? settings.showDialogEmoji : defaults.showDialogEmoji,
      schoolMode: {
        enabled: typeof school.enabled === "boolean" ? school.enabled : defaults.schoolMode.enabled,
        name: trimString(school.name, 80, defaults.schoolMode.name) || defaults.schoolMode.name
      },
      appearance: {
        theme: enumValue(appearance.theme, THEMES, defaults.appearance.theme),
        density: enumValue(appearance.density, DENSITIES, defaults.appearance.density),
        accent: safeColor(appearance.accent, defaults.appearance.accent),
        font: {
          family: trimString(font.family, 120, defaults.appearance.font.family) || defaults.appearance.font.family,
          scale: Math.max(0.75, Math.min(2, Number(font.scale) || defaults.appearance.font.scale)),
          weight: boundedInteger(font.weight, 100, 900, defaults.appearance.font.weight)
        }
      },
      narrator: {
        enabled: typeof narrator.enabled === "boolean" ? narrator.enabled : defaults.narrator.enabled,
        language: enumValue(narrator.language, LANGUAGE_MODES, defaults.narrator.language),
        englishVoice: trimString(narrator.englishVoice, 256, defaults.narrator.englishVoice) || "auto",
        cantoneseVoice: trimString(narrator.cantoneseVoice, 256, defaults.narrator.cantoneseVoice) || "auto",
        rate: Math.max(0.5, Math.min(2, Number(narrator.rate) || defaults.narrator.rate)),
        pitch: Math.max(0, Math.min(2, Number(narrator.pitch) || defaults.narrator.pitch))
      }
    };
  }

  function normalizeNotification(raw) {
    if (!isPlainObject(raw) || hasUnsafeKeys(raw)) {
      return null;
    }
    const actions = Array.isArray(raw.actions) ? raw.actions.slice(0, 4).map((action) => {
      if (!isPlainObject(action) || hasUnsafeKeys(action)) {
        return null;
      }
      const id = safeId(action.id, "");
      const label = trimString(action.label, 120, "");
      return id && label ? { id, label } : null;
    }).filter(Boolean) : [];
    const id = safeId(raw.id, "");
    const title = trimString(raw.title, 160, "");
    const body = boundedText(raw.body, 1200, "");
    if (!id || !title) {
      return null;
    }
    return {
      id,
      kind: enumValue(raw.kind, ["info", "success", "warning", "error", "progress"], "info"),
      title,
      body,
      actions,
      createdAt: trimString(raw.createdAt, 48, now()),
      dismissed: Boolean(raw.dismissed)
    };
  }

  function normalizeAudit(raw) {
    if (!isPlainObject(raw) || hasUnsafeKeys(raw)) {
      return null;
    }
    const id = safeId(raw.id, "");
    const action = trimString(raw.action, 120, "");
    if (!id || !action) {
      return null;
    }
    return {
      id,
      action,
      target: trimString(raw.target, 160, ""),
      detail: boundedText(raw.detail, 600, ""),
      createdAt: trimString(raw.createdAt, 48, now())
    };
  }

  function normalizeTabGroup(raw) {
    if (!isPlainObject(raw) || hasUnsafeKeys(raw)) {
      return null;
    }
    const id = safeId(raw.id, "");
    const label = trimString(raw.label, 120, "");
    if (!id || !label) {
      return null;
    }
    return {
      id,
      label,
      color: safeColor(raw.color, "#3f7cff"),
      collapsed: Boolean(raw.collapsed)
    };
  }

  function normalizeTabItemAppearance(raw) {
    const appearance = isPlainObject(raw) && !hasUnsafeKeys(raw) ? raw : {};
    return {
      accent: safeColor(appearance.accent, ""),
      fontScale: Math.max(0.75, Math.min(2, Number(appearance.fontScale) || 1)),
      fontWeight: boundedInteger(appearance.fontWeight, 100, 900, 600)
    };
  }

  function normalizeTabStripAppearance(raw, defaults) {
    const appearance = isPlainObject(raw) && !hasUnsafeKeys(raw) ? raw : {};
    return {
      accent: safeColor(appearance.accent, defaults.accent),
      fontScale: Math.max(0.75, Math.min(2, Number(appearance.fontScale) || defaults.fontScale)),
      fontWeight: boundedInteger(appearance.fontWeight, 100, 900, defaults.fontWeight)
    };
  }

  function normalizeTabItem(raw, groupIds) {
    if (!isPlainObject(raw) || hasUnsafeKeys(raw)) {
      return null;
    }
    const id = safeId(raw.id, "");
    const label = trimString(raw.label, 160, "");
    if (!id || !label) {
      return null;
    }
    const groupId = safeId(raw.groupId, "");
    return {
      id,
      label,
      panelId: safeId(raw.panelId, `${id}-panel`),
      groupId: groupIds.has(groupId) ? groupId : null,
      pinned: Boolean(raw.pinned),
      locked: Boolean(raw.locked),
      closable: raw.closable !== false,
      appearance: normalizeTabItemAppearance(raw.appearance)
    };
  }

  function normalizeTabs(raw, defaults) {
    const tabs = isPlainObject(raw) && !hasUnsafeKeys(raw) ? raw : {};
    const groups = [];
    const groupIds = new Set();
    (Array.isArray(tabs.groups) ? tabs.groups : []).some((item) => {
      const group = normalizeTabGroup(item);
      if (group && !groupIds.has(group.id)) {
        groups.push(group);
        groupIds.add(group.id);
      }
      return groups.length >= LIMITS.tabGroups;
    });
    const items = [];
    const ids = new Set();
    (Array.isArray(tabs.items) ? tabs.items : []).some((item) => {
      const tab = normalizeTabItem(item, groupIds);
      if (tab && !ids.has(tab.id)) {
        items.push(tab);
        ids.add(tab.id);
      }
      return items.length >= LIMITS.tabs;
    });
    const activeId = safeId(tabs.activeId, "");
    const dock = enumValue(tabs.dock, TAB_DOCKS, defaults.dock);
    const inferredOrientation = dock === "left" || dock === "right" ? "vertical" : "horizontal";
    return {
      dock,
      orientation: inferredOrientation,
      activeId: ids.has(activeId) ? activeId : (items[0] ? items[0].id : null),
      appearance: normalizeTabStripAppearance(tabs.appearance, defaults.appearance),
      groups,
      items
    };
  }

  function normalizeCollectionRecord(raw) {
    if (!isPlainObject(raw) || hasUnsafeKeys(raw)) {
      return null;
    }
    const id = safeId(raw.id, "");
    const label = trimString(raw.label, 160, "");
    if (!id || !label) {
      return null;
    }
    const tags = Array.isArray(raw.tags) ? raw.tags.slice(0, 12).map((tag) => trimString(tag, 48, "")).filter(Boolean) : [];
    return { id, label, selected: Boolean(raw.selected), disabled: Boolean(raw.disabled), tags };
  }

  function normalizeCollection(raw) {
    if (!isPlainObject(raw) || hasUnsafeKeys(raw)) {
      return null;
    }
    const id = safeId(raw.id, "");
    const label = trimString(raw.label, 120, "");
    if (!id || !label) {
      return null;
    }
    const records = [];
    const seen = new Set();
    (Array.isArray(raw.records) ? raw.records : []).some((record) => {
      const normalized = normalizeCollectionRecord(record);
      if (normalized && !seen.has(normalized.id)) {
        records.push(normalized);
        seen.add(normalized.id);
      }
      return records.length >= LIMITS.collectionRecords;
    });
    return { id, label, records, updatedAt: trimString(raw.updatedAt, 48, now()) };
  }

  function normalizeVocabularyPayload(raw) {
    const rootKeys = isPlainObject(raw) ? Object.keys(raw).sort() : [];
    if (!isPlainObject(raw) || hasUnsafeKeys(raw) || rootKeys.length !== 2 || rootKeys[0] !== "replacements" || rootKeys[1] !== "version" || raw.version !== 1 || !Array.isArray(raw.replacements)) {
      return null;
    }
    if (raw.replacements.length > LIMITS.vocabularyEntries) {
      return null;
    }
    const replacements = [];
    const seen = new Set();
    for (const replacement of raw.replacements) {
      if (!isPlainObject(replacement) || hasUnsafeKeys(replacement)) {
        return null;
      }
      const keys = Object.keys(replacement).sort();
      if (keys.length !== 2 || keys[0] !== "from" || keys[1] !== "to") {
        return null;
      }
      const from = replacement.from;
      const to = replacement.to;
      if (typeof from !== "string" || typeof to !== "string" || Array.from(from).length === 0 || Array.from(from).length > LIMITS.vocabularyKeyCharacters || Array.from(to).length > LIMITS.vocabularyValueCharacters || seen.has(from)) {
        return null;
      }
      seen.add(from);
      replacements.push({ from, to });
    }
    return { version: 1, replacements };
  }

  function normalizePersonalVocabulary(raw) {
    const value = isPlainObject(raw) && !hasUnsafeKeys(raw) ? raw : {};
    const payload = normalizeVocabularyPayload(value.payload);
    return payload ? { status: "loaded", payload } : { status: "empty", payload: null };
  }

  function isConfiguredSchoolModeCredential(value) {
    return Boolean(value && value.algorithm === "SHA-256" && BASE64_SALT.test(value.salt) && BASE64_SHA256.test(value.verifier));
  }

  function normalizeSchoolModeCredential(raw) {
    const value = isPlainObject(raw) && !hasUnsafeKeys(raw) ? raw : {};
    const candidate = {
      algorithm: value.algorithm === "SHA-256" ? "SHA-256" : "",
      salt: trimString(value.salt, 32, ""),
      verifier: trimString(value.verifier, 64, ""),
      configuredAt: trimString(value.configuredAt, 48, "") || null
    };
    return isConfiguredSchoolModeCredential(candidate) ? candidate : { algorithm: "", salt: "", verifier: "", configuredAt: null };
  }

  function normalizeLock(raw) {
    if (!isPlainObject(raw) || hasUnsafeKeys(raw)) {
      return null;
    }
    const id = safeId(raw.id, "");
    const target = trimString(raw.target, 160, "");
    if (!id || !target) {
      return null;
    }
    return {
      id,
      target,
      label: trimString(raw.label, 160, target),
      method: enumValue(raw.method, ["password", "totp"], "password"),
      duration: enumValue(raw.duration, ["surface", "minutes", "session"], "surface"),
      minutes: boundedInteger(raw.minutes, 1, 1440, 15),
      locked: raw.locked !== false,
      createdAt: trimString(raw.createdAt, 48, now()),
      updatedAt: trimString(raw.updatedAt, 48, now())
    };
  }

  function normalizeTotp(raw) {
    if (!isPlainObject(raw) || hasUnsafeKeys(raw)) {
      return null;
    }
    const id = safeId(raw.id, "");
    const label = trimString(raw.label, 160, "");
    if (!id || !label) {
      return null;
    }
    return {
      id,
      label,
      issuer: trimString(raw.issuer, 160, ""),
      account: trimString(raw.account, 160, ""),
      algorithm: enumValue(raw.algorithm, ["SHA-1", "SHA-256", "SHA-512"], "SHA-1"),
      digits: boundedInteger(raw.digits, 6, 8, 6),
      period: boundedInteger(raw.period, 15, 300, 30),
      enrolled: Boolean(raw.enrolled),
      updatedAt: trimString(raw.updatedAt, 48, now())
    };
  }

  function isCanonicalLocalDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  }

  function isCanonicalLocalTime(value) {
    if (!/^\d{2}:\d{2}$/.test(value || "")) return false;
    const [hours, minutes] = value.split(":").map(Number);
    return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
  }

  function normalizeScheduledValue(setting, value) {
    if (setting === "languageMode") return LANGUAGE_MODES.includes(value) ? value : null;
    if (setting === "appearance.theme") return THEMES.includes(value) ? value : null;
    if (setting === "appearance.density") return DENSITIES.includes(value) ? value : null;
    if (setting === "appearance.accent") {
      return typeof value === "string" && SAFE_COLOR.test(value.trim()) ? value.trim().toLowerCase() : null;
    }
    if (setting === "appearance.font.family") return SCHEDULE_FONT_FAMILIES.includes(value) ? value : null;
    if (setting === "appearance.font.scale") {
      const numeric = Number(value);
      return Number.isFinite(numeric) && numeric >= 0.75 && numeric <= 2 ? Math.round(numeric * 100) / 100 : null;
    }
    if (setting === "appearance.font.weight") {
      const numeric = Number(value);
      return Number.isInteger(numeric) && numeric >= 100 && numeric <= 900 && numeric % 100 === 0 ? numeric : null;
    }
    return null;
  }

  function normalizeSchedule(raw) {
    if (!isPlainObject(raw) || hasUnsafeKeys(raw)) {
      return null;
    }
    const id = safeId(raw.id, "");
    const setting = trimString(raw.setting, 80, "");
    const version = hasOwn(raw, "version") ? Number(raw.version) : SCHEDULE_RULE_VERSION;
    const source = hasOwn(raw, "source") ? raw.source : "local";
    if (!id || !SCHEDULED_SETTING_IDS.includes(setting) || version !== SCHEDULE_RULE_VERSION || source !== "local") {
      return null;
    }
    const weekdays = Array.isArray(raw.weekdays) ? raw.weekdays.map((day) => boundedInteger(day, 0, 6, -1)).filter((day, index, list) => day >= 0 && list.indexOf(day) === index).slice(0, 7) : [];
    const value = normalizeScheduledValue(setting, raw.value);
    if (value === null) {
      return null;
    }
    const startDate = trimString(raw.startDate, 10, "");
    const endDate = trimString(raw.endDate, 10, "");
    const startTime = trimString(raw.startTime, 5, "");
    const endTime = trimString(raw.endTime, 5, "");
    if ((startDate && !isCanonicalLocalDate(startDate)) || (endDate && !isCanonicalLocalDate(endDate)) || (startDate && endDate && startDate > endDate)) return null;
    if ((startTime && !isCanonicalLocalTime(startTime)) || (endTime && !isCanonicalLocalTime(endTime))) return null;
    return {
      version: SCHEDULE_RULE_VERSION,
      id,
      label: trimString(raw.label, 160, setting) || setting,
      setting,
      value,
      enabled: raw.enabled !== false,
      source,
      startDate,
      endDate,
      startTime,
      endTime,
      weekdays,
      priority: boundedInteger(raw.priority, 0, 999, 0)
    };
  }

  function normalizeLogo(raw, defaults) {
    const value = isPlainObject(raw) && !hasUnsafeKeys(raw) ? raw : {};
    const custom = isPlainObject(value.custom) && !hasUnsafeKeys(value.custom) ? value.custom : null;
    let normalizedCustom = null;
    if (custom) {
      normalizedCustom = {
        format: enumValue(custom.format, ["png", "jpeg", "webp", "svg"], "png"),
        width: boundedInteger(custom.width, 1, 8192, 1),
        height: boundedInteger(custom.height, 1, 8192, 1),
        fit: enumValue(custom.fit, ["contain", "cover", "fill"], "contain"),
        background: safeColor(custom.background, "#00000000"),
        crop: {
          x: Math.max(0, Math.min(1, Number(custom.crop && custom.crop.x) || 0)),
          y: Math.max(0, Math.min(1, Number(custom.crop && custom.crop.y) || 0)),
          width: Math.max(0.01, Math.min(1, Number(custom.crop && custom.crop.width) || 1)),
          height: Math.max(0.01, Math.min(1, Number(custom.crop && custom.crop.height) || 1))
        }
      };
    }
    return {
      sourceType: enumValue(value.sourceType, ["preset", "custom"], defaults.sourceType),
      presetId: safeId(value.presetId, defaults.presetId),
      custom: normalizedCustom,
      updatedAt: trimString(value.updatedAt, 48, defaults.updatedAt)
    };
  }

  function normalizeConversionJob(raw) {
    if (!isPlainObject(raw) || hasUnsafeKeys(raw)) {
      return null;
    }
    const id = safeId(raw.id, "");
    if (!id) {
      return null;
    }
    const sourceName = safeFileName(raw.sourceName || raw.sourceLabel, "");
    const sourceType = trimString(raw.sourceType || raw.detectedKind, 120, "unknown") || "unknown";
    const targetType = trimString(raw.targetType || raw.targetFormat, 120, "unknown") || "unknown";
    return {
      id,
      sourceName,
      sourceType,
      sourceBytes: boundedInteger(raw.sourceBytes, 0, 2 * 1024 * 1024 * 1024, 0),
      detectedKind: trimString(raw.detectedKind, 120, sourceType) || sourceType,
      category: trimString(raw.category, 120, "Unknown") || "Unknown",
      targetType,
      targetFormat: trimString(raw.targetFormat, 120, targetType) || targetType,
      targetName: safeFileName(raw.targetName, ""),
      status: raw.status === "downloaded" ? "download-requested" : enumValue(raw.status, CONVERSION_STATUSES, "queued"),
      adapterId: safeId(raw.adapterId, ""),
      createdAt: trimString(raw.createdAt, 48, now()),
      updatedAt: trimString(raw.updatedAt, 48, trimString(raw.createdAt, 48, now())),
      downloadRequestedAt: trimString(raw.downloadRequestedAt || raw.downloadedAt, 48, ""),
      reason: boundedText(raw.reason, 600, "")
    };
  }

  function normalizeConversion(raw) {
    const value = isPlainObject(raw) && !hasUnsafeKeys(raw) ? raw : {};
    const jobs = [];
    const seen = new Set();
    (Array.isArray(value.jobs) ? value.jobs : []).some((job) => {
      const normalized = normalizeConversionJob(job);
      if (!normalized || seen.has(normalized.id)) {
        return false;
      }
      seen.add(normalized.id);
      jobs.push(normalized);
      return jobs.length >= LIMITS.conversionJobs;
    });
    return { jobs };
  }

  function normalizeStatusEvidence(raw) {
    if (!isPlainObject(raw) || hasUnsafeKeys(raw)) {
      return null;
    }
    const id = safeId(raw.id, "");
    const label = trimString(raw.label, 180, "");
    if (!id || !label) {
      return null;
    }
    return {
      id,
      label,
      state: enumValue(raw.state, STATUS_STATES, "idle"),
      detail: boundedText(raw.detail, 1200, ""),
      reference: boundedText(raw.reference, 512, ""),
      updatedAt: trimString(raw.updatedAt, 48, now())
    };
  }

  function normalizeStatusInteraction(raw) {
    if (!isPlainObject(raw) || hasUnsafeKeys(raw)) {
      return null;
    }
    const id = safeId(raw.id, "");
    const label = trimString(raw.label, 180, "");
    if (!id || !label) {
      return null;
    }
    return {
      id,
      label,
      state: enumValue(raw.state, STATUS_STATES, "idle"),
      detail: boundedText(raw.detail, 800, ""),
      updatedAt: trimString(raw.updatedAt, 48, now())
    };
  }

  function normalizeStatusNextStep(raw) {
    if (!isPlainObject(raw) || hasUnsafeKeys(raw)) {
      return null;
    }
    const id = safeId(raw.id, "");
    const label = trimString(raw.label, 240, "");
    if (!id || !label) {
      return null;
    }
    return {
      id,
      label,
      state: enumValue(raw.state, STATUS_STATES, "idle"),
      detail: boundedText(raw.detail, 800, "")
    };
  }

  function normalizeStatusModel(raw, defaults) {
    const value = isPlainObject(raw) && !hasUnsafeKeys(raw) ? raw : {};
    const evidence = [];
    const evidenceIds = new Set();
    (Array.isArray(value.evidence) ? value.evidence : []).some((entry) => {
      const normalized = normalizeStatusEvidence(entry);
      if (normalized && !evidenceIds.has(normalized.id)) {
        evidence.push(normalized);
        evidenceIds.add(normalized.id);
      }
      return evidence.length >= LIMITS.statusEvidence;
    });
    const activeInteractions = [];
    const interactionIds = new Set();
    (Array.isArray(value.activeInteractions) ? value.activeInteractions : []).some((entry) => {
      const normalized = normalizeStatusInteraction(entry);
      if (normalized && !interactionIds.has(normalized.id)) {
        activeInteractions.push(normalized);
        interactionIds.add(normalized.id);
      }
      return activeInteractions.length >= LIMITS.statusInteractions;
    });
    const nextSteps = [];
    const nextStepIds = new Set();
    (Array.isArray(value.nextSteps) ? value.nextSteps : []).some((entry) => {
      const normalized = normalizeStatusNextStep(entry);
      if (normalized && !nextStepIds.has(normalized.id)) {
        nextSteps.push(normalized);
        nextStepIds.add(normalized.id);
      }
      return nextSteps.length >= LIMITS.statusNextSteps;
    });
    return {
      currentState: enumValue(value.currentState, STATUS_STATES, defaults.currentState),
      summary: boundedText(value.summary, 1200, defaults.summary),
      lastUpdatedAt: trimString(value.lastUpdatedAt, 48, defaults.lastUpdatedAt),
      evidence,
      activeInteractions,
      nextSteps,
      chatBridge: { available: false, message: "No chat bridge is connected. This status exists only in this browser." }
    };
  }

  function normalizeCompletenessEvidence(raw) {
    const value = isPlainObject(raw) && !hasUnsafeKeys(raw) ? raw : {};
    const result = {};
    ["implementation", "documentation", "localization", "persistence", "test", "interaction", "capture"].forEach((key) => {
      const detail = isPlainObject(value[key]) && !hasUnsafeKeys(value[key]) ? value[key] : {};
      const status = enumValue(detail.status, EVIDENCE_STATES, "missing");
      result[key] = {
        status,
        reference: boundedText(detail.reference, 512, ""),
        detail: boundedText(detail.detail, 800, ""),
        reason: status === "not-applicable" ? boundedText(detail.reason, 800, "") : ""
      };
    });
    return result;
  }

  function normalizeCompletenessFeature(raw) {
    if (!isPlainObject(raw) || hasUnsafeKeys(raw)) {
      return null;
    }
    const id = safeId(raw.id, "");
    const label = trimString(raw.label, 180, "");
    if (!id || !label) {
      return null;
    }
    return {
      id,
      label,
      state: enumValue(raw.state, EVIDENCE_STATES, "missing"),
      evidence: normalizeCompletenessEvidence(raw.evidence),
      notes: boundedText(raw.notes, 1200, ""),
      updatedAt: trimString(raw.updatedAt, 48, now())
    };
  }

  function normalizeCompletenessSurface(raw) {
    if (!isPlainObject(raw) || hasUnsafeKeys(raw)) {
      return null;
    }
    const id = safeId(raw.id, "");
    const label = trimString(raw.label, 180, "");
    if (!id || !label) {
      return null;
    }
    const features = [];
    const ids = new Set();
    (Array.isArray(raw.features) ? raw.features : []).some((entry) => {
      const feature = normalizeCompletenessFeature(entry);
      if (feature && !ids.has(feature.id)) {
        features.push(feature);
        ids.add(feature.id);
      }
      return features.length >= LIMITS.inventoryFeaturesPerSurface;
    });
    return {
      id,
      label,
      route: boundedText(raw.route, 240, ""),
      updatedAt: trimString(raw.updatedAt, 48, now()),
      features
    };
  }

  function normalizeCompletenessInventory(raw) {
    const value = isPlainObject(raw) && !hasUnsafeKeys(raw) ? raw : {};
    const surfaces = [];
    const ids = new Set();
    (Array.isArray(value.surfaces) ? value.surfaces : []).some((entry) => {
      const surface = normalizeCompletenessSurface(entry);
      if (surface && !ids.has(surface.id)) {
        surfaces.push(surface);
        ids.add(surface.id);
      }
      return surfaces.length >= LIMITS.inventorySurfaces;
    });
    return { surfaces };
  }

  function normalizeOllama(raw, defaults) {
    const value = isPlainObject(raw) && !hasUnsafeKeys(raw) ? raw : {};
    const endpoint = normalizeLoopbackEndpoint(value.endpoint);
    const operation = isPlainObject(value.pendingOperation) && !hasUnsafeKeys(value.pendingOperation) ? value.pendingOperation : null;
    let pendingOperation = null;
    if (operation) {
      const id = safeId(operation.id, "");
      const action = enumValue(operation.action, ["health", "version", "models", "tags", "pull", "delete", "copy", "generate", "chat"], null);
      if (id && action) {
        pendingOperation = {
          id,
          action,
          endpoint: normalizeLoopbackEndpoint(operation.endpoint) || defaults.endpoint,
          createdAt: trimString(operation.createdAt, 48, now())
        };
      }
    }
    return {
      endpoint: endpoint || defaults.endpoint,
      status: enumValue(value.status, ["unknown", "ready", "offline", "unhealthy", "pending"], defaults.status),
      lastUpdatedAt: trimString(value.lastUpdatedAt, 48, defaults.lastUpdatedAt),
      pendingOperation
    };
  }

  function normalizeState(source) {
    const defaults = createDefaultState();
    const migrated = migrate(source);
    const normalized = {
      version: SCHEMA_VERSION,
      settings: normalizeSettings(migrated.settings, defaults.settings),
      notifications: [],
      audit: [],
      tabs: normalizeTabs(migrated.tabs, defaults.tabs),
      collections: [],
      personalVocabulary: normalizePersonalVocabulary(migrated.personalVocabulary),
      schoolModeCredential: normalizeSchoolModeCredential(migrated.schoolModeCredential),
      locks: [],
      totp: [],
      schedules: [],
      logo: normalizeLogo(migrated.logo, defaults.logo),
      conversion: normalizeConversion(migrated.conversion),
      status: normalizeStatusModel(migrated.status, defaults.status),
      completenessInventory: normalizeCompletenessInventory(migrated.completenessInventory),
      ollama: normalizeOllama(migrated.ollama, defaults.ollama)
    };
    (Array.isArray(migrated.notifications) ? migrated.notifications : []).some((entry) => {
      const notification = normalizeNotification(entry);
      if (notification) {
        normalized.notifications.push(notification);
      }
      return normalized.notifications.length >= LIMITS.notifications;
    });
    (Array.isArray(migrated.audit) ? migrated.audit : []).some((entry) => {
      const audit = normalizeAudit(entry);
      if (audit) {
        normalized.audit.push(audit);
      }
      return normalized.audit.length >= LIMITS.auditRecords;
    });
    const collectionIds = new Set();
    (Array.isArray(migrated.collections) ? migrated.collections : []).some((entry) => {
      const collection = normalizeCollection(entry);
      if (collection && !collectionIds.has(collection.id)) {
        normalized.collections.push(collection);
        collectionIds.add(collection.id);
      }
      return normalized.collections.length >= LIMITS.collections;
    });
    const lockIds = new Set();
    (Array.isArray(migrated.locks) ? migrated.locks : []).some((entry) => {
      const lock = normalizeLock(entry);
      if (lock && !lockIds.has(lock.id)) {
        normalized.locks.push(lock);
        lockIds.add(lock.id);
      }
      return normalized.locks.length >= LIMITS.locks;
    });
    const totpIds = new Set();
    (Array.isArray(migrated.totp) ? migrated.totp : []).some((entry) => {
      const totp = normalizeTotp(entry);
      if (totp && !totpIds.has(totp.id)) {
        normalized.totp.push(totp);
        totpIds.add(totp.id);
      }
      return normalized.totp.length >= LIMITS.totpEntries;
    });
    const scheduleIds = new Set();
    (Array.isArray(migrated.schedules) ? migrated.schedules : []).some((entry) => {
      const schedule = normalizeSchedule(entry);
      if (schedule && !scheduleIds.has(schedule.id)) {
        normalized.schedules.push(schedule);
        scheduleIds.add(schedule.id);
      }
      return normalized.schedules.length >= LIMITS.schedules;
    });
    return normalized;
  }

  function safeRead() {
    try {
      const text = global.localStorage && global.localStorage.getItem(STORAGE_KEY);
      if (!text) {
        return null;
      }
      return JSON.parse(text);
    } catch (_) {
      storageAvailable = false;
      return null;
    }
  }

  function hydrate() {
    return normalizeState(safeRead() || createDefaultState());
  }

  function writeAudit(action, target, detail) {
    state.audit.unshift({
      id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      action: trimString(action, 120, "Local action"),
      target: trimString(target, 160, ""),
      detail: boundedText(detail, 600, ""),
      createdAt: now()
    });
    state.audit = state.audit.slice(0, LIMITS.auditRecords);
  }

  function emit(change) {
    const snapshot = getState();
    listeners.forEach((listener) => {
      try {
        listener(snapshot, change);
      } catch (_) {
        // A consumer must not prevent the local state from updating.
      }
    });
  }

  function serializedByteLength(text) {
    if (typeof global.TextEncoder === "function") {
      return new global.TextEncoder().encode(text).byteLength;
    }
    return text.length * 2;
  }

  function persist(change) {
    state = normalizeState(state);
    let serialized = JSON.stringify(state);
    if (serializedByteLength(serialized) > LIMITS.stateBytes) {
      state.notifications = state.notifications.slice(0, Math.floor(LIMITS.notifications / 2));
      state.audit = state.audit.slice(0, Math.floor(LIMITS.auditRecords / 2));
      serialized = JSON.stringify(state);
    }
    if (serializedByteLength(serialized) > LIMITS.stateBytes) {
      storageAvailable = false;
      emit(Object.assign({}, change || { type: "state" }, { storage: "unavailable", reason: "size-limit" }));
      return getState();
    }
    try {
      if (global.localStorage) {
        global.localStorage.setItem(STORAGE_KEY, serialized);
      } else {
        storageAvailable = false;
      }
    } catch (_) {
      storageAvailable = false;
    }
    emit(change || { type: "state" });
    return getState();
  }

  function getState() {
    const snapshot = clone(state);
    snapshot.schoolModeCredential = getSchoolModeCredentialState();
    return snapshot;
  }

  function getEffectiveSettings() {
    const settings = clone(state.settings);
    const activeSchedules = getActiveScheduleValues();
    const scheduledOverrides = {};
    if (!settings.schoolMode.enabled) {
      Object.keys(activeSchedules).forEach((setting) => {
        const entry = activeSchedules[setting];
        if (!entry) return;
        if (setting === "languageMode") settings.languageMode = entry.value;
        if (setting === "appearance.theme") settings.appearance.theme = entry.value;
        if (setting === "appearance.density") settings.appearance.density = entry.value;
        if (setting === "appearance.accent") settings.appearance.accent = entry.value;
        if (setting === "appearance.font.family") settings.appearance.font.family = entry.value;
        if (setting === "appearance.font.scale") settings.appearance.font.scale = entry.value;
        if (setting === "appearance.font.weight") settings.appearance.font.weight = entry.value;
        scheduledOverrides[setting] = { ruleId: entry.ruleId, label: entry.label, value: entry.value };
      });
    }
    settings.scheduledOverrides = scheduledOverrides;
    settings.schedulePresentationSuppressed = Boolean(settings.schoolMode.enabled && Object.keys(activeSchedules).length);
    settings.schoolMode.credentialConfigured = isConfiguredSchoolModeCredential(state.schoolModeCredential);
    if (settings.schoolMode.enabled) {
      settings.languageMode = "english";
      settings.personalVocabularyActive = false;
      settings.dimSumEnabled = false;
      settings.schoolMode.active = true;
    } else {
      settings.personalVocabularyActive = Boolean(state.personalVocabulary.payload);
      settings.dimSumEnabled = true;
      settings.schoolMode.active = false;
    }
    return settings;
  }

  function subscribe(listener) {
    if (typeof listener !== "function") {
      return function () {};
    }
    listeners.add(listener);
    return function () {
      listeners.delete(listener);
    };
  }

  function updateSettings(patch, auditTarget) {
    if (!isPlainObject(patch) || hasUnsafeKeys(patch)) {
      return { ok: false, error: "Settings must be an object with supported fields." };
    }
    const next = clone(state.settings);
    if (hasOwn(patch, "languageMode")) next.languageMode = patch.languageMode;
    if (isPlainObject(patch.funnyLevel) && !hasUnsafeKeys(patch.funnyLevel)) {
      next.funnyLevel.english = hasOwn(patch.funnyLevel, "english") ? patch.funnyLevel.english : next.funnyLevel.english;
      next.funnyLevel.cantonese = hasOwn(patch.funnyLevel, "cantonese") ? patch.funnyLevel.cantonese : next.funnyLevel.cantonese;
    }
    if (hasOwn(patch, "showDialogEmoji")) next.showDialogEmoji = patch.showDialogEmoji;
    if (isPlainObject(patch.appearance) && !hasUnsafeKeys(patch.appearance)) {
      next.appearance = Object.assign(next.appearance, patch.appearance);
      if (isPlainObject(patch.appearance.font) && !hasUnsafeKeys(patch.appearance.font)) {
        next.appearance.font = Object.assign(next.appearance.font, patch.appearance.font);
      }
    }
    if (isPlainObject(patch.narrator) && !hasUnsafeKeys(patch.narrator)) {
      next.narrator = Object.assign(next.narrator, patch.narrator);
    }
    state.settings = normalizeSettings(next, createDefaultState().settings);
    writeAudit("Settings changed", auditTarget || "settings", "A browser-local setting changed.");
    persist({ type: "settings" });
    return { ok: true, settings: getEffectiveSettings() };
  }

  function setSchoolMode(options) {
    const request = isPlainObject(options) && !hasUnsafeKeys(options) ? options : {};
    const enabled = Boolean(request.enabled);
    const current = state.settings.schoolMode.enabled;
    if (!current && enabled && !isConfiguredSchoolModeCredential(state.schoolModeCredential)) {
      return { ok: false, error: "Set a browser-local unlock code before enabling this presentation mode." };
    }
    if (current && !enabled && request.credentialAccepted !== true) {
      return { ok: false, error: "Turning off this presentation mode requires a successful browser-local unlock-code check." };
    }
    state.settings.schoolMode.enabled = enabled;
    if (typeof request.name === "string") {
      state.settings.schoolMode.name = trimString(request.name, 80, "School mode") || "School mode";
    }
    state.settings = normalizeSettings(state.settings, createDefaultState().settings);
    writeAudit(enabled ? "Presentation mode enabled" : "Presentation mode disabled", state.settings.schoolMode.name, "The site changed its browser-local presentation state.");
    persist({ type: "school-mode" });
    return { ok: true, settings: getEffectiveSettings() };
  }

  function setSchoolModeCredential(record) {
    const candidate = normalizeSchoolModeCredential(record);
    if (!isConfiguredSchoolModeCredential(candidate)) {
      return { ok: false, error: "The browser-local unlock-code verifier is incomplete or unsupported." };
    }
    state.schoolModeCredential = Object.assign({}, candidate, { configuredAt: now() });
    writeAudit("Presentation-mode unlock code configured", state.settings.schoolMode.name, "A local one-way verifier was stored without the unlock code.");
    persist({ type: "school-mode-credential" });
    return { ok: true, credential: getSchoolModeCredentialState() };
  }

  function getSchoolModeCredentialState() {
    const credential = state.schoolModeCredential;
    return {
      configured: isConfiguredSchoolModeCredential(credential),
      algorithm: isConfiguredSchoolModeCredential(credential) ? credential.algorithm : "",
      configuredAt: isConfiguredSchoolModeCredential(credential) ? credential.configuredAt : null
    };
  }

  function getSchoolModeCredentialSalt() {
    return isConfiguredSchoolModeCredential(state.schoolModeCredential) ? state.schoolModeCredential.salt : "";
  }

  function timingSafeVerifierMatch(candidate) {
    const expected = state.schoolModeCredential.verifier;
    if (typeof candidate !== "string" || !BASE64_SHA256.test(candidate) || !isConfiguredSchoolModeCredential(state.schoolModeCredential) || candidate.length !== expected.length) {
      return false;
    }
    let difference = 0;
    for (let index = 0; index < expected.length; index += 1) {
      difference |= expected.charCodeAt(index) ^ candidate.charCodeAt(index);
    }
    return difference === 0;
  }

  function verifySchoolModeCredential(verifier) {
    return { ok: timingSafeVerifierMatch(verifier) };
  }

  function clearSchoolModeCredential(options) {
    const request = isPlainObject(options) && !hasUnsafeKeys(options) ? options : {};
    if (request.credentialAccepted !== true) {
      return { ok: false, error: "Verify the current browser-local unlock code before resetting it." };
    }
    state.settings.schoolMode.enabled = false;
    state.schoolModeCredential = { algorithm: "", salt: "", verifier: "", configuredAt: null };
    writeAudit("Presentation-mode unlock code reset", state.settings.schoolMode.name, "The browser-local mode and its one-way verifier were reset.");
    persist({ type: "school-mode-credential-reset" });
    return { ok: true, settings: getEffectiveSettings() };
  }

  function getSchoolModeResetBoundary() {
    return {
      storage: "browser local storage",
      key: STORAGE_KEY,
      message: "This site keeps its renamed presentation mode and one-way unlock-code verifier only in this browser's local storage. Clearing this site's local storage resets the local preferences, vocabulary cache, local lock metadata, and unlock-code verifier; it does not change desktop-application or server data."
    };
  }

  function resetLocalState(options) {
    if (!isPlainObject(options) || options.confirm !== true) {
      return { ok: false, error: "Resetting browser-local state requires an explicit confirmation." };
    }
    state = createDefaultState();
    try {
      if (global.localStorage) global.localStorage.removeItem(STORAGE_KEY);
    } catch (_) {
      storageAvailable = false;
    }
    emit({ type: "reset" });
    return { ok: true, state: getState() };
  }

  function notify(input) {
    const draft = isPlainObject(input) && !hasUnsafeKeys(input) ? input : {};
    const notification = normalizeNotification({
      id: safeId(draft.id, `notice-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
      kind: draft.kind,
      title: draft.title || "Local notification",
      body: draft.body || "",
      actions: draft.actions,
      createdAt: now(),
      dismissed: false
    });
    if (!notification) {
      return { ok: false, error: "A notification needs a title." };
    }
    state.notifications.unshift(notification);
    state.notifications = state.notifications.slice(0, LIMITS.notifications);
    writeAudit("Notification recorded", notification.id, notification.title);
    persist({ type: "notification", notification: clone(notification) });
    return { ok: true, notification: clone(notification) };
  }

  function dismissNotification(id) {
    const target = safeId(id, "");
    const notification = state.notifications.find((item) => item.id === target);
    if (!notification) {
      return { ok: false, error: "Notification not found." };
    }
    notification.dismissed = true;
    writeAudit("Notification dismissed", target, notification.title);
    persist({ type: "notification-dismissed", id: target });
    return { ok: true };
  }

  function clearNotifications(options) {
    const request = isPlainObject(options) ? options : {};
    const onlyDismissed = request.onlyDismissed === true;
    const previous = state.notifications.length;
    state.notifications = onlyDismissed ? state.notifications.filter((item) => !item.dismissed) : [];
    writeAudit("Notifications cleared", "notification-history", `${previous - state.notifications.length} local notification records removed.`);
    persist({ type: "notification-clear" });
    return { ok: true, removed: previous - state.notifications.length };
  }

  function recordAudit(action, target, detail) {
    writeAudit(action, target, detail);
    persist({ type: "audit" });
    return clone(state.audit[0]);
  }

  function getStatusModel() {
    return clone(state.status);
  }

  function updateStatusModel(input) {
    const raw = isPlainObject(input) && !hasUnsafeKeys(input) ? input : {};
    const candidate = clone(state.status);
    if (hasOwn(raw, "currentState")) candidate.currentState = raw.currentState;
    if (hasOwn(raw, "summary")) candidate.summary = raw.summary;
    if (Array.isArray(raw.evidence)) candidate.evidence = raw.evidence;
    if (Array.isArray(raw.activeInteractions)) candidate.activeInteractions = raw.activeInteractions;
    if (Array.isArray(raw.nextSteps)) candidate.nextSteps = raw.nextSteps;
    candidate.lastUpdatedAt = now();
    state.status = normalizeStatusModel(candidate, createDefaultState().status);
    writeAudit("Local status updated", "status", state.status.summary);
    persist({ type: "status" });
    return { ok: true, status: getStatusModel() };
  }

  function upsertStatusEvidence(input) {
    const evidence = normalizeStatusEvidence(Object.assign({}, input, { updatedAt: now() }));
    if (!evidence) return { ok: false, error: "Status evidence needs an id and visible label." };
    const index = state.status.evidence.findIndex((item) => item.id === evidence.id);
    if (index < 0 && state.status.evidence.length >= LIMITS.statusEvidence) return { ok: false, error: "The local status-evidence limit has been reached." };
    if (index < 0) state.status.evidence.unshift(evidence);
    else state.status.evidence[index] = evidence;
    state.status.lastUpdatedAt = now();
    writeAudit("Local status evidence saved", evidence.id, evidence.label);
    persist({ type: "status" });
    return { ok: true, evidence: clone(evidence) };
  }

  function getCompletenessInventory() {
    return clone(state.completenessInventory);
  }

  function setCompletenessInventory(input) {
    const inventory = normalizeCompletenessInventory(input);
    state.completenessInventory = inventory;
    writeAudit("Completeness inventory saved", "completeness-inventory", `${inventory.surfaces.length} local surface record(s) saved.`);
    persist({ type: "completeness-inventory" });
    return { ok: true, inventory: getCompletenessInventory(), summary: getCompletenessSummary() };
  }

  function upsertCompletenessSurface(input) {
    const surface = normalizeCompletenessSurface(Object.assign({}, input, { updatedAt: now() }));
    if (!surface) return { ok: false, error: "A completeness surface needs an id and visible label." };
    const index = state.completenessInventory.surfaces.findIndex((item) => item.id === surface.id);
    if (index < 0 && state.completenessInventory.surfaces.length >= LIMITS.inventorySurfaces) return { ok: false, error: "The local completeness-surface limit has been reached." };
    if (index < 0) state.completenessInventory.surfaces.push(surface);
    else state.completenessInventory.surfaces[index] = surface;
    writeAudit("Completeness surface saved", surface.id, surface.label);
    persist({ type: "completeness-inventory" });
    return { ok: true, surface: clone(surface), summary: getCompletenessSummary() };
  }

  function getCompletenessSummary() {
    const summary = { surfaces: state.completenessInventory.surfaces.length, features: 0, completeFeatures: 0, incompleteFeatures: 0, evidence: {} };
    ["implementation", "documentation", "localization", "persistence", "test", "interaction", "capture"].forEach((key) => { summary.evidence[key] = { verified: 0, incomplete: 0, notApplicable: 0 }; });
    state.completenessInventory.surfaces.forEach((surface) => surface.features.forEach((feature) => {
      summary.features += 1;
      let complete = feature.state === "verified";
      Object.keys(summary.evidence).forEach((key) => {
        const entry = feature.evidence[key];
        if (entry.status === "verified") summary.evidence[key].verified += 1;
        else if (entry.status === "not-applicable" && entry.reason) summary.evidence[key].notApplicable += 1;
        else {
          summary.evidence[key].incomplete += 1;
          complete = false;
        }
      });
      if (complete) summary.completeFeatures += 1;
      else summary.incompleteFeatures += 1;
    }));
    return summary;
  }

  function registerCommand(entry) {
    const raw = isPlainObject(entry) && !hasUnsafeKeys(entry) ? entry : {};
    const id = safeId(raw.id, "");
    const title = trimString(raw.title, 160, "");
    if (!id || !title) {
      return { ok: false, error: "A command needs a stable id and a title." };
    }
    if (!commandEntries.has(id) && commandEntries.size >= LIMITS.commandPaletteEntries) {
      return { ok: false, error: "The command palette index has reached its local limit." };
    }
    const keywords = Array.isArray(raw.keywords) ? raw.keywords.slice(0, 20).map((word) => trimString(word, 80, "")).filter(Boolean) : [];
    commandEntries.set(id, {
      id,
      title,
      description: boundedText(raw.description, 360, ""),
      group: trimString(raw.group, 80, "General") || "General",
      elementId: safeId(raw.elementId, ""),
      keywords,
      action: typeof raw.action === "function" ? raw.action : null
    });
    return { ok: true, command: getCommand(id) };
  }

  function unregisterCommand(id) {
    return commandEntries.delete(safeId(id, ""));
  }

  function getCommand(id) {
    const command = commandEntries.get(safeId(id, ""));
    if (!command) return null;
    const copyCommand = clone(Object.assign({}, command, { action: undefined }));
    delete copyCommand.action;
    return copyCommand;
  }

  function searchCommandPalette(query) {
    const needle = trimString(query, 200, "").toLocaleLowerCase();
    return Array.from(commandEntries.values()).filter((command) => {
      if (!needle) return true;
      const text = [command.title, command.description, command.group].concat(command.keywords).join(" ").toLocaleLowerCase();
      return text.includes(needle);
    }).map((command) => getCommand(command.id));
  }

  function setTeleportHandler(handler) {
    teleportHandler = typeof handler === "function" ? handler : null;
  }

  function teleportTo(id) {
    const command = commandEntries.get(safeId(id, ""));
    if (!command) return { ok: false, error: "Command not found." };
    try {
      if (teleportHandler) {
        const handled = teleportHandler(getCommand(command.id));
        if (handled !== false) return { ok: true, via: "host" };
      }
      if (command.action) {
        command.action();
        return { ok: true, via: "action" };
      }
      if (command.elementId && global.document) {
        const target = global.document.getElementById(command.elementId) || global.document.querySelector(`[data-contract-id="${command.elementId}"]`);
        if (target) {
          target.scrollIntoView({ behavior: "smooth", block: "center" });
          if (typeof target.focus === "function") target.focus({ preventScroll: true });
          return { ok: true, via: "element" };
        }
      }
    } catch (_) {
      return { ok: false, error: "The host could not open the requested destination." };
    }
    return { ok: false, error: "This destination has not been connected to a host surface yet." };
  }

  function nestedQuantifier(pattern) {
    return /\((?:[^()\\]|\\.)*[+*{][^()]*\)[+*{]/.test(pattern) || /(?:\.\*|\.\+|\[[^\]]+\][+*]|\\w[+*])[+*{]/.test(pattern);
  }

  function evaluateRegex(input) {
    const request = isPlainObject(input) && !hasUnsafeKeys(input) ? input : {};
    const pattern = boundedText(request.pattern, LIMITS.regexPatternCharacters + 1, "");
    const sample = boundedText(request.sample, LIMITS.regexSampleCharacters + 1, "");
    const flags = trimString(request.flags, 8, "");
    if (!pattern) return { ok: false, error: "Enter a pattern before evaluating it.", matches: [] };
    if (pattern.length > LIMITS.regexPatternCharacters) return { ok: false, error: `Patterns are limited to ${LIMITS.regexPatternCharacters} characters.`, matches: [] };
    if (sample.length > LIMITS.regexSampleCharacters) return { ok: false, error: `Sample text is limited to ${LIMITS.regexSampleCharacters} characters.`, matches: [] };
    if (!/^[dgimsuvy]*$/.test(flags) || new Set(flags).size !== flags.length) return { ok: false, error: "Use each supported regular-expression flag at most once.", matches: [] };
    if (/\\(?:[1-9]|k<)/.test(pattern) || nestedQuantifier(pattern)) {
      return { ok: false, error: "This pattern is blocked because it can cause excessive local evaluation time.", matches: [] };
    }
    try {
      const expression = new RegExp(pattern, flags.includes("g") ? flags : `${flags}g`);
      const matches = [];
      let match;
      while ((match = expression.exec(sample)) && matches.length < LIMITS.regexMatches) {
        matches.push({ value: match[0], index: match.index, groups: match.slice(1) });
        if (match[0] === "") expression.lastIndex += 1;
      }
      return { ok: true, matches, truncated: matches.length >= LIMITS.regexMatches, error: null };
    } catch (error) {
      return { ok: false, error: error && error.message ? error.message : "The pattern is invalid.", matches: [] };
    }
  }

  function registerTab(input) {
    const raw = isPlainObject(input) && !hasUnsafeKeys(input) ? input : {};
    const id = safeId(raw.id, "");
    if (!id) return { ok: false, error: "A tab needs a stable id." };
    const position = state.tabs.items.findIndex((tab) => tab.id === id);
    const normalized = normalizeTabItem(Object.assign({}, raw, { id }), new Set(state.tabs.groups.map((group) => group.id)));
    if (!normalized) return { ok: false, error: "A tab needs a visible label." };
    if (position < 0 && state.tabs.items.length >= LIMITS.tabs) return { ok: false, error: "The local tab limit has been reached." };
    if (position < 0) state.tabs.items.push(normalized);
    else state.tabs.items[position] = normalized;
    if (!state.tabs.activeId) state.tabs.activeId = id;
    writeAudit("Tab registered", id, normalized.label);
    persist({ type: "tabs" });
    return { ok: true, tabs: getAccessibleTabs() };
  }

  function createTabGroup(input) {
    const raw = isPlainObject(input) && !hasUnsafeKeys(input) ? input : {};
    const group = normalizeTabGroup({
      id: raw.id || `group-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      label: raw.label,
      color: raw.color,
      collapsed: raw.collapsed
    });
    if (!group) return { ok: false, error: "A tab group needs an id and visible name." };
    const existing = state.tabs.groups.findIndex((item) => item.id === group.id);
    if (existing < 0 && state.tabs.groups.length >= LIMITS.tabGroups) return { ok: false, error: "The local tab-group limit has been reached." };
    if (existing < 0) state.tabs.groups.push(group);
    else state.tabs.groups[existing] = group;
    writeAudit("Tab group saved", group.id, group.label);
    persist({ type: "tabs" });
    return { ok: true, group: clone(group) };
  }

  function updateTab(id, patch) {
    const target = state.tabs.items.find((tab) => tab.id === safeId(id, ""));
    if (!target || !isPlainObject(patch) || hasUnsafeKeys(patch)) return { ok: false, error: "Tab not found or patch is invalid." };
    const candidate = Object.assign({}, target, patch, { id: target.id });
    const normalized = normalizeTabItem(candidate, new Set(state.tabs.groups.map((group) => group.id)));
    if (!normalized) return { ok: false, error: "Tab update is invalid." };
    Object.assign(target, normalized);
    writeAudit("Tab updated", target.id, target.label);
    persist({ type: "tabs" });
    return { ok: true, tab: clone(target) };
  }

  function moveTab(id, destinationIndex) {
    const sourceIndex = state.tabs.items.findIndex((tab) => tab.id === safeId(id, ""));
    if (sourceIndex < 0) return { ok: false, error: "Tab not found." };
    const targetIndex = boundedInteger(destinationIndex, 0, state.tabs.items.length - 1, sourceIndex);
    const [tab] = state.tabs.items.splice(sourceIndex, 1);
    state.tabs.items.splice(targetIndex, 0, tab);
    writeAudit("Tab reordered", tab.id, tab.label);
    persist({ type: "tabs" });
    return { ok: true, tabs: getAccessibleTabs() };
  }

  function setActiveTab(id) {
    const tab = state.tabs.items.find((item) => item.id === safeId(id, ""));
    if (!tab) return { ok: false, error: "Tab not found." };
    state.tabs.activeId = tab.id;
    persist({ type: "tabs" });
    return { ok: true, tabs: getAccessibleTabs() };
  }

  function setTabDock(dock) {
    const nextDock = enumValue(dock, TAB_DOCKS, "");
    if (!nextDock) return { ok: false, error: "Choose a valid tab dock." };
    state.tabs.dock = nextDock;
    state.tabs.orientation = nextDock === "left" || nextDock === "right" ? "vertical" : "horizontal";
    writeAudit("Tab dock updated", "feature-tabs", nextDock);
    persist({ type: "tabs" });
    return { ok: true, tabs: getAccessibleTabs() };
  }

  function setTabAppearance(patch) {
    if (!isPlainObject(patch) || hasUnsafeKeys(patch)) return { ok: false, error: "The tab-strip appearance patch is invalid." };
    state.tabs.appearance = normalizeTabStripAppearance(Object.assign({}, state.tabs.appearance, patch), state.tabs.appearance);
    writeAudit("Tab-strip appearance updated", "feature-tabs", "Browser-local tab-strip appearance changed.");
    persist({ type: "tabs" });
    return { ok: true, appearance: clone(state.tabs.appearance) };
  }

  function closeTab(id, options) {
    const request = isPlainObject(options) ? options : {};
    const index = state.tabs.items.findIndex((item) => item.id === safeId(id, ""));
    if (index < 0) return { ok: false, error: "Tab not found." };
    const tab = state.tabs.items[index];
    if ((!tab.closable || tab.pinned || tab.locked) && request.includeProtected !== true) {
      return { ok: false, error: "This tab is protected. Review and explicitly include protected tabs before closing it." };
    }
    state.tabs.items.splice(index, 1);
    if (state.tabs.activeId === tab.id) state.tabs.activeId = state.tabs.items[0] ? state.tabs.items[0].id : null;
    writeAudit("Tab closed", tab.id, tab.label);
    persist({ type: "tabs" });
    return { ok: true, closed: clone(tab) };
  }

  function getAccessibleTabs() {
    const total = state.tabs.items.length;
    return {
      dock: state.tabs.dock,
      orientation: state.tabs.orientation,
      ariaOrientation: state.tabs.orientation,
      activeId: state.tabs.activeId,
      appearance: clone(state.tabs.appearance),
      groups: clone(state.tabs.groups),
      tabs: state.tabs.items.map((tab, index) => ({
        id: tab.id,
        label: tab.label,
        groupId: tab.groupId,
        pinned: tab.pinned,
        locked: tab.locked,
        closable: tab.closable,
        appearance: clone(tab.appearance),
        role: "tab",
        tabId: `${tab.id}-tab`,
        panelId: tab.panelId,
        ariaControls: tab.panelId,
        ariaSelected: tab.id === state.tabs.activeId,
        ariaPosInSet: index + 1,
        ariaSetSize: total
      }))
    };
  }

  function saveCollection(input) {
    const collection = normalizeCollection(Object.assign({}, input, { updatedAt: now() }));
    if (!collection) return { ok: false, error: "A collection needs a stable id, a label, and valid records." };
    const existing = state.collections.findIndex((item) => item.id === collection.id);
    if (existing < 0 && state.collections.length >= LIMITS.collections) return { ok: false, error: "The local collection limit has been reached." };
    if (existing < 0) state.collections.push(collection);
    else state.collections[existing] = collection;
    writeAudit("Collection saved", collection.id, collection.label);
    persist({ type: "collection" });
    return { ok: true, collection: clone(collection) };
  }

  function getCollection(id) {
    const collection = state.collections.find((item) => item.id === safeId(id, ""));
    return collection ? clone(collection) : null;
  }

  function selectCollectionRecords(records, ids, selected) {
    const selectedIds = new Set((Array.isArray(ids) ? ids : []).map((id) => safeId(id, "")).filter(Boolean).slice(0, LIMITS.collectionSelection));
    return (Array.isArray(records) ? records : []).map((record) => {
      const normalized = normalizeCollectionRecord(record);
      if (!normalized) return null;
      if (selectedIds.has(normalized.id) && !normalized.disabled) normalized.selected = selected !== false;
      return normalized;
    }).filter(Boolean);
  }

  function previewBulkAction(records, action, options) {
    const request = isPlainObject(options) ? options : {};
    const includeProtected = request.includeProtected === true;
    const all = (Array.isArray(records) ? records : []).map(normalizeCollectionRecord).filter(Boolean);
    const selected = all.filter((record) => record.selected);
    const protectedRecords = selected.filter((record) => record.disabled);
    const affected = selected.filter((record) => includeProtected || !record.disabled);
    return {
      action: trimString(action, 80, "bulk action") || "bulk action",
      selected: selected.length,
      affected: affected.length,
      excluded: protectedRecords.map((record) => ({ id: record.id, label: record.label, reason: "Protected or disabled" })),
      preview: affected.slice(0, 50).map((record) => ({ id: record.id, label: record.label }))
    };
  }

  function beginDestructiveAction(input) {
    const raw = isPlainObject(input) && !hasUnsafeKeys(input) ? input : {};
    const id = safeId(raw.id, `destructive-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
    const title = trimString(raw.title, 160, "Destructive action");
    const affected = boundedInteger(raw.affected, 0, 1000000, 0);
    return {
      id,
      title,
      affected,
      keys: { first: false, second: false },
      slider: 0,
      state: "awaiting-keys",
      canConfirm: false,
      emergencyExitAvailable: true
    };
  }

  function advanceDestructiveAction(session, input) {
    const source = isPlainObject(session) && !hasUnsafeKeys(session) ? clone(session) : null;
    const request = isPlainObject(input) && !hasUnsafeKeys(input) ? input : {};
    if (!source || !source.keys || source.state === "cancelled" || source.state === "confirmed") {
      return { ok: false, error: "This confirmation session is not active." };
    }
    if (request.cancel === true) {
      source.state = "cancelled";
      source.canConfirm = false;
      return { ok: true, session: source };
    }
    if (request.key === "first" || request.key === "second") source.keys[request.key] = true;
    if (hasOwn(request, "slider")) source.slider = boundedInteger(request.slider, 0, 100, source.slider);
    const bothKeys = source.keys.first && source.keys.second;
    source.state = bothKeys ? "awaiting-slider" : "awaiting-keys";
    source.canConfirm = bothKeys && source.slider === 100;
    if (request.confirm === true) {
      if (!source.canConfirm) return { ok: false, error: "Both controls and the full confirmation slider are required.", session: source };
      source.state = "confirmed";
    }
    return { ok: true, session: source };
  }

  function parseJsonWithDuplicateKeyGuard(text) {
    let cursor = 0;
    const source = String(text);
    function whitespace() { while (/\s/.test(source[cursor] || "")) cursor += 1; }
    function assertNestingDepth(depth) {
      if (depth > LIMITS.vocabularyNestingDepth) {
        throw new Error(`Vocabulary JSON nesting exceeds the supported maximum of ${LIMITS.vocabularyNestingDepth} levels.`);
      }
    }
    function stringToken() {
      const start = cursor;
      if (source[cursor] !== '"') throw new Error("Expected a JSON string.");
      cursor += 1;
      while (cursor < source.length) {
        const character = source[cursor];
        if (character === "\\") {
          cursor += 2;
          continue;
        }
        cursor += 1;
        if (character === '"') return JSON.parse(source.slice(start, cursor));
      }
      throw new Error("Unterminated JSON string.");
    }
    function value(depth) {
      whitespace();
      const character = source[cursor];
      if (character === "{") return object(depth + 1);
      if (character === "[") return array(depth + 1);
      if (character === '"') return stringToken();
      const primitive = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(source.slice(cursor));
      if (!primitive) throw new Error("Invalid JSON value.");
      cursor += primitive[0].length;
      return undefined;
    }
    function object(depth) {
      assertNestingDepth(depth);
      const keys = new Set();
      cursor += 1;
      whitespace();
      if (source[cursor] === "}") { cursor += 1; return {}; }
      while (cursor < source.length) {
        whitespace();
        const key = stringToken();
        if (keys.has(key)) throw new Error(`Duplicate JSON key: ${key}`);
        keys.add(key);
        whitespace();
        if (source[cursor] !== ":") throw new Error("Expected a colon after a JSON key.");
        cursor += 1;
        value(depth);
        whitespace();
        if (source[cursor] === "}") { cursor += 1; return {}; }
        if (source[cursor] !== ",") throw new Error("Expected a comma between JSON fields.");
        cursor += 1;
      }
      throw new Error("Unterminated JSON object.");
    }
    function array(depth) {
      assertNestingDepth(depth);
      cursor += 1;
      whitespace();
      if (source[cursor] === "]") { cursor += 1; return []; }
      while (cursor < source.length) {
        value(depth);
        whitespace();
        if (source[cursor] === "]") { cursor += 1; return []; }
        if (source[cursor] !== ",") throw new Error("Expected a comma between JSON values.");
        cursor += 1;
      }
      throw new Error("Unterminated JSON array.");
    }
    value(0);
    whitespace();
    if (cursor !== source.length) throw new Error("Unexpected content after JSON data.");
    return JSON.parse(source);
  }

  function utf8ByteLength(text) {
    const source = String(text);
    let bytes = 0;
    for (let index = 0; index < source.length; index += 1) {
      const code = source.charCodeAt(index);
      if (code <= 0x7f) bytes += 1;
      else if (code <= 0x7ff) bytes += 2;
      else if (code >= 0xd800 && code <= 0xdbff && index + 1 < source.length) {
        const next = source.charCodeAt(index + 1);
        if (next >= 0xdc00 && next <= 0xdfff) {
          bytes += 4;
          index += 1;
        } else {
          bytes += 3;
        }
      } else {
        bytes += 3;
      }
    }
    return bytes;
  }

  function loadPersonalVocabulary(text) {
    if (typeof text !== "string") return { ok: false, error: "Choose a JSON file before loading vocabulary replacements." };
    if (utf8ByteLength(text) > LIMITS.vocabularyBytes) return { ok: false, error: `Vocabulary files are limited to ${LIMITS.vocabularyBytes} bytes.` };
    let parsed;
    try {
      parsed = parseJsonWithDuplicateKeyGuard(text);
    } catch (error) {
      return { ok: false, error: error && error.message ? error.message : "The vocabulary JSON is invalid." };
    }
    const payload = normalizeVocabularyPayload(parsed);
    if (!payload) return { ok: false, error: "The vocabulary file must use version 1 with bounded from/to replacement entries only." };
    state.personalVocabulary = { status: "loaded", payload };
    writeAudit("Personal vocabulary loaded", "vocabulary", `${payload.replacements.length} local replacement entries were validated.`);
    persist({ type: "personal-vocabulary" });
    return { ok: true, count: payload.replacements.length };
  }

  function clearPersonalVocabulary() {
    state.personalVocabulary = { status: "empty", payload: null };
    writeAudit("Personal vocabulary cleared", "vocabulary", "The browser-local vocabulary cache was removed.");
    persist({ type: "personal-vocabulary" });
    return { ok: true };
  }

  function applyPersonalVocabulary(text) {
    if (typeof text !== "string" || state.settings.schoolMode.enabled || !state.personalVocabulary.payload) return text;
    return state.personalVocabulary.payload.replacements.reduce((result, replacement) => result.split(replacement.from).join(replacement.to), text).slice(0, 32000);
  }

  function getFileAdapters() {
    return clone(FILE_ADAPTERS);
  }

  function getFileAdapterAvailability() {
    return FILE_ADAPTERS.map((adapter) => ({ id: adapter.id, category: adapter.category, label: adapter.label, enabled: adapter.enabled, bundled: adapter.bundled, reason: adapter.reason }));
  }

  function conversionJobId(raw) {
    return safeId(raw && raw.id, `conversion-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);
  }

  function getBrowserConversionJobs() {
    return clone(state.conversion.jobs);
  }

  function recordBrowserConversionJob(input) {
    const raw = isPlainObject(input) && !hasUnsafeKeys(input) ? input : {};
    const adapter = FILE_ADAPTERS.find((item) => item.id === safeId(raw.adapterId, ""));
    const sourceName = safeFileName(raw.sourceName || raw.sourceLabel, "");
    if (!sourceName) {
      return { ok: false, error: "A browser-local conversion record needs a source file name." };
    }
    const requestedStatus = enumValue(raw.status, CONVERSION_STATUSES, "queued");
    const job = normalizeConversionJob({
      id: conversionJobId(raw),
      sourceName,
      sourceType: trimString(raw.sourceType || raw.detectedKind, 120, "unknown") || "unknown",
      sourceBytes: raw.sourceBytes,
      detectedKind: trimString(raw.detectedKind, 120, raw.sourceType || "unknown") || "unknown",
      category: trimString(raw.category, 120, adapter ? adapter.category : "Unknown") || "Unknown",
      targetType: trimString(raw.targetType || raw.targetFormat, 120, "unknown") || "unknown",
      targetFormat: trimString(raw.targetFormat, 120, raw.targetType || "unknown") || "unknown",
      targetName: trimString(raw.targetName, 180, ""),
      adapterId: adapter ? adapter.id : safeId(raw.adapterId, ""),
      status: adapter && adapter.enabled && adapter.bundled ? requestedStatus : (raw.status ? requestedStatus : "unavailable"),
      createdAt: now(),
      updatedAt: now(),
      reason: boundedText(raw.reason, 600, adapter && adapter.enabled && adapter.bundled ? "Queued in this browser; source bytes are not persisted." : (adapter ? adapter.reason : "No matching adapter is registered."))
    });
    if (!job) {
      return { ok: false, error: "The browser-local conversion record could not be validated." };
    }
    const duplicate = state.conversion.jobs.some((item) => item.id === job.id);
    if (duplicate) {
      return { ok: false, error: "A browser-local conversion record already uses that identifier." };
    }
    state.conversion.jobs.unshift(job);
    state.conversion.jobs = state.conversion.jobs.slice(0, LIMITS.conversionJobs);
    writeAudit("Browser-local conversion queued", job.id, job.reason);
    persist({ type: "browser-conversion-recorded", jobId: job.id });
    return { ok: true, job: clone(job) };
  }

  function updateBrowserConversionJob(id, patch) {
    const jobId = safeId(id, "");
    const index = state.conversion.jobs.findIndex((job) => job.id === jobId);
    if (index < 0) {
      return { ok: false, error: "The browser-local conversion record was not found." };
    }
    const raw = isPlainObject(patch) && !hasUnsafeKeys(patch) ? patch : {};
    const previous = state.conversion.jobs[index];
    const next = normalizeConversionJob(Object.assign({}, previous, {
      sourceType: hasOwn(raw, "sourceType") ? raw.sourceType : previous.sourceType,
      sourceBytes: hasOwn(raw, "sourceBytes") ? raw.sourceBytes : previous.sourceBytes,
      detectedKind: hasOwn(raw, "detectedKind") ? raw.detectedKind : previous.detectedKind,
      category: hasOwn(raw, "category") ? raw.category : previous.category,
      targetType: hasOwn(raw, "targetType") ? raw.targetType : previous.targetType,
      targetFormat: hasOwn(raw, "targetFormat") ? raw.targetFormat : previous.targetFormat,
      targetName: hasOwn(raw, "targetName") ? raw.targetName : previous.targetName,
      status: hasOwn(raw, "status") ? raw.status : previous.status,
      adapterId: hasOwn(raw, "adapterId") ? raw.adapterId : previous.adapterId,
      downloadRequestedAt: hasOwn(raw, "downloadRequestedAt") ? raw.downloadRequestedAt : previous.downloadRequestedAt,
      reason: hasOwn(raw, "reason") ? raw.reason : previous.reason,
      updatedAt: now()
    }));
    if (!next) {
      return { ok: false, error: "The browser-local conversion update could not be validated." };
    }
    state.conversion.jobs[index] = next;
    writeAudit("Browser-local conversion updated", next.id, next.reason || next.status);
    persist({ type: "browser-conversion-updated", jobId: next.id });
    return { ok: true, job: clone(next) };
  }

  function removeBrowserConversionJob(id) {
    const jobId = safeId(id, "");
    const index = state.conversion.jobs.findIndex((job) => job.id === jobId);
    if (index < 0) {
      return { ok: false, error: "The browser-local conversion record was not found." };
    }
    const removed = state.conversion.jobs.splice(index, 1)[0];
    writeAudit("Browser-local conversion record removed", removed.id, "Only metadata was removed. No source or output file was changed.");
    persist({ type: "browser-conversion-removed", jobId: removed.id });
    return { ok: true, job: clone(removed) };
  }

  function planConversion(input) {
    const raw = isPlainObject(input) && !hasUnsafeKeys(input) ? input : {};
    const result = recordBrowserConversionJob(Object.assign({}, raw, {
      sourceName: raw.sourceName || raw.sourceType || "planned-source",
      status: raw.status || "planned"
    }));
    if (!result.ok) {
      return {
        id: "",
        sourceType: trimString(raw.sourceType, 120, "unknown") || "unknown",
        targetType: trimString(raw.targetType, 120, "unknown") || "unknown",
        status: "failed",
        adapterId: safeId(raw.adapterId, ""),
        createdAt: now(),
        reason: result.error
      };
    }
    return result.job;
  }

  function setLogoMetadata(input) {
    const raw = isPlainObject(input) && !hasUnsafeKeys(input) ? input : {};
    state.logo = normalizeLogo(Object.assign({}, raw, { updatedAt: now() }), createDefaultState().logo);
    writeAudit("Logo preference updated", "logo", "Only local logo metadata was saved; no image bytes were exported or uploaded.");
    persist({ type: "logo" });
    return { ok: true, logo: clone(state.logo) };
  }

  function containsSecretFields(value) {
    if (!isPlainObject(value)) return false;
    return Object.keys(value).some((key) => /secret|password|credential|token|code|otp|uri/i.test(key));
  }

  function createToyLock(input) {
    const raw = isPlainObject(input) && !hasUnsafeKeys(input) ? input : {};
    if (containsSecretFields(raw)) return { ok: false, error: "Toy-lock metadata cannot contain a password, code, token, or secret." };
    const lock = normalizeLock({
      id: raw.id || `lock-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      target: raw.target,
      label: raw.label,
      method: raw.method,
      duration: raw.duration,
      minutes: raw.minutes,
      locked: true,
      createdAt: now(),
      updatedAt: now()
    });
    if (!lock) return { ok: false, error: "A toy lock needs a stable target." };
    const existing = state.locks.findIndex((item) => item.id === lock.id);
    if (existing < 0 && state.locks.length >= LIMITS.locks) return { ok: false, error: "The local toy-lock limit has been reached." };
    if (existing < 0) state.locks.push(lock);
    else state.locks[existing] = lock;
    writeAudit("Toy lock configured", lock.target, "Credential material is handled by the host and was not saved in browser state.");
    persist({ type: "toy-lock" });
    return { ok: true, lock: clone(lock) };
  }

  function resolveToyLock(id, credentialAccepted) {
    const lock = state.locks.find((item) => item.id === safeId(id, ""));
    if (!lock) return { ok: false, error: "Toy lock not found." };
    if (credentialAccepted !== true) return { ok: false, error: "The host credential check did not approve this toy lock." };
    lock.locked = false;
    lock.updatedAt = now();
    writeAudit("Toy lock opened", lock.target, "The browser saved only the resulting lock state.");
    persist({ type: "toy-lock" });
    return { ok: true, lock: clone(lock) };
  }

  function createTotpShell(input) {
    const raw = isPlainObject(input) && !hasUnsafeKeys(input) ? input : {};
    if (containsSecretFields(raw)) return { ok: false, error: "The TOTP utility shell never accepts or stores a secret, code, URI, or credential." };
    const entry = normalizeTotp({
      id: raw.id || `totp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      label: raw.label,
      issuer: raw.issuer,
      account: raw.account,
      algorithm: raw.algorithm,
      digits: raw.digits,
      period: raw.period,
      enrolled: false,
      updatedAt: now()
    });
    if (!entry) return { ok: false, error: "The TOTP utility shell needs a label." };
    const existing = state.totp.findIndex((item) => item.id === entry.id);
    if (existing < 0 && state.totp.length >= LIMITS.totpEntries) return { ok: false, error: "The local TOTP metadata limit has been reached." };
    if (existing < 0) state.totp.push(entry);
    else state.totp[existing] = entry;
    writeAudit("TOTP shell saved", entry.id, "The browser saved metadata only and did not request or reveal a secret.");
    persist({ type: "totp" });
    return { ok: true, entry: clone(entry) };
  }

  function markTotpEnrollment(id, hostConfirmed) {
    const entry = state.totp.find((item) => item.id === safeId(id, ""));
    if (!entry) return { ok: false, error: "TOTP utility entry not found." };
    if (hostConfirmed !== true) return { ok: false, error: "The host did not confirm enrollment." };
    entry.enrolled = true;
    entry.updatedAt = now();
    writeAudit("TOTP enrollment marked", entry.id, "Only an enrollment result was stored locally.");
    persist({ type: "totp" });
    return { ok: true, entry: clone(entry) };
  }

  function createSchedule(input) {
    const raw = isPlainObject(input) && !hasUnsafeKeys(input) ? input : {};
    if (hasOwn(raw, "source") && raw.source !== "local") return { ok: false, error: "Only browser-local schedules are available on this page." };
    if (hasOwn(raw, "version") && Number(raw.version) !== SCHEDULE_RULE_VERSION) return { ok: false, error: "This browser-local schedule version is unsupported." };
    const schedule = normalizeSchedule(Object.assign({}, raw, {
      id: raw.id || `schedule-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      version: SCHEDULE_RULE_VERSION,
      source: "local"
    }));
    if (!schedule) return { ok: false, error: "A local schedule needs an id, a supported setting, and a scalar value." };
    const existing = state.schedules.findIndex((item) => item.id === schedule.id);
    if (existing < 0 && state.schedules.length >= LIMITS.schedules) return { ok: false, error: "The local schedule limit has been reached." };
    if (existing < 0) state.schedules.push(schedule);
    else state.schedules[existing] = schedule;
    writeAudit("Local schedule saved", schedule.id, `${schedule.label} uses local time only.`);
    persist({ type: "schedule" });
    return { ok: true, schedule: clone(schedule) };
  }

  function getSchedules() {
    return state.schedules.map((schedule) => clone(schedule));
  }

  function removeSchedule(id) {
    const safe = safeId(id, "");
    const index = state.schedules.findIndex((schedule) => schedule.id === safe);
    if (index < 0) return { ok: false, error: "The browser-local schedule was not found." };
    const removed = state.schedules.splice(index, 1)[0];
    writeAudit("Local schedule removed", removed.id, `${removed.label} was removed from this browser only.`);
    persist({ type: "schedule" });
    return { ok: true, schedule: clone(removed) };
  }

  function minutesSinceMidnight(value) {
    if (!/^\d{2}:\d{2}$/.test(value || "")) return null;
    const [hours, minutes] = value.split(":").map(Number);
    if (hours > 23 || minutes > 59) return null;
    return (hours * 60) + minutes;
  }

  function localDateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function scheduleAnchorDate(date, start, end) {
    const anchor = new Date(date.getTime());
    const current = (date.getHours() * 60) + date.getMinutes();
    if (start !== null && end !== null && start > end && current < end) anchor.setDate(anchor.getDate() - 1);
    return anchor;
  }

  function scheduleMatches(rule, date) {
    if (!rule.enabled || rule.source !== "local") return false;
    const localDate = date || new Date();
    const start = minutesSinceMidnight(rule.startTime);
    const end = minutesSinceMidnight(rule.endTime);
    const current = (localDate.getHours() * 60) + localDate.getMinutes();
    if (start !== null && end !== null && start === end) return false;
    const anchor = scheduleAnchorDate(localDate, start, end);
    const isoDate = localDateKey(anchor);
    if (rule.startDate && isoDate < rule.startDate) return false;
    if (rule.endDate && isoDate > rule.endDate) return false;
    if (rule.weekdays.length && !rule.weekdays.includes(anchor.getDay())) return false;
    if (start === null && end === null) return true;
    if (start !== null && end === null) return current >= start;
    if (start === null && end !== null) return current < end;
    return start < end ? current >= start && current < end : current >= start || current < end;
  }

  function getActiveScheduleValues(date) {
    const matches = state.schedules.filter((rule) => scheduleMatches(rule, date)).sort((left, right) => right.priority - left.priority || left.id.localeCompare(right.id));
    const values = {};
    matches.forEach((rule) => {
      if (!hasOwn(values, rule.setting)) values[rule.setting] = { value: rule.value, ruleId: rule.id, label: rule.label };
    });
    return values;
  }

  function normalizeLoopbackEndpoint(value) {
    try {
      const url = new URL(String(value || ""));
      const host = url.hostname.toLowerCase();
      if (!["http:", "https:"].includes(url.protocol) || !["127.0.0.1", "localhost", "[::1]", "::1"].includes(host)) return null;
      return url.origin;
    } catch (_) {
      return null;
    }
  }

  function prepareOllamaOperation(input) {
    const raw = isPlainObject(input) && !hasUnsafeKeys(input) ? input : {};
    if (raw.confirmed !== true) return { ok: false, error: "A user must explicitly start a local endpoint operation before any host call is prepared." };
    const endpoint = normalizeLoopbackEndpoint(raw.endpoint || state.ollama.endpoint);
    const action = enumValue(raw.action, ["health", "version", "models", "tags", "pull", "delete", "copy", "generate", "chat"], null);
    if (!endpoint || !action) return { ok: false, error: "Only a valid loopback endpoint and supported operation can be prepared." };
    const operation = { id: `ollama-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, action, endpoint, createdAt: now() };
    state.ollama.endpoint = endpoint;
    state.ollama.status = "pending";
    state.ollama.pendingOperation = operation;
    writeAudit("Local Ollama operation prepared", action, "No network request was made by the contract layer.");
    persist({ type: "ollama" });
    return { ok: true, operation: clone(operation) };
  }

  function handOffOllamaOperation(hostExecutor) {
    const operation = state.ollama.pendingOperation;
    if (!operation) return Promise.resolve({ ok: false, error: "No confirmed local endpoint operation is waiting for a host." });
    if (typeof hostExecutor !== "function") return Promise.resolve({ ok: false, error: "A host-owned local endpoint executor is required." });
    return Promise.resolve().then(() => hostExecutor(clone(operation))).then((result) => {
      const safeResult = isPlainObject(result) && !hasUnsafeKeys(result) ? result : {};
      state.ollama.status = enumValue(safeResult.status, ["ready", "offline", "unhealthy"], "unhealthy");
      state.ollama.lastUpdatedAt = now();
      state.ollama.pendingOperation = null;
      writeAudit("Local Ollama operation completed", operation.action, "The host returned a bounded status result.");
      persist({ type: "ollama" });
      return { ok: true, status: state.ollama.status, message: boundedText(safeResult.message, 600, "") };
    }).catch(() => {
      state.ollama.status = "unhealthy";
      state.ollama.lastUpdatedAt = now();
      state.ollama.pendingOperation = null;
      writeAudit("Local Ollama operation failed", operation.action, "The host executor did not return a usable result.");
      persist({ type: "ollama" });
      return { ok: false, error: "The host-owned local endpoint operation failed." };
    });
  }

  function getNarratorCapabilities() {
    const synthesis = global.speechSynthesis;
    const supported = Boolean(synthesis && typeof synthesis.getVoices === "function");
    let rawVoices = [];
    try {
      rawVoices = supported ? synthesis.getVoices() : [];
    } catch (_) {
      rawVoices = [];
    }
    const voices = Array.isArray(rawVoices) ? rawVoices.filter((voice) => voice && typeof voice.voiceURI === "string" && voice.voiceURI.trim()).map((voice) => ({ id: voice.voiceURI, name: voice.name, lang: voice.lang, localService: Boolean(voice.localService), default: Boolean(voice.default) })) : [];
    return { supported, voices };
  }

  function observeNarratorVoices(listener) {
    if (typeof listener !== "function" || !global.speechSynthesis) return function () {};
    const report = () => listener(getNarratorCapabilities());
    report();
    global.speechSynthesis.addEventListener("voiceschanged", report);
    return function () { global.speechSynthesis.removeEventListener("voiceschanged", report); };
  }

  function redactStateForExport() {
    const exported = getState();
    exported.personalVocabulary = { status: exported.personalVocabulary.status, omitted: true };
    exported.schoolModeCredential = { configured: isConfiguredSchoolModeCredential(state.schoolModeCredential), omitted: true };
    exported.locks = exported.locks.map((lock) => ({ id: lock.id, target: lock.target, label: lock.label, method: lock.method, duration: lock.duration, minutes: lock.minutes, locked: lock.locked, createdAt: lock.createdAt, updatedAt: lock.updatedAt }));
    exported.totp = exported.totp.map((entry) => ({ id: entry.id, label: entry.label, issuer: entry.issuer, account: entry.account, algorithm: entry.algorithm, digits: entry.digits, period: entry.period, enrolled: entry.enrolled, updatedAt: entry.updatedAt }));
    return exported;
  }

  function csvEscape(value) {
    const text = String(value == null ? "" : value);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function recordsToDelimited(records, delimiter) {
    const rows = Array.isArray(records) ? records : [];
    const fields = Array.from(rows.reduce((set, row) => {
      if (isPlainObject(row)) Object.keys(row).forEach((key) => set.add(key));
      return set;
    }, new Set())).slice(0, 60);
    const lines = [fields.map(csvEscape).join(delimiter)];
    rows.slice(0, LIMITS.collectionRecords).forEach((row) => lines.push(fields.map((field) => csvEscape(isPlainObject(row) ? row[field] : "")).join(delimiter)));
    return lines.join("\r\n");
  }

  function createExport(format, records) {
    const mode = enumValue(format, ["json", "jsonl", "csv", "tsv", "markdown"], "json");
    const safeRecords = Array.isArray(records) ? records.slice(0, LIMITS.collectionRecords).map((record) => isPlainObject(record) ? clone(record) : { value: String(record) }) : [redactStateForExport()];
    if (mode === "json") return { format: mode, mime: "application/json;charset=utf-8", text: JSON.stringify(safeRecords, null, 2) };
    if (mode === "jsonl") return { format: mode, mime: "application/x-ndjson;charset=utf-8", text: safeRecords.map((record) => JSON.stringify(record)).join("\n") };
    if (mode === "csv") return { format: mode, mime: "text/csv;charset=utf-8", text: recordsToDelimited(safeRecords, ",") };
    if (mode === "tsv") return { format: mode, mime: "text/tab-separated-values;charset=utf-8", text: recordsToDelimited(safeRecords, "\t") };
    return { format: mode, mime: "text/markdown;charset=utf-8", text: safeRecords.map((record) => `- ${Object.entries(record).map(([key, value]) => `**${key}:** ${String(value)}`).join(" · ")}`).join("\n") };
  }

  global.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    try {
      state = normalizeState(JSON.parse(event.newValue));
      emit({ type: "storage" });
    } catch (_) {
      // Ignore malformed state from another browser context.
    }
  });

  global.MinecraftServerStudioContract = Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    storageKey: STORAGE_KEY,
    limits: clone(LIMITS),
    languageModes: LANGUAGE_MODES.slice(),
    getState,
    getEffectiveSettings,
    subscribe,
    isStorageAvailable: () => storageAvailable,
    updateSettings,
    setSchoolMode,
    setSchoolModeCredential,
    getSchoolModeCredentialState,
    getSchoolModeCredentialSalt,
    verifySchoolModeCredential,
    clearSchoolModeCredential,
    getSchoolModeResetBoundary,
    resetLocalState,
    notify,
    dismissNotification,
    clearNotifications,
    recordAudit,
    getStatusModel,
    updateStatusModel,
    upsertStatusEvidence,
    getCompletenessInventory,
    setCompletenessInventory,
    upsertCompletenessSurface,
    getCompletenessSummary,
    registerCommand,
    unregisterCommand,
    getCommand,
    searchCommandPalette,
    setTeleportHandler,
    teleportTo,
    evaluateRegex,
    registerTab,
    createTabGroup,
    updateTab,
    moveTab,
    setActiveTab,
    setTabDock,
    setTabAppearance,
    closeTab,
    getAccessibleTabs,
    saveCollection,
    getCollection,
    selectCollectionRecords,
    previewBulkAction,
    beginDestructiveAction,
    advanceDestructiveAction,
    loadPersonalVocabulary,
    clearPersonalVocabulary,
    applyPersonalVocabulary,
    getFileAdapters,
    getFileAdapterAvailability,
    getBrowserConversionJobs,
    recordBrowserConversionJob,
    updateBrowserConversionJob,
    removeBrowserConversionJob,
    planConversion,
    setLogoMetadata,
    createToyLock,
    resolveToyLock,
    createTotpShell,
    markTotpEnrollment,
    createSchedule,
    getSchedules,
    removeSchedule,
    getActiveScheduleValues,
    prepareOllamaOperation,
    handOffOllamaOperation,
    getNarratorCapabilities,
    observeNarratorVoices,
    createExport,
    redactStateForExport
  });
}(window));
