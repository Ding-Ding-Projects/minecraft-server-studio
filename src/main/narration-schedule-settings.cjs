'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const NARRATION_SCHEDULE_SCHEMA_VERSION = 1;
const MAX_FILE_BYTES = 128 * 1024;
const MAX_SCHEDULES = 32;
const MAX_LABEL_LENGTH = 80;
const MAX_VOICE_ID_LENGTH = 384;
const LANGUAGE_MODES = Object.freeze(['english', 'cantonese', 'bilingual']);
const NARRATOR_LANGUAGES = Object.freeze(['english', 'cantonese', 'both']);
const LOCAL_WEEKDAYS = Object.freeze([0, 1, 2, 3, 4, 5, 6]);
const SCHEDULE_SOURCE_CATALOG = Object.freeze([
  Object.freeze({
    id: 'local',
    label: 'Local schedule',
    enabled: true,
    detail: 'Runs from this app’s validated local settings only. No network request is made.'
  }),
  Object.freeze({
    id: 'https-api',
    label: 'Validated HTTPS API',
    enabled: false,
    detail: 'Disabled: this build does not include a validated main-process HTTPS schedule-source adapter.'
  }),
  Object.freeze({
    id: 'home-assistant',
    label: 'Home Assistant boolean entity',
    enabled: false,
    detail: 'Disabled: this build does not include a validated Home Assistant adapter or protected token route.'
  })
]);

function settingsError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function isPlainRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function assertExactKeys(value, keys, message) {
  if (!isPlainRecord(value)) throw settingsError('NARRATION_SCHEDULE_INVALID_RECORD', message);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw settingsError('NARRATION_SCHEDULE_INVALID_RECORD', message);
  }
}

function normalizeDirectory(value) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) throw settingsError('NARRATION_SCHEDULE_INVALID_OPTIONS', 'Narration and schedule settings need an absolute application-data directory.');
  return path.normalize(value);
}

function normalizeBoolean(value, label) {
  if (typeof value !== 'boolean') throw settingsError('NARRATION_SCHEDULE_INVALID_VALUE', `${label} must be on or off.`);
  return value;
}

function normalizeText(value, fallback, maximum, label) {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'string') throw settingsError('NARRATION_SCHEDULE_INVALID_VALUE', `${label} must be text.`);
  const normalized = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!normalized) throw settingsError('NARRATION_SCHEDULE_INVALID_VALUE', `${label} cannot be empty.`);
  if (normalized.length > maximum) throw settingsError('NARRATION_SCHEDULE_INVALID_VALUE', `${label} must be ${maximum} characters or fewer.`);
  return normalized;
}

function normalizeLanguage(value, label = 'Language') {
  if (!LANGUAGE_MODES.includes(value)) throw settingsError('NARRATION_SCHEDULE_INVALID_VALUE', `${label} must be English, Cantonese, or bilingual.`);
  return value;
}

function normalizeNarratorLanguage(value) {
  if (!NARRATOR_LANGUAGES.includes(value)) throw settingsError('NARRATION_SCHEDULE_INVALID_VALUE', 'Narrator language must be English, Cantonese, or both.');
  return value;
}

function normalizeVoiceId(value, label) {
  if (value === 'automatic') return value;
  if (typeof value !== 'string') throw settingsError('NARRATION_SCHEDULE_INVALID_VALUE', `${label} must be a voice identity or automatic.`);
  const normalized = value.trim();
  if (!normalized || normalized.length > MAX_VOICE_ID_LENGTH || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw settingsError('NARRATION_SCHEDULE_INVALID_VALUE', `${label} is invalid.`);
  }
  return normalized;
}

function normalizeNumber(value, minimum, maximum, fallback, label) {
  if (value === undefined || value === null || value === '') return fallback;
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) {
    throw settingsError('NARRATION_SCHEDULE_INVALID_VALUE', `${label} must be between ${minimum} and ${maximum}.`);
  }
  return Math.round(number * 100) / 100;
}

function normalizePriority(value) {
  if (!Number.isInteger(value) || value < 0 || value > 999) throw settingsError('NARRATION_SCHEDULE_INVALID_VALUE', 'Schedule priority must be a whole number from 0 through 999.');
  return value;
}

function normalizeDate(value, label) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw settingsError('NARRATION_SCHEDULE_INVALID_VALUE', `${label} must use YYYY-MM-DD.`);
  const [year, month, day] = value.split('-').map(Number);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (candidate.getUTCFullYear() !== year || candidate.getUTCMonth() !== month - 1 || candidate.getUTCDate() !== day) {
    throw settingsError('NARRATION_SCHEDULE_INVALID_VALUE', `${label} is not a calendar date.`);
  }
  return value;
}

function normalizeTime(value, label) {
  if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value)) throw settingsError('NARRATION_SCHEDULE_INVALID_VALUE', `${label} must use 24-hour HH:MM.`);
  const [hour, minute] = value.split(':').map(Number);
  if (hour > 23 || minute > 59) throw settingsError('NARRATION_SCHEDULE_INVALID_VALUE', `${label} is outside a 24-hour local time.`);
  return value;
}

function minutesFor(time) {
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
}

function normalizeWeekdays(value) {
  if (!Array.isArray(value)) throw settingsError('NARRATION_SCHEDULE_INVALID_VALUE', 'Schedule weekdays must be an array.');
  const values = [...new Set(value)];
  if (!values.length || values.length > LOCAL_WEEKDAYS.length || values.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
    throw settingsError('NARRATION_SCHEDULE_INVALID_VALUE', 'Schedule weekdays must contain one or more local weekday numbers from 0 through 6.');
  }
  return values.sort((left, right) => left - right);
}

function normalizeScheduleId(value, fallback) {
  if (value === undefined && fallback) return fallback;
  if (typeof value !== 'string') throw settingsError('NARRATION_SCHEDULE_INVALID_VALUE', 'Schedule identifier is invalid.');
  const normalized = value.trim().toLowerCase();
  if (!/^schedule-[a-f0-9-]{8,96}$/.test(normalized)) throw settingsError('NARRATION_SCHEDULE_INVALID_VALUE', 'Schedule identifier is invalid.');
  return normalized;
}

function normalizeNarrator(value) {
  assertExactKeys(value, ['enabled', 'language', 'voices', 'rates', 'pitches'], 'Narrator settings are invalid.');
  assertExactKeys(value.voices, ['english', 'cantonese'], 'Narrator voice selections are invalid.');
  assertExactKeys(value.rates, ['english', 'cantonese'], 'Narrator speech rates are invalid.');
  assertExactKeys(value.pitches, ['english', 'cantonese'], 'Narrator speech pitches are invalid.');
  return {
    enabled: normalizeBoolean(value.enabled, 'Narrator'),
    language: normalizeNarratorLanguage(value.language),
    voices: {
      english: normalizeVoiceId(value.voices.english, 'English narrator voice'),
      cantonese: normalizeVoiceId(value.voices.cantonese, 'Cantonese narrator voice')
    },
    rates: {
      english: normalizeNumber(value.rates.english, 0.5, 2, 1, 'English narrator rate'),
      cantonese: normalizeNumber(value.rates.cantonese, 0.5, 2, 1, 'Cantonese narrator rate')
    },
    pitches: {
      english: normalizeNumber(value.pitches.english, 0, 2, 1, 'English narrator pitch'),
      cantonese: normalizeNumber(value.pitches.cantonese, 0, 2, 1, 'Cantonese narrator pitch')
    }
  };
}

function normalizeSchedule(value) {
  assertExactKeys(value, ['id', 'label', 'enabled', 'priority', 'value', 'window', 'source'], 'Scheduled setting is invalid.');
  assertExactKeys(value.value, ['language'], 'Scheduled setting value is invalid.');
  assertExactKeys(value.window, ['dateStart', 'dateEnd', 'startTime', 'endTime', 'weekdays'], 'Scheduled setting window is invalid.');
  assertExactKeys(value.source, ['type'], 'Scheduled setting source is invalid.');
  if (value.source.type !== 'local') throw settingsError('NARRATION_SCHEDULE_UNSUPPORTED_SOURCE', 'Only the local scheduled-settings source is available in this build.');
  const dateStart = normalizeDate(value.window.dateStart, 'Schedule start date');
  const dateEnd = normalizeDate(value.window.dateEnd, 'Schedule end date');
  if (dateStart && dateEnd && dateStart > dateEnd) throw settingsError('NARRATION_SCHEDULE_INVALID_VALUE', 'Schedule end date must be on or after its start date.');
  const startTime = normalizeTime(value.window.startTime, 'Schedule start time');
  const endTime = normalizeTime(value.window.endTime, 'Schedule end time');
  if (minutesFor(startTime) === minutesFor(endTime)) throw settingsError('NARRATION_SCHEDULE_INVALID_VALUE', 'Schedule start and end times cannot be equal because all-day windows are not implicit.');
  return {
    id: normalizeScheduleId(value.id),
    label: normalizeText(value.label, 'Scheduled language', MAX_LABEL_LENGTH, 'Schedule label'),
    enabled: normalizeBoolean(value.enabled, 'Schedule'),
    priority: normalizePriority(value.priority),
    value: { language: normalizeLanguage(value.value.language, 'Scheduled language') },
    window: {
      dateStart,
      dateEnd,
      startTime,
      endTime,
      weekdays: normalizeWeekdays(value.window.weekdays)
    },
    source: { type: 'local' }
  };
}

function defaultNarrator() {
  return {
    enabled: false,
    language: 'english',
    voices: { english: 'automatic', cantonese: 'automatic' },
    rates: { english: 1, cantonese: 1 },
    pitches: { english: 1, cantonese: 1 }
  };
}

function defaultSettings() {
  return {
    version: NARRATION_SCHEDULE_SCHEMA_VERSION,
    narrator: defaultNarrator(),
    schedules: []
  };
}

function normalizeSettings(value) {
  assertExactKeys(value, ['version', 'narrator', 'schedules'], 'Narration and scheduled settings are invalid.');
  if (value.version !== NARRATION_SCHEDULE_SCHEMA_VERSION) throw settingsError('NARRATION_SCHEDULE_UNSUPPORTED_VERSION', 'Narration and scheduled settings use an unsupported version.');
  if (!Array.isArray(value.schedules) || value.schedules.length > MAX_SCHEDULES) throw settingsError('NARRATION_SCHEDULE_INVALID_RECORD', `No more than ${MAX_SCHEDULES} scheduled settings are supported.`);
  const schedules = value.schedules.map(normalizeSchedule);
  const ids = new Set();
  for (const schedule of schedules) {
    if (ids.has(schedule.id)) throw settingsError('NARRATION_SCHEDULE_INVALID_RECORD', 'Scheduled setting identifiers must be unique.');
    ids.add(schedule.id);
  }
  return {
    version: NARRATION_SCHEDULE_SCHEMA_VERSION,
    narrator: normalizeNarrator(value.narrator),
    schedules
  };
}

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

function localCalendar(now) {
  const value = now instanceof Date && Number.isFinite(now.getTime()) ? now : new Date();
  const date = `${value.getFullYear().toString().padStart(4, '0')}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  return {
    value,
    date,
    weekday: value.getDay(),
    minute: value.getHours() * 60 + value.getMinutes(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'local'
  };
}

function priorCalendarDay(calendar) {
  const previous = new Date(calendar.value.getFullYear(), calendar.value.getMonth(), calendar.value.getDate() - 1, 12, 0, 0, 0);
  return localCalendar(previous);
}

function ruleMatches(schedule, calendar) {
  if (!schedule.enabled || schedule.source?.type !== 'local') return false;
  const start = minutesFor(schedule.window.startTime);
  const end = minutesFor(schedule.window.endTime);
  let owner = calendar;
  if (start < end) {
    if (calendar.minute < start || calendar.minute >= end) return false;
  } else if (calendar.minute >= start) {
    owner = calendar;
  } else if (calendar.minute < end) {
    owner = priorCalendarDay(calendar);
  } else {
    return false;
  }
  if (!schedule.window.weekdays.includes(owner.weekday)) return false;
  if (schedule.window.dateStart && owner.date < schedule.window.dateStart) return false;
  if (schedule.window.dateEnd && owner.date > schedule.window.dateEnd) return false;
  return true;
}

function resolveScheduledLanguage(schedules, baseLanguage, now = new Date()) {
  const calendar = localCalendar(now);
  const matching = schedules.filter((schedule) => ruleMatches(schedule, calendar))
    .sort((left, right) => {
      if (right.priority !== left.priority) return right.priority - left.priority;
      return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
    });
  const winner = matching[0] || null;
  return {
    language: winner ? winner.value.language : normalizeLanguage(baseLanguage, 'Base language'),
    source: winner ? 'local-schedule' : 'local-base',
    scheduleId: winner?.id || null,
    scheduleLabel: winner?.label || null,
    evaluatedAt: calendar.value.toISOString(),
    timezone: calendar.timezone
  };
}

class NarrationScheduleSettingsService {
  constructor(options = {}) {
    if (!isPlainRecord(options)) throw settingsError('NARRATION_SCHEDULE_INVALID_OPTIONS', 'Narration and schedule options are invalid.');
    const allowed = new Set(['dataDir', 'onChange']);
    for (const key of Object.keys(options)) {
      if (!allowed.has(key)) throw settingsError('NARRATION_SCHEDULE_INVALID_OPTIONS', 'Narration and schedule options are invalid.');
    }
    this.dataDir = normalizeDirectory(options.dataDir);
    this.filePath = path.join(this.dataDir, 'narration-schedule-settings.json');
    this.onChange = typeof options.onChange === 'function' ? options.onChange : null;
    this.settings = defaultSettings();
    this.state = 'not-loaded';
    this.detail = 'Narration and scheduled settings have not been loaded.';
  }

  initialize() {
    const result = this._read();
    if (result.state === 'ready') {
      this.settings = result.value;
      this.state = 'ready';
      this.detail = 'Narrator and local language schedules are available.';
      return this.snapshot();
    }
    this.settings = defaultSettings();
    this.state = result.state;
    this.detail = result.state === 'missing'
      ? 'Narrator and scheduled settings are not stored yet. Defaults remain active until the first save.'
      : result.state === 'invalid'
        ? 'Narrator and scheduled settings are invalid. The narrator stays off and local base language remains active.'
        : 'Narrator and scheduled settings cannot be read. The narrator stays off and local base language remains active.';
    if (result.state === 'missing') {
      try {
        this._write(this.settings);
        this.state = 'ready';
        this.detail = 'Narrator and local language schedules are available.';
      } catch {
        this.state = 'unavailable';
        this.detail = 'Narrator and scheduled settings could not be created. The narrator stays off and local base language remains active.';
      }
    }
    return this.snapshot();
  }

  snapshot(options = {}) {
    const source = isPlainRecord(options) ? options : {};
    const baseLanguage = LANGUAGE_MODES.includes(source.baseLanguage) ? source.baseLanguage : 'english';
    const active = this.state === 'ready' ? this.settings : defaultSettings();
    const effective = resolveScheduledLanguage(active.schedules, baseLanguage, source.now instanceof Date ? source.now : new Date());
    return Object.freeze({
      schemaVersion: NARRATION_SCHEDULE_SCHEMA_VERSION,
      state: this.state,
      detail: this.detail,
      narrator: Object.freeze(copy(active.narrator)),
      schedules: Object.freeze(copy(active.schedules)),
      scheduleSources: Object.freeze(copy(SCHEDULE_SOURCE_CATALOG)),
      effective: Object.freeze(effective),
      boundary: 'Only validated local language schedules are active in this build. HTTPS API and Home Assistant options remain visible but disabled; no schedule-source network request is made.'
    });
  }

  updateNarrator(patch) {
    this._assertReady();
    if (!isPlainRecord(patch)) throw settingsError('NARRATION_SCHEDULE_INVALID_PATCH', 'Narrator changes are invalid.');
    const allowed = new Set(['enabled', 'language', 'voices', 'rates', 'pitches']);
    for (const key of Object.keys(patch)) {
      if (!allowed.has(key)) throw settingsError('NARRATION_SCHEDULE_INVALID_PATCH', 'Narrator changes contain an unsupported field.');
    }
    const narrator = normalizeNarrator({
      ...this.settings.narrator,
      ...patch,
      voices: patch.voices === undefined ? this.settings.narrator.voices : patch.voices,
      rates: patch.rates === undefined ? this.settings.narrator.rates : patch.rates,
      pitches: patch.pitches === undefined ? this.settings.narrator.pitches : patch.pitches
    });
    this._save({ ...this.settings, narrator });
    return this.snapshot();
  }

  addSchedule(draft) {
    this._assertReady();
    if (!isPlainRecord(draft)) throw settingsError('NARRATION_SCHEDULE_INVALID_PATCH', 'Scheduled setting is invalid.');
    const allowed = new Set(['label', 'enabled', 'priority', 'value', 'window']);
    for (const key of Object.keys(draft)) {
      if (!allowed.has(key)) throw settingsError('NARRATION_SCHEDULE_INVALID_PATCH', 'Scheduled setting contains an unsupported field.');
    }
    if (this.settings.schedules.length >= MAX_SCHEDULES) throw settingsError('NARRATION_SCHEDULE_LIMIT', `No more than ${MAX_SCHEDULES} scheduled settings can be stored.`);
    const schedule = normalizeSchedule({
      id: this._nextScheduleId(),
      label: draft.label,
      enabled: draft.enabled,
      priority: draft.priority,
      value: draft.value,
      window: draft.window,
      source: { type: 'local' }
    });
    this._save({ ...this.settings, schedules: [...this.settings.schedules, schedule] });
    return this.snapshot();
  }

  setScheduleEnabled(id, enabled) {
    this._assertReady();
    const normalizedId = normalizeScheduleId(id);
    const next = this.settings.schedules.map((schedule) => schedule.id === normalizedId ? { ...schedule, enabled: normalizeBoolean(enabled, 'Schedule') } : schedule);
    if (next.every((schedule) => schedule.id !== normalizedId)) throw settingsError('NARRATION_SCHEDULE_NOT_FOUND', 'The scheduled setting no longer exists.');
    this._save({ ...this.settings, schedules: next });
    return this.snapshot();
  }

  _nextScheduleId() {
    let id;
    do {
      const entropy = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
      id = `schedule-${entropy.toLowerCase()}`;
    } while (this.settings.schedules.some((schedule) => schedule.id === id));
    return id;
  }

  _assertReady() {
    if (this.state !== 'ready') throw settingsError('NARRATION_SCHEDULE_UNAVAILABLE', 'Narrator and scheduled settings are unavailable. Repair local application-data access before changing them.');
  }

  _save(next) {
    const normalized = normalizeSettings(next);
    this._write(normalized);
    this.settings = normalized;
    this.state = 'ready';
    this.detail = 'Narrator and local language schedules are available.';
    if (this.onChange) this.onChange(this.snapshot());
  }

  _read() {
    let text;
    try {
      const stat = fs.statSync(this.filePath);
      if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_FILE_BYTES) return { state: 'invalid' };
      text = fs.readFileSync(this.filePath, 'utf8');
    } catch (error) {
      if (error?.code === 'ENOENT') return { state: 'missing' };
      return { state: 'unavailable' };
    }
    try {
      return { state: 'ready', value: normalizeSettings(JSON.parse(text)) };
    } catch {
      return { state: 'invalid' };
    }
  }

  _write(value) {
    try {
      fs.mkdirSync(this.dataDir, { recursive: true, mode: 0o700 });
      const temporary = `${this.filePath}.${process.pid}.${crypto.randomBytes(8).toString('hex')}.tmp`;
      const descriptor = fs.openSync(temporary, 'wx', 0o600);
      try {
        fs.writeFileSync(descriptor, JSON.stringify(value, null, 2), 'utf8');
        fs.fsyncSync(descriptor);
      } finally {
        fs.closeSync(descriptor);
      }
      fs.renameSync(temporary, this.filePath);
    } catch {
      throw settingsError('NARRATION_SCHEDULE_WRITE_FAILED', 'Narrator and scheduled settings could not be saved.');
    }
  }
}

module.exports = {
  LANGUAGE_MODES,
  LOCAL_WEEKDAYS,
  MAX_SCHEDULES,
  NARRATION_SCHEDULE_SCHEMA_VERSION,
  NARRATOR_LANGUAGES,
  NarrationScheduleSettingsService,
  SCHEDULE_SOURCE_CATALOG,
  defaultNarrator,
  defaultSettings,
  normalizeSchedule,
  resolveScheduledLanguage
};
