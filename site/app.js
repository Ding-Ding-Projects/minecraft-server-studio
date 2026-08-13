import { validatePersonalVocabularyPayload } from "./vocabulary-loader.js";
import { initializeAuthenticatorAndToyLocks } from "./authenticator-locks.js";

(function () {
  "use strict";

  /*
   * Browser-local marketing interactions plus two narrow exceptions: one
   * visitor-triggered fixed-loopback Ollama observer and explicitly selected,
   * bounded browser-local file conversions. No server control, installer action,
   * proxy, cloud fallback, model mutation, chat, upload, or remote conversion
   * occurs here. The converter never persists source/output bytes or learns a
   * browser download destination. The dedicated authenticator module owns its
   * separate bounded browser-local credential record and does not expose it to
   * this general page export or history model. A user-selected personal-
   * vocabulary JSON file is also read locally only so the contract can validate
   * and store its bounded payload in this browser's local storage.
   */

  var root = document.documentElement;
  var body = document.body;
  var main = document.getElementById("main-content") || document.querySelector("main");
  var contract = window.MinecraftServerStudioContract || null;
  var dialog = null;
  var tabWorkspace = null;
  var generated = "data-mss-generated";
  var originals = new Map();
  var state = {
    notifications: [],
    history: [],
    schedules: [],
    baseSettings: defaultSettings(),
    settings: defaultSettings(),
    narratorCapabilities: { supported: false, voices: [] },
    logo: defaultLogo()
  };
  var narratorRuntime = {
    queue: [],
    speaking: false,
    lastByCategory: Object.create(null),
    pendingQueue: null,
    pendingTimer: null,
    voiceUnsubscribe: null,
    scheduleTimer: null,
    scheduleSignature: ""
  };

  var LOCALIZED_COPY = Object.freeze({
    "settings-eyebrow": { english: "Settings and appearance", cantonese: "設定與外觀" },
    "settings-title": { english: "Personalize this public page", cantonese: "自訂呢個公開頁面" },
    "settings-status": { english: "Browser-local preferences", cantonese: "瀏覽器本機設定" },
    "settings-description": { english: "These visible controls persist bounded preferences for this public page in this browser only. They are not sent to a server or desktop application, and they do not change an installed app.", cantonese: "呢啲控制只會喺而家瀏覽器儲存呢個公開頁面嘅受限設定。佢哋唔會傳送去伺服器或者桌面程式，亦唔會改變已安裝程式。" },
    "language-label": { english: "Language mode", cantonese: "語言模式" },
    "language-help": { english: "Choose how this public page presents its browser-local controls.", cantonese: "揀選呢個公開頁面點樣顯示佢嘅瀏覽器本機控制。" },
    "english-funny-label": { english: "English tone", cantonese: "英文語氣" },
    "english-funny-help": { english: "1 is fully serious; 5 is maximum playfulness. Warnings stay factual at every level.", cantonese: "1 最認真，5 最玩味；無論邊個級別，警告內容都保持準確。" },
    "cantonese-funny-label": { english: "Cantonese tone", cantonese: "廣東話語氣" },
    "cantonese-funny-help": { english: "This independent setting changes Cantonese presentation only.", cantonese: "呢個獨立設定只會改變廣東話嘅呈現方式。" },
    "emoji-label": { english: "Show emojis in browser-local notices", cantonese: "喺瀏覽器本機通知顯示表情符號" },
    "emoji-help": { english: "Emojis decorate notices only; labels, actions, and factual messages stay unchanged.", cantonese: "表情符號只作裝飾；標籤、動作同事實訊息都唔會改變。" },
    "vocabulary-label": { english: "Personal vocabulary JSON", cantonese: "個人詞彙 JSON" },
    "vocabulary-help": { english: "Version 1 JSON is checked locally before a bounded cache can be applied. The source file name and path are not retained.", cantonese: "版本 1 JSON 會先喺本機檢查，通過後先會套用受限快取。來源檔名同路徑唔會保留。" },
    "school-eyebrow": { english: "Browser-local presentation lock", cantonese: "瀏覽器本機顯示鎖" },
    "school-name-label": { english: "Mode name", cantonese: "模式名稱" },
    "school-name-help": { english: "This exact name replaces the shipped name after you save it.", cantonese: "儲存後，呢個名稱會取代原本嘅模式名稱。" },
    "school-credential-label": { english: "Browser-local unlock code", cantonese: "瀏覽器本機解鎖碼" },
    "school-credential-help": { english: "A one-way local verifier is stored only in this browser. The code itself is never stored or exported.", cantonese: "只會喺呢個瀏覽器儲存單向本機驗證資料；解鎖碼本身永遠唔會儲存或匯出。" },
    "logo-eyebrow": { english: "Browser-local logo", cantonese: "瀏覽器本機標誌" },
    "logo-title": { english: "Choose this public page's visual mark", cantonese: "揀呢個公開頁面嘅視覺標誌" },
    "logo-description": { english: "This changes only the mark on this public page in this browser. It never changes the installed app, package, executable, installer, update feed, release, or Minecraft server.", cantonese: "呢個只會改變而家瀏覽器入面呢個公開頁面嘅標誌；唔會改已安裝程式、封裝、執行檔、安裝程式、更新來源、發佈版本或者 Minecraft 伺服器。" },
    "logo-search-label": { english: "Find a shipped logo preset", cantonese: "搵內建標誌預設" },
    "logo-custom-label": { english: "Custom PNG or JPEG", cantonese: "自訂 PNG 或 JPEG" },
    "logo-custom-help": { english: "The browser validates actual PNG or JPEG bytes locally. Source files must be 512 KiB or smaller; paths and source names are not retained.", cantonese: "瀏覽器會喺本機驗證真正嘅 PNG 或 JPEG 位元組。來源檔案必須不大於 512 KiB；路徑同來源檔名唔會保留。" },
    "logo-rendering-title": { english: "Custom-image rendering", cantonese: "自訂圖片顯示" },
    "logo-rendering-help": { english: "Available after a bounded custom image is accepted. These controls apply locally to the derived display image, not to the original file.", cantonese: "接受咗受限自訂圖片後先可以用。呢啲控制只會喺本機套用到衍生顯示圖片，唔會改原始檔案。" },
    "logo-fit-label": { english: "Fit", cantonese: "適應方式" },
    "logo-fit-contain": { english: "Contain", cantonese: "完整顯示" },
    "logo-fit-cover": { english: "Fill and crop", cantonese: "填滿並裁剪" },
    "logo-fit-fill": { english: "Stretch to bounds", cantonese: "拉伸至邊界" },
    "logo-background-label": { english: "Background", cantonese: "背景" },
    "logo-background-transparent": { english: "Transparent", cantonese: "透明" },
    "logo-background-color": { english: "Solid color", cantonese: "純色" },
    "logo-background-color-label": { english: "Background color", cantonese: "背景顏色" },
    "logo-focal-x-label": { english: "Focal point horizontally", cantonese: "水平焦點位置" },
    "logo-focal-y-label": { english: "Focal point vertically", cantonese: "垂直焦點位置" },
    "logo-reset": { english: "Reset logo", cantonese: "重設標誌" }
  });

  function funnyCopy(key, language, value) {
    var level = state.settings && state.settings.funnyLevel ? Number(state.settings.funnyLevel[language]) || 2 : 2;
    if (level < 4) return value;
    var playful = {
      english: {
        "settings-title": "Tune this public page your way — the creepers can wait.",
        "settings-description": "These browser-local controls remember this public page's bounded preferences here, not on a server or desktop app. The settings are doing their job without wandering off on an adventure."
      },
      cantonese: {
        "settings-title": "自己調校呢個公開頁面先，苦力怕等一等。",
        "settings-description": "呢啲瀏覽器本機控制只會記住本頁面嘅受限設定，唔會走去伺服器或者桌面程式搗蛋。設定做返自己份內事，唔會去冒險。"
      }
    };
    return (playful[language] && playful[language][key]) || value;
  }

  function localizedCopy(key) {
    var entry = LOCALIZED_COPY[key];
    if (!entry) return "";
    var mode = state.settings && state.settings.languageMode || "english";
    var english = funnyCopy(key, "english", entry.english);
    var cantonese = funnyCopy(key, "cantonese", entry.cantonese);
    if (mode === "cantonese") return cantonese;
    if (mode === "bilingual") return english + " · " + cantonese;
    return english;
  }

  function renderLocalizedCopy() {
    all("[data-mss-copy]").forEach(function (element) {
      var value = localizedCopy(element.getAttribute("data-mss-copy"));
      if (value) element.textContent = value;
    });
    all("[data-mss-placeholder]").forEach(function (element) {
      var value = localizedCopy(element.getAttribute("data-mss-placeholder"));
      if (value) element.placeholder = value;
    });
  }

  function defaultSettings() {
    return {
      languageMode: "english",
      funnyLevel: { english: 2, cantonese: 2 },
      showDialogEmoji: true,
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
      },
      personalVocabularyActive: false,
      dimSumEnabled: true,
      schoolMode: { enabled: false, active: false, name: "School mode" }
    };
  }

  function defaultLogo() {
    return {
      sourceType: "preset",
      presetId: "studio-aqua",
      custom: null,
      updatedAt: null
    };
  }

  function one(selector, scope) {
    return (scope || document).querySelector(selector);
  }

  function all(selector, scope) {
    return Array.prototype.slice.call((scope || document).querySelectorAll(selector));
  }

  function made(name) {
    var element = document.createElement(name);
    element.setAttribute(generated, "true");
    return element;
  }

  function safely(fn, fallback) {
    try { return fn(); } catch (_) { return fallback; }
  }

  function hasContractMethod(name) {
    return Boolean(contract && typeof contract[name] === "function");
  }

  function hydrateContractState() {
    if (!hasContractMethod("getState") || !hasContractMethod("getEffectiveSettings")) return;
    var snapshot = safely(function () { return contract.getState(); }, null);
    var settings = safely(function () { return contract.getEffectiveSettings(); }, null);
    if (!snapshot || !settings) return;
    state.baseSettings = snapshot.settings || defaultSettings();
    state.settings = settings;
    state.notifications = Array.isArray(snapshot.notifications) ? snapshot.notifications.slice() : [];
    state.history = Array.isArray(snapshot.audit) ? snapshot.audit.slice() : [];
    state.schedules = Array.isArray(snapshot.schedules) ? snapshot.schedules.slice() : [];
    state.logo = snapshot.logo && typeof snapshot.logo === "object" ? snapshot.logo : defaultLogo();
  }

  function emit(name, detail) {
    safely(function () {
      window.dispatchEvent(new CustomEvent("minecraft-server-studio:" + name, { detail: detail }));
    });
  }

  function live(message) {
    var region = one("[data-mss-live-region]");
    if (!region) {
      region = made("div");
      region.setAttribute("data-mss-live-region", "true");
      region.setAttribute("role", "status");
      region.setAttribute("aria-live", "polite");
      region.setAttribute("aria-atomic", "true");
      (body || document.documentElement).appendChild(region);
    }
    region.textContent = message;
  }

  function emoji(level) {
    if (!state.settings.showDialogEmoji) return "";
    return { info: "ℹ ", success: "✓ ", warning: "⚠ ", error: "⚠ ", progress: "◇ ", demo: "◇ " }[level] || "ℹ ";
  }

  function historyTime(entry) {
    return entry.when || entry.createdAt || new Date().toISOString();
  }

  function notificationLevel(notice) {
    return notice.level || notice.kind || "info";
  }

  function notificationMessage(notice) {
    return notice.message || notice.body || notice.title || "Browser-local notification.";
  }

  function addHistory(action, detail) {
    var entry = {
      id: "history-" + Date.now() + "-" + Math.random().toString(16).slice(2),
      action: action,
      detail: detail,
      when: new Date().toISOString()
    };
    if (hasContractMethod("recordAudit")) {
      safely(function () { contract.recordAudit(action, "marketing-preview", detail); });
      hydrateContractState();
    } else {
      state.history.unshift({ id: entry.id, action: entry.action, target: "marketing-preview", detail: entry.detail, createdAt: entry.when });
      if (state.history.length > 30) state.history.length = 30;
    }
    renderHistory();
    emit("history", entry);
  }

  function notify(level, message) {
    var notice = {
      id: "notice-" + Date.now() + "-" + Math.random().toString(16).slice(2),
      level: level,
      message: message,
      when: new Date().toISOString()
    };
    if (hasContractMethod("notify")) {
      safely(function () {
        contract.notify({
          id: notice.id,
          kind: level === "demo" ? "info" : level,
          title: "Browser-local preview",
          body: message
        });
      });
      hydrateContractState();
    } else {
      state.notifications.unshift({ id: notice.id, kind: level, title: "Browser-local preview", body: message, createdAt: notice.when, dismissed: false });
      if (state.notifications.length > 12) state.notifications.length = 12;
    }
    renderNotifications();
    renderHistory();
    live(emoji(level) + message);
    narrateNotice(level, message);
    emit("notification", notice);
  }

  function button(label, listener, labelText) {
    var element = made("button");
    element.type = "button";
    element.textContent = label;
    if (labelText) element.setAttribute("aria-label", labelText);
    element.addEventListener("click", listener);
    return element;
  }

  function focus(element) {
    if (!element) return;
    safely(function () { element.scrollIntoView({ behavior: "smooth", block: "start" }); });
    window.setTimeout(function () {
      if (!element.hasAttribute("tabindex")) element.setAttribute("tabindex", "-1");
      safely(function () { element.focus({ preventScroll: true }); });
    }, 220);
  }

  function activate(targetId, source) {
    var target = document.getElementById(targetId);
    if (!target) return;
    var isTabPanel = Boolean(tabWorkspace && typeof tabWorkspace.hasPanel === "function" && tabWorkspace.hasPanel(targetId));
    if (isTabPanel) {
      tabWorkspace.selectPanel(targetId);
      all(".feature-tab").forEach(function (tab) {
        var active = tab.getAttribute("href") === "#" + targetId;
        tab.setAttribute("aria-selected", String(active));
        tab.setAttribute("aria-current", active ? "page" : "false");
        tab.toggleAttribute("data-mss-active-tab", active);
      });
      all("[data-contract-surface]").forEach(function (surface) {
        surface.toggleAttribute("data-mss-active-surface", surface === target);
      });
    }
    focus(target);
    var heading = one("h2, h3", target);
    live("Opened " + ((source && source.textContent) || (heading && heading.textContent) || targetId).trim() + " in this browser-local preview.");
    emit("article-activated", { targetId: targetId });
  }

  function insertAfter(reference, element) {
    if (reference && reference.parentNode) reference.parentNode.insertBefore(element, reference.nextSibling);
  }

  function languageLabel(mode) {
    return { english: "English", cantonese: "Playful Hong Kong-style Cantonese", bilingual: "Bilingual" }[mode] || "English";
  }

  function languageMode(value) {
    return {
      english: "english",
      cantonese: "cantonese",
      bilingual: "bilingual",
      "English": "english",
      "Playful Hong Kong-style Cantonese": "cantonese",
      "Bilingual": "bilingual"
    }[value] || "english";
  }

  function themeLabel(theme) {
    return { system: "System default", light: "Light", dark: "Dark" }[theme] || "System default";
  }

  function themeValue(label) {
    return { system: "system", light: "light", dark: "dark", "System default": "system", Light: "light", Dark: "dark" }[label] || "system";
  }

  function safeHexColor(value, fallback) {
    var candidate = typeof value === "string" ? value.trim() : "";
    return /^#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$/.test(candidate) ? candidate.slice(0, 7).toLowerCase() : fallback;
  }

  function accentInk(value) {
    var color = safeHexColor(value, "#3f7cff");
    var red = parseInt(color.slice(1, 3), 16);
    var green = parseInt(color.slice(3, 5), 16);
    var blue = parseInt(color.slice(5, 7), 16);
    return (red * 299 + green * 587 + blue * 114) / 1000 > 158 ? "#06213b" : "#ffffff";
  }

  function fontFamily(value) {
    return {
      "system-ui": "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      "ui-sans-serif": "ui-sans-serif, system-ui, sans-serif",
      "ui-serif": "ui-serif, Georgia, serif",
      "ui-monospace": "ui-monospace, SFMono-Regular, Consolas, monospace"
    }[value] || "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  }

  function scaleLabel(value) {
    return Math.round((Number(value) || 1) * 100) + "%";
  }

  var SITE_LOGO_PRESETS = Object.freeze([
    { id: "studio-aqua", name: "Studio Aqua", description: "The shipped blue Minecraft Server Studio mark." },
    { id: "server-slate", name: "Server Slate", description: "A quieter slate mark for the companion site." },
    { id: "world-spruce", name: "World Spruce", description: "A green world-management mark for the companion site." }
  ]);
  var SITE_LOGO_INPUT_BYTES = 512 * 1024;
  var SITE_LOGO_DERIVED_CHARACTERS = 512 * 1024;
  var SITE_LOGO_MAX_DIMENSION = 512;
  var SITE_LOGO_MAX_DECODED_DIMENSION = 4096;
  var SITE_LOGO_MAX_DECODED_PIXELS = 4 * 1000 * 1000;
  var SITE_LOGO_DATA_URL = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/;

  function boundedLogoPercent(value, fallback) {
    var numeric = Number(value);
    return Number.isFinite(numeric) ? Math.max(0, Math.min(100, Math.round(numeric * 100) / 100)) : fallback;
  }

  function logoPreset(id) {
    return SITE_LOGO_PRESETS.filter(function (preset) { return preset.id === id; })[0] || SITE_LOGO_PRESETS[0];
  }

  function logoCustom(value) {
    if (!value || typeof value !== "object" || !SITE_LOGO_DATA_URL.test(value.dataUrl || "")) return null;
    var match = /^data:image\/(png|jpeg);base64,/.exec(value.dataUrl);
    if (!match || value.dataUrl.length > SITE_LOGO_DERIVED_CHARACTERS) return null;
    return {
      format: match[1],
      dataUrl: value.dataUrl,
      width: Math.max(1, Math.min(SITE_LOGO_MAX_DIMENSION, Math.round(Number(value.width) || 1))),
      height: Math.max(1, Math.min(SITE_LOGO_MAX_DIMENSION, Math.round(Number(value.height) || 1))),
      fit: ["contain", "cover", "fill"].indexOf(value.fit) >= 0 ? value.fit : "contain",
      backgroundMode: value.backgroundMode === "color" ? "color" : "transparent",
      background: safeHexColor(value.background, "#101827"),
      focalX: boundedLogoPercent(value.focalX, 50),
      focalY: boundedLogoPercent(value.focalY, 50)
    };
  }

  function effectiveLogo() {
    var selected = state.logo && typeof state.logo === "object" ? state.logo : defaultLogo();
    var schoolActive = Boolean(state.settings && state.settings.schoolMode && state.settings.schoolMode.active);
    if (schoolActive) return defaultLogo();
    var custom = selected.sourceType === "custom" ? logoCustom(selected.custom) : null;
    return custom ? {
      sourceType: "custom",
      presetId: logoPreset(selected.presetId).id,
      custom: custom,
      updatedAt: selected.updatedAt || null
    } : {
      sourceType: "preset",
      presetId: logoPreset(selected.presetId).id,
      custom: null,
      updatedAt: selected.updatedAt || null
    };
  }

  function applyLogoMark(element, logo, preview) {
    if (!element) return;
    var selected = logo || effectiveLogo();
    var preset = logoPreset(selected.presetId);
    var custom = selected.sourceType === "custom" ? logoCustom(selected.custom) : null;
    element.replaceChildren();
    element.classList.toggle("site-logo-custom", Boolean(custom));
    element.dataset.mssLogoPreset = preset.id;
    element.dataset.mssLogoSource = custom ? "custom" : "preset";
    if (custom) {
      element.style.setProperty("--mss-logo-fit", custom.fit);
      element.style.setProperty("--mss-logo-position", custom.focalX + "% " + custom.focalY + "%");
      element.style.setProperty("--mss-logo-background", custom.backgroundMode === "color" ? custom.background : "transparent");
      var image = document.createElement("img");
      image.alt = "";
      image.decoding = "async";
      image.src = custom.dataUrl;
      element.appendChild(image);
      if (preview) element.setAttribute("aria-label", "Current custom public-page logo preview");
    } else {
      element.style.removeProperty("--mss-logo-fit");
      element.style.removeProperty("--mss-logo-position");
      element.style.removeProperty("--mss-logo-background");
      element.textContent = "MS";
      if (preview) element.setAttribute("aria-label", preset.name + " public-page logo preview");
    }
  }

  function logoCustomizerElements() {
    var surface = one('[data-contract-hook="app-logo-customizer"]');
    if (!surface) return {};
    return {
      surface: surface,
      preview: one('[data-mss-logo-preview]', surface),
      previewDetail: one('[data-mss-logo-preview-detail]', surface),
      status: one('[data-mss-logo-status]', surface),
      storage: one('[data-mss-logo-storage]', surface),
      search: one('[data-mss-logo-preset-search]', surface),
      presets: one('[data-mss-logo-preset-list]', surface),
      file: one('[data-mss-logo-file]', surface),
      fit: one('[data-mss-logo-fit]', surface),
      backgroundMode: one('[data-mss-logo-background-mode]', surface),
      background: one('[data-mss-logo-background]', surface),
      focalX: one('[data-mss-logo-focal-x]', surface),
      focalXOutput: one('[data-mss-logo-focal-x-output]', surface),
      focalY: one('[data-mss-logo-focal-y]', surface),
      focalYOutput: one('[data-mss-logo-focal-y-output]', surface),
      reset: one('[data-mss-logo-reset]', surface)
    };
  }

  function logoStorageAvailable() {
    return !hasContractMethod("isStorageAvailable") || safely(function () { return contract.isStorageAvailable(); }, false);
  }

  function renderLogoCustomizer() {
    var elements = logoCustomizerElements();
    var selected = effectiveLogo();
    var stored = state.logo && state.logo.sourceType === "custom" ? logoCustom(state.logo.custom) : null;
    var schoolActive = Boolean(state.settings && state.settings.schoolMode && state.settings.schoolMode.active);
    all('[data-mss-logo-mark]').forEach(function (mark) { applyLogoMark(mark, selected, false); });
    if (!elements.surface) return;
    applyLogoMark(elements.preview, selected, true);
    var custom = selected.sourceType === "custom" ? selected.custom : null;
    if (elements.previewDetail) {
      elements.previewDetail.textContent = custom
        ? "A bounded " + custom.format.toUpperCase() + " display image is active at " + custom.width + " × " + custom.height + " logical pixels."
        : logoPreset(selected.presetId).name + " is a browser-rendered shipped preset.";
    }
    if (elements.status) {
      elements.status.textContent = schoolActive
        ? "Studio Aqua is shown while " + schoolModeName() + " is active."
        : custom ? "A bounded custom logo is active in this browser." : logoPreset(selected.presetId).name + " is active in this browser.";
    }
    if (elements.storage) {
      if (!logoStorageAvailable()) elements.storage.textContent = "Browser storage is unavailable. The visible logo can last only for this visit and was not claimed as saved.";
      else if (stored) elements.storage.textContent = "A bounded derived custom image is stored only in this browser. Source path, source name, and original bytes are not retained.";
      else elements.storage.textContent = "No custom derived image is stored in this browser.";
    }
    if (elements.file) elements.file.disabled = schoolActive;
    [elements.fit, elements.backgroundMode, elements.background, elements.focalX, elements.focalY].forEach(function (control) {
      if (control) control.disabled = !custom || schoolActive;
    });
    if (elements.fit && custom) elements.fit.value = custom.fit;
    if (elements.backgroundMode && custom) elements.backgroundMode.value = custom.backgroundMode;
    if (elements.background && custom) elements.background.value = custom.background;
    if (elements.focalX && custom) elements.focalX.value = String(custom.focalX);
    if (elements.focalY && custom) elements.focalY.value = String(custom.focalY);
    if (elements.focalXOutput) elements.focalXOutput.textContent = (custom ? custom.focalX : 50) + "%";
    if (elements.focalYOutput) elements.focalYOutput.textContent = (custom ? custom.focalY : 50) + "%";
    if (elements.reset) elements.reset.disabled = schoolActive;
    if (elements.presets) {
      all('[data-mss-logo-preset-card]', elements.presets).forEach(function (card) {
        var id = card.getAttribute('data-mss-logo-preset-card');
        var active = !custom && selected.presetId === id;
        card.toggleAttribute('data-mss-selected', active);
        var buttonElement = one('button', card);
        if (buttonElement) buttonElement.setAttribute('aria-pressed', String(active));
      });
    }
  }

  function persistLogo(next, message) {
    if (!hasContractMethod("setLogoMetadata")) {
      notify("warning", "Browser-local logo preferences are unavailable because the local contract did not load.");
      return false;
    }
    var result = safely(function () { return contract.setLogoMetadata(next); }, null);
    if (!result || result.ok !== true) {
      notify("warning", (result && result.error) || "The browser-local logo preference was not saved. The current valid mark remains active.");
      return false;
    }
    hydrateContractState();
    renderLogoCustomizer();
    renderHistory();
    if (result.persisted === false || !logoStorageAvailable()) {
      notify("warning", "The logo changed for this visit, but browser storage could not retain it. It was not claimed as saved.");
    } else if (message) {
      notify("info", message);
    }
    return true;
  }

  function pngDimensions(bytes) {
    var signature = [137, 80, 78, 71, 13, 10, 26, 10];
    if (bytes.length < 33 || signature.some(function (value, index) { return bytes[index] !== value; })) return null;
    if (String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]) !== "IHDR") return null;
    var width = ((bytes[16] << 24) >>> 0) + (bytes[17] << 16) + (bytes[18] << 8) + bytes[19];
    var height = ((bytes[20] << 24) >>> 0) + (bytes[21] << 16) + (bytes[22] << 8) + bytes[23];
    var offset = 8;
    var foundEnd = false;
    while (offset + 12 <= bytes.length) {
      var length = ((bytes[offset] << 24) >>> 0) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3];
      var end = offset + 12 + length;
      if (!Number.isSafeInteger(end) || end > bytes.length) return null;
      var kind = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
      if (kind === "acTL") return null;
      if (kind === "IEND") { foundEnd = true; break; }
      offset = end;
    }
    return foundEnd && width && height ? { format: "png", width: width, height: height } : null;
  }

  function jpegDimensions(bytes) {
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
    var offset = 2;
    while (offset + 3 < bytes.length) {
      while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
      if (offset >= bytes.length) break;
      var marker = bytes[offset++];
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker >= 0xd0 && marker <= 0xd7) continue;
      if (offset + 1 >= bytes.length) return null;
      var size = (bytes[offset] << 8) + bytes[offset + 1];
      if (size < 2 || offset + size > bytes.length) return null;
      var isSof = (marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf);
      if (isSof) {
        if (size < 8) return null;
        var height = (bytes[offset + 3] << 8) + bytes[offset + 4];
        var width = (bytes[offset + 5] << 8) + bytes[offset + 6];
        return width && height ? { format: "jpeg", width: width, height: height } : null;
      }
      offset += size;
    }
    return null;
  }

  function inspectLogoBytes(bytes) {
    return pngDimensions(bytes) || jpegDimensions(bytes);
  }

  function readLogoBytes(file) {
    if (file && typeof file.arrayBuffer === "function") return file.arrayBuffer().then(function (buffer) { return new Uint8Array(buffer); });
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error("The selected image could not be read locally.")); };
      reader.onload = function () { resolve(new Uint8Array(reader.result)); };
      reader.readAsArrayBuffer(file);
    });
  }

  function decodeLogoImage(bytes, format) {
    return new Promise(function (resolve, reject) {
      if (!window.URL || typeof window.URL.createObjectURL !== "function") {
        reject(new Error("This browser cannot decode a selected local image safely."));
        return;
      }
      var blob = new Blob([bytes], { type: "image/" + format });
      var objectUrl = window.URL.createObjectURL(blob);
      var image = new Image();
      image.decoding = "async";
      image.onload = function () {
        window.URL.revokeObjectURL(objectUrl);
        resolve(image);
      };
      image.onerror = function () {
        window.URL.revokeObjectURL(objectUrl);
        reject(new Error("The selected PNG or JPEG could not be decoded locally."));
      };
      image.src = objectUrl;
    });
  }

  function derivedLogoCanvas(image, backgroundMode, background) {
    var naturalWidth = Math.max(1, Number(image.naturalWidth) || Number(image.width) || 1);
    var naturalHeight = Math.max(1, Number(image.naturalHeight) || Number(image.height) || 1);
    var scale = Math.min(1, SITE_LOGO_MAX_DIMENSION / Math.max(naturalWidth, naturalHeight));
    var width = Math.max(1, Math.round(naturalWidth * scale));
    var height = Math.max(1, Math.round(naturalHeight * scale));
    var canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    var context = canvas.getContext("2d", { alpha: true });
    if (!context) throw new Error("This browser cannot prepare a bounded local logo canvas.");
    if (backgroundMode === "color") {
      context.fillStyle = safeHexColor(background, "#101827");
      context.fillRect(0, 0, width, height);
    }
    context.drawImage(image, 0, 0, width, height);
    return { canvas: canvas, context: context, width: width, height: height };
  }

  function canvasHasTransparency(canvas, context) {
    var pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    for (var index = 3; index < pixels.length; index += 4) {
      if (pixels[index] !== 255) return true;
    }
    return false;
  }

  function boundedDataUrl(canvas, format) {
    if (format === "png") {
      var png = canvas.toDataURL("image/png");
      if (png.length <= SITE_LOGO_DERIVED_CHARACTERS) return { format: "png", dataUrl: png };
      throw new Error("The transparent derived image exceeded this browser-local storage limit. Choose a smaller or simpler image, or select a solid background before trying again.");
    }
    var jpegResult = null;
    [0.88, 0.78, 0.68, 0.58].some(function (quality) {
      var candidate = canvas.toDataURL("image/jpeg", quality);
      if (candidate.length <= SITE_LOGO_DERIVED_CHARACTERS) {
        jpegResult = { format: "jpeg", dataUrl: candidate };
        return true;
      }
      return false;
    });
    if (jpegResult) return jpegResult;
    throw new Error("The compact derived JPEG exceeded this browser-local storage limit. Choose a smaller or simpler image.");
  }

  function deriveLogoDisplay(image, inspected, presentation) {
    var canvasState = derivedLogoCanvas(image, presentation.backgroundMode, presentation.background);
    var hasAlpha = inspected.format === "png" && canvasHasTransparency(canvasState.canvas, canvasState.context);
    var encoded = boundedDataUrl(canvasState.canvas, hasAlpha && presentation.backgroundMode === "transparent" ? "png" : "jpeg");
    return {
      format: encoded.format,
      dataUrl: encoded.dataUrl,
      width: canvasState.width,
      height: canvasState.height,
      fit: presentation.fit,
      backgroundMode: presentation.backgroundMode,
      background: presentation.background,
      focalX: presentation.focalX,
      focalY: presentation.focalY
    };
  }

  function currentLogoPresentation(elements) {
    var custom = logoCustom(state.logo && state.logo.custom) || {};
    return {
      fit: elements.fit && ["contain", "cover", "fill"].indexOf(elements.fit.value) >= 0 ? elements.fit.value : (custom.fit || "contain"),
      backgroundMode: elements.backgroundMode && elements.backgroundMode.value === "color" ? "color" : (custom.backgroundMode || "transparent"),
      background: elements.background ? safeHexColor(elements.background.value, custom.background || "#101827") : (custom.background || "#101827"),
      focalX: boundedLogoPercent(elements.focalX && elements.focalX.value, custom.focalX === undefined ? 50 : custom.focalX),
      focalY: boundedLogoPercent(elements.focalY && elements.focalY.value, custom.focalY === undefined ? 50 : custom.focalY)
    };
  }

  async function loadCustomLogo(file, elements) {
    if (!file || !elements || Boolean(state.settings && state.settings.schoolMode && state.settings.schoolMode.active)) return;
    if (!Number.isFinite(file.size) || file.size < 1 || file.size > SITE_LOGO_INPUT_BYTES) {
      if (elements.file) elements.file.value = "";
      notify("warning", "The selected image was not applied. Choose a PNG or JPEG no larger than 512 KiB.");
      return;
    }
    if (elements.file) elements.file.disabled = true;
    if (elements.status) elements.status.textContent = "Checking selected image bytes locally…";
    try {
      var bytes = await readLogoBytes(file);
      if (bytes.byteLength !== file.size || bytes.byteLength > SITE_LOGO_INPUT_BYTES) throw new Error("The selected image exceeded the browser-local input limit.");
      var inspected = inspectLogoBytes(bytes);
      if (!inspected) throw new Error("The selected file is not a complete supported PNG or JPEG based on its actual bytes.");
      if (inspected.width > SITE_LOGO_MAX_DECODED_DIMENSION || inspected.height > SITE_LOGO_MAX_DECODED_DIMENSION || inspected.width * inspected.height > SITE_LOGO_MAX_DECODED_PIXELS) {
        throw new Error("The selected image exceeds the browser-local dimension or pixel boundary.");
      }
      var image = await decodeLogoImage(bytes, inspected.format);
      if (image.naturalWidth !== inspected.width || image.naturalHeight !== inspected.height) throw new Error("The decoded image dimensions did not match the validated image header.");
      var presentation = currentLogoPresentation(elements);
      var custom = deriveLogoDisplay(image, inspected, presentation);
      if (!persistLogo({ sourceType: "custom", presetId: logoPreset(state.logo && state.logo.presetId).id, custom: custom }, "A bounded local logo preview is active. The original file, its name, and its path were not retained.")) {
        return;
      }
    } catch (error) {
      if (elements.file) elements.file.value = "";
      if (elements.status) elements.status.textContent = "The selected image was not applied.";
      notify("warning", (error && error.message) || "The selected image could not be validated locally. The current valid logo remains active.");
    } finally {
      renderLogoCustomizer();
    }
  }

  function installLogoCustomization() {
    var elements = logoCustomizerElements();
    if (!elements.surface || elements.surface.getAttribute("data-mss-logo-ready") === "true") return;
    elements.surface.setAttribute("data-mss-logo-ready", "true");
    if (elements.presets) {
      SITE_LOGO_PRESETS.forEach(function (preset) {
        var card = made("article");
        card.className = "site-logo-preset";
        card.setAttribute("data-mss-logo-preset-card", preset.id);
        card.setAttribute("role", "listitem");
        var mark = made("span");
        mark.className = "site-logo-preset-mark";
        mark.setAttribute("data-mss-logo-preset", preset.id);
        mark.setAttribute("aria-hidden", "true");
        mark.textContent = "MS";
        var copy = made("span");
        var title = made("strong");
        title.textContent = preset.name;
        var description = made("small");
        description.textContent = preset.description;
        copy.append(title, description);
        var choose = button("Use " + preset.name, function () {
          persistLogo({ sourceType: "preset", presetId: preset.id, custom: null }, preset.name + " is now the browser-local page mark. Any derived custom image was removed from this browser.");
          if (elements.file) elements.file.value = "";
        });
        choose.setAttribute("aria-pressed", "false");
        card.append(mark, copy, choose);
        elements.presets.appendChild(card);
      });
    }
    if (elements.search) {
      makeRegexBuilder(elements.search, {
        label: "shipped logo presets",
        scope: elements.surface,
        candidates: function () { return all('[data-mss-logo-preset-card]', elements.presets); }
      });
    }
    if (elements.file) elements.file.addEventListener("change", function () { loadCustomLogo(elements.file.files && elements.file.files[0], elements); });
    [elements.fit, elements.backgroundMode, elements.background, elements.focalX, elements.focalY].forEach(function (control) {
      if (!control) return;
      control.addEventListener("input", function () {
        if (control === elements.focalX && elements.focalXOutput) elements.focalXOutput.textContent = boundedLogoPercent(control.value, 50) + "%";
        if (control === elements.focalY && elements.focalYOutput) elements.focalYOutput.textContent = boundedLogoPercent(control.value, 50) + "%";
      });
      control.addEventListener("change", function () {
        var current = logoCustom(state.logo && state.logo.custom);
        if (!current) return;
        var presentation = currentLogoPresentation(elements);
        persistLogo({ sourceType: "custom", presetId: logoPreset(state.logo && state.logo.presetId).id, custom: Object.assign({}, current, presentation) }, "Custom-logo rendering was updated in this browser.");
      });
    });
    if (elements.reset) elements.reset.addEventListener("click", function () {
      persistLogo({ sourceType: "preset", presetId: "studio-aqua", custom: null }, "Studio Aqua is active again. The bounded custom display image was removed from this browser.");
      if (elements.file) elements.file.value = "";
    });
    if (hasContractMethod("registerCommand")) {
      safely(function () {
        contract.registerCommand({
          id: "destination-site-logo-customizer",
          title: "Public-page logo",
          description: "Choose a browser-local logo preset or bounded custom image.",
          group: "Browser-local settings",
          elementId: "site-logo-customizer",
          keywords: ["logo", "preset", "image", "appearance", "browser-local"]
        });
      });
    }
    renderLogoCustomizer();
  }

  function syncSettingsControls(surface) {
    var scope = surface || one('[data-contract-surface="settings"]');
    if (!scope) return;
    var settings = state.baseSettings || state.settings;
    var language = one('[data-contract-hook="language-mode"] select', scope);
    var englishTone = one('[data-contract-hook="english-funny-level"] input[type="range"]', scope);
    var cantoneseTone = one('[data-contract-hook="cantonese-funny-level"] input[type="range"]', scope);
    var theme = one('[data-contract-hook="appearance-theme"] select', scope);
    var density = one('[data-contract-hook="density"] select', scope);
    var accent = one('[data-mss-page-accent]', scope);
    var accentOutput = one('[data-mss-page-accent-value]', scope);
    var family = one('[data-mss-page-font-family]', scope);
    var scale = one('[data-mss-page-font-scale]', scope);
    var scaleOutput = one('[data-mss-page-font-scale-value]', scope);
    var weight = one('[data-mss-page-font-weight]', scope);
    var emojiToggle = one('[data-contract-hook="emoji-toggle"] input[type="checkbox"]', scope);
    if (language) language.value = settings.languageMode;
    if (englishTone) englishTone.value = String(settings.funnyLevel.english);
    if (cantoneseTone) cantoneseTone.value = String(settings.funnyLevel.cantonese);
    if (theme) theme.value = settings.appearance.theme;
    if (density) density.value = settings.appearance.density;
    if (accent) accent.value = safeHexColor(settings.appearance.accent, "#3f7cff");
    if (accentOutput) accentOutput.textContent = safeHexColor(settings.appearance.accent, "#3f7cff");
    if (family) family.value = settings.appearance.font.family;
    if (scale) scale.value = String(settings.appearance.font.scale);
    if (scaleOutput) scaleOutput.textContent = scaleLabel(settings.appearance.font.scale);
    if (weight) weight.value = String(settings.appearance.font.weight);
    if (emojiToggle) emojiToggle.checked = settings.showDialogEmoji;
    [["english-funny-level", settings.funnyLevel.english], ["cantonese-funny-level", settings.funnyLevel.cantonese]].forEach(function (item) {
      var output = one('[data-contract-hook="' + item[0] + '"] output', scope);
      if (output) output.textContent = item[1] + " of 5";
    });
  }

  function applySettingsPresentation() {
    var settings = state.settings;
    root.dataset.mssLanguageMode = settings.languageMode;
    root.dataset.mssTheme = settings.appearance.theme;
    root.dataset.mssDensity = settings.appearance.density;
    root.dataset.mssEmojis = settings.showDialogEmoji ? "on" : "off";
    root.dataset.mssSchoolMode = settings.schoolMode && settings.schoolMode.active ? "on" : "off";
    var accent = safeHexColor(settings.appearance.accent, "#3f7cff");
    root.style.setProperty("--primary", accent);
    root.style.setProperty("--accent", accent);
    root.style.setProperty("--primary-ink", accentInk(accent));
    root.style.setProperty("--mss-page-font-family", fontFamily(settings.appearance.font.family));
    root.style.setProperty("--mss-page-font-scale", String(settings.appearance.font.scale));
    root.style.setProperty("--mss-page-font-size", (16 * settings.appearance.font.scale).toFixed(2) + "px");
    root.style.setProperty("--mss-page-font-weight", String(settings.appearance.font.weight));
    root.lang = settings.languageMode === "cantonese" ? "zh-Hant" : "en";
    renderLocalizedCopy();
    renderSchoolModeControls();
    renderLogoCustomizer();
    var output = one("[data-mss-settings-status]");
    if (output) {
      var active = settings.scheduledOverrides && Object.keys(settings.scheduledOverrides).length;
      output.textContent = "Browser-local preferences are stored in this browser's local storage: " + languageLabel(settings.languageMode) + ", " + themeLabel(settings.appearance.theme) + " theme, " + settings.appearance.density + " density." + (active ? " A local schedule is active for " + Object.keys(settings.scheduledOverrides).join(", ") + "." : "") + (settings.schedulePresentationSuppressed ? " Active local schedules are paused while " + schoolModeName() + " is enabled." : "") + " Nothing is sent to a server or desktop application.";
    }
    renderAppearanceEditor();
    if (tabWorkspace && typeof tabWorkspace.render === "function") tabWorkspace.render();
    emit("settings-changed", settings);
  }

  function updateSettings(patch, target, message) {
    if (!hasContractMethod("updateSettings")) {
      notify("warning", "Browser-local settings are unavailable because the local contract did not load.");
      return;
    }
    var result = safely(function () { return contract.updateSettings(patch, target); }, null);
    if (!result || result.ok !== true) {
      notify("warning", (result && result.error) || "The browser-local setting was not saved.");
      return;
    }
    hydrateContractState();
    syncSettingsControls();
    applySettingsPresentation();
    syncNarratorControls();
    renderScheduleList();
    renderHistory();
    renderVocabularyStatus();
    if (message) notify("info", message);
  }

  function generatedSetting(labelText, control, hook) {
    var label = made("label");
    label.setAttribute("data-contract-hook", hook);
    var title = made("span");
    title.textContent = labelText;
    label.append(title, control);
    return label;
  }

  function installSettings() {
    var surface = one('[data-contract-surface="settings"]');
    if (!surface) return;
    var grid = one(".control-grid", surface) || surface;
    var description = one(".panel-heading + p", surface);
    if (description) description.textContent = "These visible controls persist bounded browser-local preferences through the page contract. They are not sent to a server or desktop application, and they do not change an installed app's settings.";
    var status = one("[data-mss-settings-status]", surface);
    if (!status) {
      status = made("p");
      status.setAttribute("data-mss-settings-status", "true");
      status.setAttribute("role", "status");
      insertAfter(grid, status);
    }

    var language = one('[data-contract-hook="language-mode"] select', surface);
    if (language) {
      language.addEventListener("change", function () {
        updateSettings({ languageMode: languageMode(language.value) }, "language-mode", "Language preference updated for this browser-local preview.");
      });
    }

    [
      ["english-funny-level", "english", "English tone"],
      ["cantonese-funny-level", "cantonese", "Cantonese tone"]
    ].forEach(function (definition) {
      var input = one('[data-contract-hook="' + definition[0] + '"] input[type="range"]', surface);
      if (!input) return;
      var output = one('[data-contract-hook="' + definition[0] + '"] output', surface);
      input.addEventListener("input", function () {
        if (output) output.textContent = input.value + " of 5";
      });
      input.addEventListener("change", function () {
        var patch = { funnyLevel: {} };
        patch.funnyLevel[definition[1]] = Number(input.value);
        updateSettings(patch, definition[0], definition[2] + " updated for this browser-local preview.");
      });
    });

    var theme = one('[data-contract-hook="appearance-theme"] select', surface);
    if (theme) {
      theme.addEventListener("change", function () {
        updateSettings({ appearance: { theme: themeValue(theme.value) } }, "appearance-theme", "Theme preference updated for this browser-local preview.");
      });
    }

    var density = one('[data-contract-hook="density"] select', surface);
    if (!density) {
      density = made("select");
      [["comfortable", "Comfortable"], ["compact", "Compact"], ["spacious", "Spacious"]].forEach(function (pair) {
        var option = document.createElement("option");
        option.value = pair[0];
        option.textContent = pair[1];
        density.appendChild(option);
      });
      grid.appendChild(generatedSetting("Density", density, "density"));
    }
    density.addEventListener("change", function () {
      updateSettings({ appearance: { density: density.value } }, "density", "Density preference updated for this browser-local preview.");
    });

    var accent = one('[data-mss-page-accent]', surface);
    if (accent) {
      accent.addEventListener("input", function () {
        var output = one('[data-mss-page-accent-value]', surface);
        if (output) output.textContent = safeHexColor(accent.value, "#3f7cff");
      });
      accent.addEventListener("change", function () {
        updateSettings({ appearance: { accent: safeHexColor(accent.value, "#3f7cff") } }, "appearance-accent", "Browser-local page accent updated.");
      });
    }

    var family = one('[data-mss-page-font-family]', surface);
    if (family) family.addEventListener("change", function () {
      updateSettings({ appearance: { font: { family: family.value } } }, "appearance-font-family", "Browser-local typography family updated.");
    });

    var scale = one('[data-mss-page-font-scale]', surface);
    if (scale) {
      scale.addEventListener("input", function () {
        var output = one('[data-mss-page-font-scale-value]', surface);
        if (output) output.textContent = scaleLabel(scale.value);
      });
      scale.addEventListener("change", function () {
        updateSettings({ appearance: { font: { scale: Number(scale.value) } } }, "appearance-font-scale", "Browser-local typography scale updated.");
      });
    }

    var weight = one('[data-mss-page-font-weight]', surface);
    if (weight) weight.addEventListener("change", function () {
      updateSettings({ appearance: { font: { weight: Number(weight.value) } } }, "appearance-font-weight", "Browser-local typography weight updated.");
    });

    var emojiToggle = one('[data-contract-hook="emoji-toggle"] input[type="checkbox"]', surface);
    if (!emojiToggle) {
      var emojiToggle = made("input");
      emojiToggle.type = "checkbox";
      grid.appendChild(generatedSetting("Show emojis in browser-local notices", emojiToggle, "emoji-toggle"));
    }
    emojiToggle.addEventListener("change", function () {
      updateSettings({ showDialogEmoji: emojiToggle.checked }, "dialog-emoji", "Emoji decoration updated. The factual status stays the same.");
    });

    var vocabularyInput = one('[data-contract-hook="personal-vocabulary-upload"] input[type="file"]', surface);
    if (vocabularyInput) {
      var vocabularyHint = one('[data-contract-hook="personal-vocabulary-upload"] small', surface);
      if (vocabularyHint) vocabularyHint.textContent = "Version 1 JSON only: a bounded list of from/to replacement entries is validated and stored only in this browser until cleared.";
      vocabularyInput.addEventListener("change", function () {
        loadVocabulary(vocabularyInput.files && vocabularyInput.files[0], vocabularyInput);
      });
      var owner = vocabularyInput.closest("label");
      if (owner) {
        var clearer = one("[data-mss-vocabulary-clear]", owner);
        if (!clearer) {
          clearer = button("Clear in-page vocabulary preview", function () {});
          clearer.setAttribute("data-mss-vocabulary-clear", "true");
          owner.appendChild(clearer);
        }
        clearer.addEventListener("click", function () {
          clearVocabulary();
          vocabularyInput.value = "";
          notify("info", "The browser-local vocabulary cache was cleared. No source file name or path was retained.");
        });
        if (!one("[data-mss-vocabulary-status]", owner)) {
          var vocabularyStatus = made("output");
          vocabularyStatus.setAttribute("data-mss-vocabulary-status", "true");
          vocabularyStatus.setAttribute("aria-live", "polite");
          owner.appendChild(vocabularyStatus);
        }
      }
    }

    syncSettingsControls(surface);
    applySettingsPresentation();
    renderVocabularyStatus();
  }

  function appearanceEditorElements() {
    var surface = one('[data-contract-hook="appearance-editor"]');
    if (!surface) return {};
    return {
      surface: surface,
      accent: one('[data-mss-editor-accent]', surface),
      accentOutput: one('[data-mss-editor-accent-value]', surface),
      scale: one('[data-mss-editor-font-scale]', surface),
      scaleOutput: one('[data-mss-editor-font-scale-value]', surface),
      weight: one('[data-mss-editor-font-weight]', surface),
      apply: one('[data-mss-editor-apply]', surface),
      reset: one('[data-mss-editor-reset]', surface),
      status: one('[data-mss-editor-status]', surface),
      targets: all('[data-mss-appearance-target]', surface)
    };
  }

  function tabSnapshot() {
    return hasContractMethod("getAccessibleTabs") ? safely(function () { return contract.getAccessibleTabs(); }, null) : null;
  }

  function appearanceTargetLabel(target) {
    return {
      page: "the entire public page",
      "tab-strip": "the feature tab strip",
      "selected-tab": "the selected feature tab"
    }[target] || "the entire public page";
  }

  function appearanceValuesForTarget(target) {
    var settings = state.settings && state.settings.appearance || defaultSettings().appearance;
    var snapshot = tabSnapshot();
    if (target === "tab-strip" && snapshot && snapshot.appearance) return snapshot.appearance;
    if (target === "selected-tab" && snapshot) {
      var selected = snapshot.tabs.filter(function (tab) { return tab.id === snapshot.activeId; })[0];
      if (selected && selected.appearance) {
        return {
          accent: selected.appearance.accent || snapshot.appearance && snapshot.appearance.accent || settings.accent,
          fontScale: selected.appearance.fontScale !== 1 ? selected.appearance.fontScale : snapshot.appearance && snapshot.appearance.fontScale || 1,
          fontWeight: selected.appearance.fontWeight !== 600 ? selected.appearance.fontWeight : snapshot.appearance && snapshot.appearance.fontWeight || 600
        };
      }
    }
    return { accent: settings.accent, fontScale: settings.font.scale, fontWeight: settings.font.weight };
  }

  function renderAppearanceEditor() {
    var elements = appearanceEditorElements();
    if (!elements.surface) return;
    var target = elements.surface.getAttribute("data-mss-appearance-target-state") || "page";
    var snapshot = tabSnapshot();
    var selected = snapshot && snapshot.tabs.filter(function (tab) { return tab.id === snapshot.activeId; })[0];
    if (target === "selected-tab" && !selected) target = "page";
    elements.surface.setAttribute("data-mss-appearance-target-state", target);
    elements.targets.forEach(function (buttonElement) {
      buttonElement.setAttribute("aria-pressed", String(buttonElement.getAttribute("data-mss-appearance-target") === target));
    });
    var values = appearanceValuesForTarget(target);
    var accent = safeHexColor(values.accent, "#3f7cff");
    var scale = Math.max(0.75, Math.min(2, Number(values.fontScale) || 1));
    var weight = Number(values.fontWeight) || 400;
    if (elements.accent && document.activeElement !== elements.accent) elements.accent.value = accent;
    if (elements.accentOutput) elements.accentOutput.textContent = accent;
    if (elements.scale && document.activeElement !== elements.scale) elements.scale.value = String(scale);
    if (elements.scaleOutput) elements.scaleOutput.textContent = scaleLabel(scale);
    if (elements.weight && document.activeElement !== elements.weight) elements.weight.value = String(weight);
    if (elements.status) {
      var selectedLabel = selected ? selected.label : "no feature tab";
      elements.status.textContent = "Editing " + appearanceTargetLabel(target) + (target === "selected-tab" ? ": " + selectedLabel + "." : ".") + " Accent, text scale, and text weight are available in this browser-local foundation.";
    }
  }

  function editorValues(elements) {
    return {
      accent: safeHexColor(elements.accent && elements.accent.value, "#3f7cff"),
      fontScale: Math.max(0.75, Math.min(2, Number(elements.scale && elements.scale.value) || 1)),
      fontWeight: Number(elements.weight && elements.weight.value) || 400
    };
  }

  function applyAppearanceEditor(reset) {
    var elements = appearanceEditorElements();
    if (!elements.surface) return;
    var target = elements.surface.getAttribute("data-mss-appearance-target-state") || "page";
    var values = reset ? { accent: target === "selected-tab" ? "" : "#3f7cff", fontScale: 1, fontWeight: target === "tab-strip" || target === "selected-tab" ? 600 : 400 } : editorValues(elements);
    var result = null;
    if (target === "page") {
      result = hasContractMethod("updateSettings") ? safely(function () {
        return contract.updateSettings({ appearance: { accent: values.accent, font: { scale: values.fontScale, weight: values.fontWeight } } }, "appearance-editor-page");
      }, null) : null;
    } else if (target === "tab-strip") {
      result = hasContractMethod("setTabAppearance") ? safely(function () { return contract.setTabAppearance(values); }, null) : null;
    } else {
      var snapshot = tabSnapshot();
      var selected = snapshot && snapshot.tabs.filter(function (tab) { return tab.id === snapshot.activeId; })[0];
      result = selected && hasContractMethod("updateTab") ? safely(function () { return contract.updateTab(selected.id, { appearance: values }); }, null) : null;
    }
    if (!result || result.ok !== true) {
      notify("warning", (result && result.error) || "The browser-local appearance change could not be saved.");
      return;
    }
    hydrateContractState();
    syncSettingsControls();
    applySettingsPresentation();
    renderAppearanceEditor();
    notify("info", (reset ? "Reset " : "Updated ") + appearanceTargetLabel(target) + " in this browser-local preview.");
  }

  function installAppearanceEditor() {
    var elements = appearanceEditorElements();
    if (!elements.surface || elements.surface.getAttribute("data-mss-appearance-editor-ready") === "true") return;
    elements.surface.setAttribute("data-mss-appearance-editor-ready", "true");
    elements.targets.forEach(function (buttonElement) {
      buttonElement.addEventListener("click", function () {
        elements.surface.setAttribute("data-mss-appearance-target-state", buttonElement.getAttribute("data-mss-appearance-target") || "page");
        renderAppearanceEditor();
      });
    });
    if (elements.accent) elements.accent.addEventListener("input", function () {
      if (elements.accentOutput) elements.accentOutput.textContent = safeHexColor(elements.accent.value, "#3f7cff");
    });
    if (elements.scale) elements.scale.addEventListener("input", function () {
      if (elements.scaleOutput) elements.scaleOutput.textContent = scaleLabel(elements.scale.value);
    });
    if (elements.apply) elements.apply.addEventListener("click", function () { applyAppearanceEditor(false); });
    if (elements.reset) elements.reset.addEventListener("click", function () { applyAppearanceEditor(true); });
    renderAppearanceEditor();
  }

  function narratorElements() {
    var surface = one('[data-contract-surface="settings"]');
    if (!surface) return {};
    return {
      surface: surface,
      enabled: one('[data-contract-hook="narrator-enabled"] input', surface),
      language: one('[data-contract-hook="narrator-language"] select', surface),
      englishVoice: one('[data-contract-hook="narrator-english-voice"] select', surface),
      cantoneseVoice: one('[data-contract-hook="narrator-cantonese-voice"] select', surface),
      rate: one('[data-contract-hook="narrator-rate"] input', surface),
      rateOutput: one('#narrator-rate-output', surface),
      pitch: one('[data-contract-hook="narrator-pitch"] input', surface),
      pitchOutput: one('#narrator-pitch-output', surface),
      preview: one('[data-mss-narrator-preview]', surface),
      status: one('[data-mss-narrator-status]', surface)
    };
  }

  function narratorBaseSettings() {
    var settings = state.baseSettings || defaultSettings();
    return settings.narrator || defaultSettings().narrator;
  }

  function narratorSpeechSynthesis() {
    var synthesis = window.speechSynthesis;
    if (!synthesis || typeof synthesis.getVoices !== "function" || typeof synthesis.speak !== "function" || typeof window.SpeechSynthesisUtterance !== "function") return null;
    return synthesis;
  }

  function narratorVoices() {
    var synthesis = narratorSpeechSynthesis();
    if (!synthesis) return [];
    var voices = safely(function () { return synthesis.getVoices(); }, []);
    return Array.isArray(voices) ? voices.filter(function (voice) { return narratorVoiceId(voice); }) : [];
  }

  function narratorVoiceId(voice) {
    return voice && typeof voice.voiceURI === "string" ? voice.voiceURI.trim() : "";
  }

  function narratorTrackLabel(track) {
    return track === "cantonese" ? "Cantonese" : "English";
  }

  function isEnglishNarratorVoice(voice) {
    return /^en(?:[-_]|$)/i.test(String(voice && voice.lang || ""));
  }

  function isCantoneseNarratorVoice(voice) {
    return /^(?:yue|zh-hk|zh_hk)(?:[-_]|$)/i.test(String(voice && voice.lang || ""));
  }

  function narratorVoicesForTrack(track) {
    var voices = narratorVoices();
    if (track === "english") return voices.filter(isEnglishNarratorVoice);
    var direct = voices.filter(isCantoneseNarratorVoice);
    return direct.length ? direct : voices.filter(function (voice) { return /^zh(?:[-_]|$)/i.test(String(voice && voice.lang || "")); });
  }

  function resolveNarratorVoice(track) {
    var narrator = narratorBaseSettings();
    var configured = track === "cantonese" ? narrator.cantoneseVoice : narrator.englishVoice;
    var matching = narratorVoicesForTrack(track);
    if (!narratorSpeechSynthesis()) return { status: "unsupported", configured: configured, voice: null, matching: matching };
    if (!matching.length) return { status: narratorVoices().length ? "unavailable" : "waiting", configured: configured, voice: null, matching: matching };
    if (configured && configured !== "auto") {
      var selected = matching.find(function (voice) { return narratorVoiceId(voice) === configured; });
      if (selected) return { status: "selected", configured: configured, voice: selected, matching: matching };
      return { status: "missing", configured: configured, voice: matching.find(function (voice) { return voice.default; }) || matching[0], matching: matching };
    }
    return { status: "automatic", configured: "auto", voice: matching.find(function (voice) { return voice.default; }) || matching[0], matching: matching };
  }

  function voiceDescription(voice) {
    if (!voice) return "no matching voice";
    return String(voice.name || narratorVoiceId(voice)) + " (" + String(voice.lang || "und") + ")";
  }

  function populateNarratorVoiceSelect(select, track, resolution) {
    if (!select) return;
    var configured = resolution.configured || "auto";
    var previousFocus = document.activeElement === select;
    select.replaceChildren();
    var automatic = document.createElement("option");
    automatic.value = "auto";
    automatic.textContent = "Choose automatically";
    select.appendChild(automatic);
    resolution.matching.forEach(function (voice) {
      var option = document.createElement("option");
      option.value = narratorVoiceId(voice);
      option.textContent = voiceDescription(voice) + (voice.localService === false ? " — may require network" : "");
      select.appendChild(option);
    });
    if (configured !== "auto" && !resolution.matching.some(function (voice) { return narratorVoiceId(voice) === configured; })) {
      var unavailable = document.createElement("option");
      unavailable.value = configured;
      unavailable.textContent = "Saved " + narratorTrackLabel(track).toLowerCase() + " voice is unavailable (choice kept)";
      unavailable.disabled = true;
      unavailable.selected = true;
      select.appendChild(unavailable);
    } else {
      select.value = configured;
    }
    if (previousFocus) select.focus();
  }

  function narratorResolutionMessage(track, resolution) {
    var label = narratorTrackLabel(track);
    if (resolution.status === "unsupported") return label + " speech is unavailable because this browser does not expose a usable speech-synthesis API.";
    if (resolution.status === "waiting") return label + " voices have not arrived from the browser yet. The picker will update when voiceschanged fires.";
    if (resolution.status === "unavailable") return "No installed " + label.toLowerCase() + " voice is available. That track will remain silent rather than claiming a fallback.";
    if (resolution.status === "missing") return "Saved " + label.toLowerCase() + " voice is not installed on this browser; its identity is kept and " + voiceDescription(resolution.voice) + " is the automatic fallback.";
    return label + " uses " + voiceDescription(resolution.voice) + (resolution.voice && resolution.voice.localService === false ? "; this browser marks it as possibly network-backed and it may be silent offline." : ".");
  }

  function syncNarratorControls() {
    var elements = narratorElements();
    if (!elements.surface) return;
    var narrator = narratorBaseSettings();
    var supported = Boolean(narratorSpeechSynthesis());
    var schoolActive = Boolean(state.settings && state.settings.schoolMode && state.settings.schoolMode.active);
    var disabled = !supported || schoolActive;
    var english = resolveNarratorVoice("english");
    var cantonese = resolveNarratorVoice("cantonese");
    if (elements.enabled) {
      elements.enabled.checked = Boolean(narrator.enabled);
      elements.enabled.disabled = disabled;
    }
    if (elements.language) {
      elements.language.value = narrator.language;
      elements.language.disabled = disabled;
    }
    populateNarratorVoiceSelect(elements.englishVoice, "english", english);
    populateNarratorVoiceSelect(elements.cantoneseVoice, "cantonese", cantonese);
    [elements.englishVoice, elements.cantoneseVoice].forEach(function (select) { if (select) select.disabled = disabled; });
    if (elements.rate) {
      if (document.activeElement !== elements.rate) elements.rate.value = Number(narrator.rate || 1).toFixed(1);
      elements.rate.disabled = disabled;
    }
    if (elements.rateOutput) elements.rateOutput.textContent = Number(narrator.rate || 1).toFixed(1) + "×";
    if (elements.pitch) {
      if (document.activeElement !== elements.pitch) elements.pitch.value = Number(narrator.pitch || 1).toFixed(1);
      elements.pitch.disabled = disabled;
    }
    if (elements.pitchOutput) elements.pitchOutput.textContent = Number(narrator.pitch || 1).toFixed(1);
    if (elements.preview) elements.preview.disabled = disabled || !narrator.enabled;
    if (elements.status) {
      if (schoolActive) {
        elements.status.textContent = schoolModeName() + " is active, so narrator controls and queued speech are paused. Your browser-local narrator preferences remain stored.";
      } else if (!supported) {
        elements.status.textContent = "This browser does not expose speech synthesis. The narrator remains off and no voice is claimed.";
      } else {
        elements.status.textContent = narratorResolutionMessage("english", english) + " " + narratorResolutionMessage("cantonese", cantonese) + " This page cannot reliably detect a screen reader, so narration stays opt-in and never starts until a page event occurs.";
      }
    }
  }

  function runNarratorQueue() {
    if (narratorRuntime.speaking || !narratorRuntime.queue.length) return;
    var synthesis = narratorSpeechSynthesis();
    if (!synthesis || !narrationAllowed()) {
      narratorRuntime.queue = [];
      return;
    }
    var entry = narratorRuntime.queue.shift();
    var utterance = new window.SpeechSynthesisUtterance(entry.text);
    utterance.voice = entry.voice;
    utterance.lang = (entry.voice && entry.voice.lang) || (entry.language === "cantonese" ? "yue-HK" : "en-US");
    utterance.rate = entry.rate;
    utterance.pitch = entry.pitch;
    narratorRuntime.speaking = true;
    var advance = function () {
      narratorRuntime.speaking = false;
      window.setTimeout(runNarratorQueue, 0);
    };
    utterance.onend = advance;
    utterance.onerror = advance;
    try {
      synthesis.speak(utterance);
    } catch (_) {
      advance();
    }
  }

  function clearPendingNarration() {
    if (narratorRuntime.pendingTimer) window.clearTimeout(narratorRuntime.pendingTimer);
    narratorRuntime.pendingTimer = null;
    narratorRuntime.pendingQueue = null;
    narratorRuntime.queue = [];
  }

  function replaceNarratorQueue(queue, debounced) {
    var speak = function (nextQueue) {
      narratorRuntime.queue = nextQueue;
      runNarratorQueue();
    };
    if (!debounced) {
      clearPendingNarration();
      speak(queue);
      return;
    }
    narratorRuntime.pendingQueue = queue;
    if (narratorRuntime.pendingTimer) window.clearTimeout(narratorRuntime.pendingTimer);
    narratorRuntime.pendingTimer = window.setTimeout(function () {
      var nextQueue = narratorRuntime.pendingQueue;
      narratorRuntime.pendingTimer = null;
      narratorRuntime.pendingQueue = null;
      if (nextQueue && nextQueue.length) speak(nextQueue);
    }, 250);
  }

  function narrationAllowed() {
    var narrator = narratorBaseSettings();
    return Boolean(narrator.enabled && narratorSpeechSynthesis() && !(state.settings && state.settings.schoolMode && state.settings.schoolMode.active) && !document.hidden);
  }

  function narrateEvent(english, cantonese, category, bypassCooldown) {
    if (!narrationAllowed()) return false;
    var narrator = narratorBaseSettings();
    var now = Date.now();
    var bucket = String(category || "event").slice(0, 80);
    if (!bypassCooldown && narratorRuntime.lastByCategory[bucket] && now - narratorRuntime.lastByCategory[bucket] < 2000) return false;
    narratorRuntime.lastByCategory[bucket] = now;
    var queue = [];
    if (narrator.language === "english" || narrator.language === "bilingual") {
      var englishResolution = resolveNarratorVoice("english");
      if (englishResolution.voice) queue.push({ language: "english", text: String(english || "Browser-local event."), voice: englishResolution.voice, rate: Number(narrator.rate) || 1, pitch: Number(narrator.pitch) || 1 });
    }
    if (narrator.language === "cantonese" || narrator.language === "bilingual") {
      var cantoneseResolution = resolveNarratorVoice("cantonese");
      if (cantoneseResolution.voice) queue.push({ language: "cantonese", text: String(cantonese || english || "瀏覽器本機事件。"), voice: cantoneseResolution.voice, rate: Number(narrator.rate) || 1, pitch: Number(narrator.pitch) || 1 });
    }
    if (!queue.length) {
      syncNarratorControls();
      return false;
    }
    replaceNarratorQueue(queue, !bypassCooldown);
    return true;
  }

  function narrateNotice(level, message) {
    narrateEvent("Browser-local notice. " + message, "瀏覽器本機通知：" + message, "notice-" + String(level || "info"), level === "error");
  }

  function installNarrator() {
    var elements = narratorElements();
    if (!elements.surface || elements.surface.getAttribute("data-mss-narrator-ready") === "true") return;
    elements.surface.setAttribute("data-mss-narrator-ready", "true");
    if (elements.enabled) elements.enabled.addEventListener("change", function () {
      updateSettings({ narrator: { enabled: elements.enabled.checked } }, "narrator-enabled", elements.enabled.checked ? "Browser-local event narration is enabled. Use Preview narrator to hear the selected browser voice." : "Browser-local event narration is disabled.");
    });
    if (elements.language) elements.language.addEventListener("change", function () {
      updateSettings({ narrator: { language: elements.language.value } }, "narrator-language", "Narrated language updated for this browser-local page.");
    });
    [[elements.englishVoice, "englishVoice", "English"], [elements.cantoneseVoice, "cantoneseVoice", "Cantonese"]].forEach(function (definition) {
      if (!definition[0]) return;
      definition[0].addEventListener("change", function () {
        var patch = {};
        patch[definition[1]] = definition[0].value;
        updateSettings({ narrator: patch }, "narrator-" + definition[1], definition[2] + " voice preference updated. The selected voice remains browser-local.");
      });
    });
    [[elements.rate, elements.rateOutput, "rate", "×"], [elements.pitch, elements.pitchOutput, "pitch", ""]].forEach(function (definition) {
      if (!definition[0]) return;
      definition[0].addEventListener("input", function () { if (definition[1]) definition[1].textContent = Number(definition[0].value).toFixed(1) + definition[3]; });
      definition[0].addEventListener("change", function () {
        var patch = {};
        patch[definition[2]] = Number(definition[0].value);
        updateSettings({ narrator: patch }, "narrator-" + definition[2], "Narrator " + definition[2] + " updated for this browser-local page.");
      });
    });
    if (elements.preview) elements.preview.addEventListener("click", function () {
      var played = narrateEvent("Narrator preview. This is browser-local speech.", "旁白預覽：呢段語音只喺瀏覽器本機播放。", "preview", true);
      if (!played && elements.status) elements.status.textContent = "No matching selected voice is currently available for the active narrated language. Nothing was spoken.";
    });
    if (hasContractMethod("observeNarratorVoices")) {
      narratorRuntime.voiceUnsubscribe = safely(function () {
        return contract.observeNarratorVoices(function (capabilities) {
          state.narratorCapabilities = capabilities || { supported: false, voices: [] };
          syncNarratorControls();
        });
      }, null);
    }
    window.addEventListener("pagehide", function () {
      if (typeof narratorRuntime.voiceUnsubscribe === "function") narratorRuntime.voiceUnsubscribe();
      narratorRuntime.voiceUnsubscribe = null;
      clearPendingNarration();
      if (window.speechSynthesis && typeof window.speechSynthesis.cancel === "function") safely(function () { window.speechSynthesis.cancel(); });
    }, { once: true });
    syncNarratorControls();
    if (hasContractMethod("registerCommand")) safely(function () {
      contract.registerCommand({ id: "browser-local-narrator", title: "Browser-local narrator", description: "Configure optional local event narration and browser voices.", group: "Browser-local settings", elementId: "settings-preview", keywords: ["speech", "voice", "narrator"] });
    });
  }

  function scheduleElements() {
    var surface = one('[data-contract-surface="settings"]');
    if (!surface) return {};
    var form = one('[data-mss-schedule-form]', surface);
    return {
      surface: surface,
      form: form,
      label: one('[data-mss-schedule-label]', surface),
      source: one('[data-mss-schedule-source]', surface),
      setting: one('[data-mss-schedule-setting]', surface),
      valueField: one('[data-mss-schedule-value-field]', surface),
      startDate: one('[data-mss-schedule-start-date]', surface),
      endDate: one('[data-mss-schedule-end-date]', surface),
      startTime: one('[data-mss-schedule-start-time]', surface),
      endTime: one('[data-mss-schedule-end-time]', surface),
      priority: one('[data-mss-schedule-priority]', surface),
      enabled: one('[data-mss-schedule-enabled]', surface),
      dayModes: all('[data-mss-schedule-day-mode]', surface),
      weekdays: one('[data-mss-schedule-weekdays]', surface),
      reset: one('[data-mss-schedule-reset]', surface),
      formStatus: one('[data-mss-schedule-form-status]', surface),
      timezone: one('[data-mss-schedule-timezone]', surface),
      list: one('[data-mss-schedule-list]', surface),
      status: one('[data-mss-schedule-status]', surface)
    };
  }

  function scheduleSettingLabel(setting) {
    return {
      languageMode: "Language mode",
      "appearance.theme": "Theme",
      "appearance.density": "Density",
      "appearance.accent": "Accent color",
      "appearance.font.family": "Font family",
      "appearance.font.scale": "Font scale",
      "appearance.font.weight": "Font weight"
    }[setting] || setting;
  }

  function scheduleDefaultValue(setting) {
    var base = state.baseSettings || defaultSettings();
    if (setting === "languageMode") return base.languageMode;
    if (setting === "appearance.theme") return base.appearance.theme;
    if (setting === "appearance.density") return base.appearance.density;
    if (setting === "appearance.accent") return base.appearance.accent;
    if (setting === "appearance.font.family") return base.appearance.font.family;
    if (setting === "appearance.font.scale") return base.appearance.font.scale;
    if (setting === "appearance.font.weight") return base.appearance.font.weight;
    return "";
  }

  function renderScheduleValueField(elements, selectedValue) {
    if (!elements.valueField || !elements.setting) return;
    var setting = elements.setting.value;
    var value = selectedValue == null ? scheduleDefaultValue(setting) : selectedValue;
    elements.valueField.replaceChildren();
    var label = made("label");
    var title = made("span");
    title.textContent = scheduleSettingLabel(setting) + " value";
    var input;
    if (setting === "languageMode" || setting === "appearance.theme" || setting === "appearance.density" || setting === "appearance.font.family" || setting === "appearance.font.weight") {
      input = made("select");
      var choices = setting === "languageMode" ? [["english", "English"], ["cantonese", "Playful Hong Kong-style Cantonese"], ["bilingual", "Bilingual"]] : setting === "appearance.theme" ? [["system", "System default"], ["light", "Light"], ["dark", "Dark"]] : setting === "appearance.density" ? [["compact", "Compact"], ["comfortable", "Comfortable"], ["spacious", "Spacious"]] : setting === "appearance.font.family" ? [["system-ui", "System UI"], ["Inter, system-ui, sans-serif", "Inter fallback stack"], ["Arial, sans-serif", "Arial fallback stack"], ["Segoe UI, sans-serif", "Segoe UI fallback stack"], ["Georgia, serif", "Georgia fallback stack"], ["Cascadia Code, Consolas, monospace", "Cascadia Code fallback stack"]] : [["100", "100"], ["200", "200"], ["300", "300"], ["400", "400"], ["500", "500"], ["600", "600"], ["700", "700"], ["800", "800"], ["900", "900"]];
      choices.forEach(function (pair) {
        var option = document.createElement("option");
        option.value = pair[0];
        option.textContent = pair[1];
        input.appendChild(option);
      });
      input.value = String(value);
    } else if (setting === "appearance.accent") {
      input = made("input");
      input.type = "color";
      input.value = /^#[0-9a-f]{6}$/i.test(String(value)) ? String(value) : "#3f7cff";
    } else {
      input = made("input");
      input.type = "number";
      input.min = "0.75";
      input.max = "2";
      input.step = "0.05";
      input.value = String(value);
    }
    input.setAttribute("data-mss-schedule-value-input", "true");
    label.append(title, input);
    var help = made("small");
    help.textContent = setting === "appearance.accent" ? "The saved local rule changes this page's accent only." : "This local override ends automatically when the rule no longer matches.";
    label.appendChild(help);
    elements.valueField.appendChild(label);
  }

  function localTimezoneLabel() {
    return safely(function () { return Intl.DateTimeFormat().resolvedOptions().timeZone || "this browser's local timezone"; }, "this browser's local timezone");
  }

  function scheduleDayMode(elements) {
    var selected = elements.dayModes.filter(function (input) { return input.checked; })[0];
    return selected && selected.value === "selected" ? "selected" : "every";
  }

  function renderScheduleWeekdays(elements) {
    if (!elements.weekdays) return;
    var selected = scheduleDayMode(elements) === "selected";
    elements.weekdays.hidden = !selected;
    all('input[type="checkbox"]', elements.weekdays).forEach(function (input) { input.disabled = !selected; });
  }

  function scheduleWeekdaysFromForm(elements) {
    if (scheduleDayMode(elements) !== "selected") return [];
    return all('input[type="checkbox"]:checked', elements.weekdays).map(function (input) { return Number(input.value); }).filter(function (value) { return Number.isInteger(value) && value >= 0 && value <= 6; });
  }

  function scheduleValueFromForm(elements) {
    var input = one('[data-mss-schedule-value-input]', elements.valueField);
    if (!input) return null;
    if (elements.setting.value === "appearance.font.scale" || elements.setting.value === "appearance.font.weight") return Number(input.value);
    return input.value;
  }

  function validateScheduleForm(elements) {
    if (!elements.label || !elements.label.value.trim()) return { error: "Give this browser-local rule a label." };
    if (!elements.source || elements.source.value !== "local") return { error: "Only browser-local schedules are available on this static page." };
    if (elements.startDate.value && elements.endDate.value && elements.startDate.value > elements.endDate.value) return { error: "The end date must be on or after the start date." };
    var weekdays = scheduleWeekdaysFromForm(elements);
    if (scheduleDayMode(elements) === "selected" && !weekdays.length) return { error: "Select at least one weekday, or choose Every day." };
    var priority = Number(elements.priority.value);
    if (!Number.isInteger(priority) || priority < 0 || priority > 999) return { error: "Priority must be a whole number from 0 through 999." };
    var value = scheduleValueFromForm(elements);
    if (value === null || value === "") return { error: "Choose a value for the scheduled setting." };
    return {
      value: {
        id: elements.form.getAttribute("data-mss-schedule-editing-id") || undefined,
        version: 1,
        label: elements.label.value.trim(),
        source: "local",
        setting: elements.setting.value,
        value: value,
        enabled: Boolean(elements.enabled.checked),
        startDate: elements.startDate.value,
        endDate: elements.endDate.value,
        startTime: elements.startTime.value,
        endTime: elements.endTime.value,
        weekdays: weekdays,
        priority: priority
      }
    };
  }

  function scheduleTimeWindow(rule) {
    if (!rule.startTime && !rule.endTime) return "all day";
    if (rule.startTime && rule.endTime && rule.startTime === rule.endTime) return "inactive: equal start and end time";
    if (rule.startTime && rule.endTime && rule.startTime > rule.endTime) return rule.startTime + "–" + rule.endTime + " (crosses midnight)";
    if (rule.startTime && rule.endTime) return rule.startTime + "–" + rule.endTime;
    if (rule.startTime) return "from " + rule.startTime;
    return "until " + rule.endTime;
  }

  function scheduleDays(rule) {
    if (!rule.weekdays || !rule.weekdays.length) return "every day";
    return rule.weekdays.map(function (day) { return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][day]; }).join(", ");
  }

  function resetScheduleEditor(elements, message) {
    if (!elements.form) return;
    elements.form.removeAttribute("data-mss-schedule-editing-id");
    if (elements.label) elements.label.value = "Browser-local schedule";
    if (elements.source) elements.source.value = "local";
    if (elements.setting) elements.setting.value = "languageMode";
    if (elements.startDate) elements.startDate.value = "";
    if (elements.endDate) elements.endDate.value = "";
    if (elements.startTime) elements.startTime.value = "";
    if (elements.endTime) elements.endTime.value = "";
    if (elements.priority) elements.priority.value = "0";
    if (elements.enabled) elements.enabled.checked = true;
    elements.dayModes.forEach(function (input) { input.checked = input.value === "every"; });
    if (elements.weekdays) all('input[type="checkbox"]', elements.weekdays).forEach(function (input) { input.checked = false; });
    if (elements.reset) elements.reset.hidden = true;
    renderScheduleWeekdays(elements);
    renderScheduleValueField(elements);
    if (elements.formStatus) elements.formStatus.textContent = message || "Choose a setting and save a local rule.";
  }

  function loadScheduleIntoEditor(elements, rule) {
    if (!rule || !elements.form) return;
    elements.form.setAttribute("data-mss-schedule-editing-id", rule.id);
    elements.label.value = rule.label;
    elements.source.value = "local";
    elements.setting.value = rule.setting;
    renderScheduleValueField(elements, rule.value);
    elements.startDate.value = rule.startDate || "";
    elements.endDate.value = rule.endDate || "";
    elements.startTime.value = rule.startTime || "";
    elements.endTime.value = rule.endTime || "";
    elements.priority.value = String(rule.priority || 0);
    elements.enabled.checked = rule.enabled !== false;
    var dayMode = rule.weekdays && rule.weekdays.length ? "selected" : "every";
    elements.dayModes.forEach(function (input) { input.checked = input.value === dayMode; });
    if (elements.weekdays) all('input[type="checkbox"]', elements.weekdays).forEach(function (input) { input.checked = Boolean(rule.weekdays && rule.weekdays.indexOf(Number(input.value)) !== -1); });
    if (elements.reset) elements.reset.hidden = false;
    renderScheduleWeekdays(elements);
    if (elements.formStatus) elements.formStatus.textContent = "Editing " + rule.label + ". Saving updates this browser-local rule.";
    focus(elements.form);
  }

  function confirmScheduleRemoval(rule, origin) {
    if (!rule) return;
    showDialog("Remove browser-local schedule rule", function (content, instance) {
      var description = made("p");
      description.textContent = "This removes only the browser-local schedule rule '" + rule.label + "'. It does not change the installed application, a server, or another browser. The action cannot be undone from this page.";
      var firstLabel = made("label");
      var first = made("input");
      first.type = "checkbox";
      firstLabel.append(first, document.createTextNode(" I understand that this removes the selected browser-local rule."));
      var secondLabel = made("label");
      var second = made("input");
      second.type = "checkbox";
      secondLabel.append(second, document.createTextNode(" I understand that saved base settings are not being changed."));
      var sliderLabel = made("label");
      sliderLabel.textContent = "Confirm removal";
      var slider = made("input");
      slider.type = "range";
      slider.min = "0";
      slider.max = "100";
      slider.value = "0";
      slider.disabled = true;
      sliderLabel.appendChild(slider);
      var status = made("output");
      status.setAttribute("role", "status");
      status.setAttribute("aria-live", "polite");
      var cancel = button("Emergency exit", function () { closeDialog(instance); });
      var remove = button("Remove browser-local rule", function () {
        var result = hasContractMethod("removeSchedule") ? safely(function () { return contract.removeSchedule(rule.id); }, null) : null;
        if (!result || result.ok !== true) {
          status.textContent = (result && result.error) || "The browser-local rule was not removed.";
          return;
        }
        closeDialog(instance);
        hydrateContractState();
        refreshScheduledPresentation(false);
        notify("info", "Browser-local schedule rule removed.");
      });
      remove.disabled = true;
      function update() {
        slider.disabled = !(first.checked && second.checked);
        remove.disabled = slider.disabled || slider.value !== "100";
        status.textContent = slider.disabled ? "Acknowledge both statements to enable the full confirmation slider." : slider.value === "100" ? "Removal is ready to be confirmed." : "Move the confirmation slider to 100 before removal is available.";
      }
      first.addEventListener("change", update);
      second.addEventListener("change", update);
      slider.addEventListener("input", update);
      var onCancel = function (event) {
        event.preventDefault();
        closeDialog(instance);
      };
      instance.addEventListener("cancel", onCancel);
      instance.addEventListener("close", function () {
        instance.removeEventListener("cancel", onCancel);
        if (origin) focus(origin);
      }, { once: true });
      content.append(description, firstLabel, secondLabel, sliderLabel, status, cancel, remove);
      update();
    });
  }

  function renderScheduleList() {
    var elements = scheduleElements();
    if (!elements.surface || !elements.list) return;
    var activeValues = hasContractMethod("getActiveScheduleValues") ? safely(function () { return contract.getActiveScheduleValues(); }, {}) : {};
    var rules = state.schedules.slice().sort(function (left, right) { return String(left.label).localeCompare(String(right.label)) || String(left.id).localeCompare(String(right.id)); });
    elements.list.replaceChildren();
    rules.forEach(function (rule) {
      var item = made("li");
      var active = activeValues && activeValues[rule.setting] && activeValues[rule.setting].ruleId === rule.id;
      item.setAttribute("data-mss-schedule-active", String(Boolean(active)));
      var details = made("div");
      var title = made("strong");
      title.textContent = rule.label + (active ? " — active" : rule.enabled === false ? " — disabled" : "");
      var detail = made("small");
      detail.textContent = scheduleSettingLabel(rule.setting) + " → " + String(rule.value) + "; " + scheduleDays(rule) + "; " + scheduleTimeWindow(rule) + "; priority " + rule.priority + ".";
      var bounds = made("small");
      bounds.textContent = rule.startDate || rule.endDate ? "Date bounds: " + (rule.startDate || "no start") + " to " + (rule.endDate || "no end") + ". Local timezone: " + localTimezoneLabel() + "." : "No date bounds. Local timezone: " + localTimezoneLabel() + ".";
      details.append(title, detail, bounds);
      var actions = made("div");
      actions.className = "schedule-list-actions";
      var edit = button("Edit", function () { loadScheduleIntoEditor(scheduleElements(), rule); }, "Edit " + rule.label);
      var remove = button("Remove", function () { confirmScheduleRemoval(rule, remove); }, "Remove " + rule.label);
      actions.append(edit, remove);
      item.append(details, actions);
      elements.list.appendChild(item);
    });
    if (!rules.length) {
      var empty = made("li");
      empty.textContent = "No browser-local schedule rules are saved.";
      elements.list.appendChild(empty);
    }
    if (elements.timezone) elements.timezone.textContent = "Timezone: " + localTimezoneLabel() + ". Date and time windows use this browser's local clock; daylight-saving changes follow that clock.";
    if (elements.status) {
      var activeKeys = Object.keys(activeValues || {});
      if (state.settings && state.settings.schedulePresentationSuppressed) elements.status.textContent = schoolModeName() + " is active, so saved browser-local schedule overrides are paused.";
      else if (activeKeys.length) elements.status.textContent = "Active browser-local override" + (activeKeys.length === 1 ? "" : "s") + ": " + activeKeys.map(scheduleSettingLabel).join(", ") + ". Higher priority wins; equal priority uses the stable rule identifier.";
      else elements.status.textContent = rules.length ? "No saved rule matches the current local date and time." : "No browser-local schedule rules are saved.";
    }
  }

  function scheduledPresentationSignature() {
    return JSON.stringify({ overrides: state.settings && state.settings.scheduledOverrides || {}, suppressed: Boolean(state.settings && state.settings.schedulePresentationSuppressed) });
  }

  function refreshScheduledPresentation(announce) {
    var before = narratorRuntime.scheduleSignature;
    hydrateContractState();
    var after = scheduledPresentationSignature();
    var changed = !before || before !== after;
    if (changed) {
      syncSettingsControls();
      applySettingsPresentation();
      syncNarratorControls();
      renderScheduleList();
    }
    if (announce && before && before !== after && !(state.settings && state.settings.schoolMode && state.settings.schoolMode.active)) {
      var active = state.settings && state.settings.scheduledOverrides && Object.keys(state.settings.scheduledOverrides).length;
      narrateEvent(active ? "A browser-local schedule is now active." : "A browser-local scheduled override has ended.", active ? "瀏覽器本機排程而家生效。" : "瀏覽器本機排程覆寫已經結束。", "schedule-transition", true);
    }
    narratorRuntime.scheduleSignature = after;
  }

  function installSchedules() {
    var elements = scheduleElements();
    if (!elements.surface || !elements.form || elements.surface.getAttribute("data-mss-schedules-ready") === "true") return;
    elements.surface.setAttribute("data-mss-schedules-ready", "true");
    resetScheduleEditor(elements);
    if (elements.source) elements.source.addEventListener("change", function () {
      if (elements.source.value !== "local") {
        elements.source.value = "local";
        if (elements.formStatus) elements.formStatus.textContent = "Validated HTTPS and Home Assistant sources are unavailable on this static page. No request was made.";
      }
    });
    if (elements.setting) elements.setting.addEventListener("change", function () { renderScheduleValueField(elements); });
    elements.dayModes.forEach(function (input) { input.addEventListener("change", function () { renderScheduleWeekdays(elements); }); });
    if (elements.reset) elements.reset.addEventListener("click", function () { resetScheduleEditor(elements, "Editing cancelled. No browser-local schedule rule changed."); });
    elements.form.addEventListener("submit", function (event) {
      event.preventDefault();
      var prepared = validateScheduleForm(elements);
      if (prepared.error) {
        if (elements.formStatus) elements.formStatus.textContent = prepared.error;
        return;
      }
      var result = hasContractMethod("createSchedule") ? safely(function () { return contract.createSchedule(prepared.value); }, null) : null;
      if (!result || result.ok !== true) {
        if (elements.formStatus) elements.formStatus.textContent = (result && result.error) || "The browser-local schedule rule could not be saved.";
        return;
      }
      var equal = prepared.value.startTime && prepared.value.endTime && prepared.value.startTime === prepared.value.endTime;
      resetScheduleEditor(elements, equal ? "Rule saved. Equal start and end times make it inactive until you edit it." : "Browser-local schedule rule saved.");
      refreshScheduledPresentation(false);
      notify("info", equal ? "Browser-local schedule rule saved with an equal-time inactive window." : "Browser-local schedule rule saved.");
    });
    document.addEventListener("visibilitychange", function () { if (!document.hidden) refreshScheduledPresentation(true); });
    narratorRuntime.scheduleTimer = window.setInterval(function () { refreshScheduledPresentation(true); }, 30000);
    window.addEventListener("pagehide", function () {
      if (narratorRuntime.scheduleTimer) window.clearInterval(narratorRuntime.scheduleTimer);
      narratorRuntime.scheduleTimer = null;
    }, { once: true });
    refreshScheduledPresentation(false);
    if (hasContractMethod("registerCommand")) safely(function () {
      contract.registerCommand({ id: "browser-local-schedules", title: "Browser-local schedules", description: "Schedule language and appearance settings with local time only.", group: "Browser-local settings", elementId: "settings-preview", keywords: ["schedule", "timezone", "appearance", "language"] });
    });
  }

  function escapePattern(value) {
    return value.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
  }

  function restoreVocabulary() {
    originals.forEach(function (original, node) {
      if (node.isConnected) node.nodeValue = original;
    });
  }

  function applyVocabulary() {
    restoreVocabulary();
    if (!hasContractMethod("getState") || state.settings.schoolMode.active) return;
    var snapshot = safely(function () { return contract.getState(); }, null);
    var payload = snapshot && snapshot.personalVocabulary && snapshot.personalVocabulary.payload;
    var validation = payload ? validatePersonalVocabularyPayload(JSON.stringify(payload)) : null;
    if (payload && (!validation || validation.ok !== true)) {
      if (hasContractMethod("clearPersonalVocabulary")) safely(function () { contract.clearPersonalVocabulary(); });
      hydrateContractState();
      return;
    }
    var replacements = validation && validation.ok ? validation.value.replacements : [];
    if (!replacements.length) return;
    var replacementMap = new Map(replacements.map(function (replacement) { return [replacement.from, replacement.to]; }));
    var keys = Array.from(replacementMap.keys()).sort(function (a, b) { return b.length - a.length; });
    var matcher = new RegExp(keys.map(escapePattern).join("|"), "g");
    var walker = document.createTreeWalker(main || body, NodeFilter.SHOW_TEXT);
    var node;
    while ((node = walker.nextNode())) {
      var parent = node.parentElement;
      if (!parent || parent.closest("script, style, code, pre, textarea, select, option, button, [data-mss-generated]")) continue;
      if (!originals.has(node)) originals.set(node, node.nodeValue);
      node.nodeValue = originals.get(node).replace(matcher, function (match) {
        return replacementMap.has(match) ? replacementMap.get(match) : match;
      });
    }
  }

  function renderVocabularyStatus() {
    var surface = one('[data-contract-surface="settings"]');
    var output = surface && one("[data-mss-vocabulary-status]", surface);
    if (!output) return;
    var snapshot = hasContractMethod("getState") ? safely(function () { return contract.getState(); }, null) : null;
    var payload = snapshot && snapshot.personalVocabulary && snapshot.personalVocabulary.payload;
    if (!hasContractMethod("loadPersonalVocabulary")) {
      output.textContent = "The browser-local vocabulary control is unavailable because its local contract did not load.";
      return;
    }
    if (!payload) {
      output.textContent = "No validated vocabulary JSON is loaded in this browser. The selected source file name and path are never stored.";
      return;
    }
    var validation = validatePersonalVocabularyPayload(JSON.stringify(payload));
    if (!validation || validation.ok !== true) {
      if (hasContractMethod("clearPersonalVocabulary")) safely(function () { contract.clearPersonalVocabulary(); });
      hydrateContractState();
      restoreVocabulary();
      output.textContent = "The saved vocabulary cache did not pass local validation and was cleared. Nothing was applied.";
      return;
    }
    if (state.settings.schoolMode.active) {
      output.textContent = "A validated vocabulary cache is stored locally but is inactive while " + schoolModeName() + " is enabled.";
      return;
    }
    output.textContent = validation.value.replacements.length + " validated replacement entries are stored only in this browser's local storage. Clear removes the local cache immediately.";
  }

  function clearVocabulary() {
    if (hasContractMethod("clearPersonalVocabulary")) safely(function () { contract.clearPersonalVocabulary(); });
    hydrateContractState();
    restoreVocabulary();
    renderVocabularyStatus();
    renderHistory();
  }

  var schoolUnlockFailures = 0;
  var nextSchoolUnlockAt = 0;

  function schoolModeName() {
    var name = state.settings && state.settings.schoolMode && state.settings.schoolMode.name;
    return typeof name === "string" && name.trim() ? name.trim() : "School mode";
  }

  function schoolCodeLength(value) {
    return typeof value === "string" ? Array.from(value).length : 0;
  }

  function schoolCryptoAvailable() {
    return Boolean(window.crypto && window.crypto.subtle && typeof window.crypto.getRandomValues === "function" && typeof TextEncoder === "function" && typeof btoa === "function" && typeof atob === "function");
  }

  function bytesToBase64(bytes) {
    var value = "";
    for (var index = 0; index < bytes.length; index += 1) value += String.fromCharCode(bytes[index]);
    return btoa(value);
  }

  function base64ToBytes(value) {
    var binary = atob(value);
    var bytes = new Uint8Array(binary.length);
    for (var index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  async function schoolCodeVerifier(code, salt) {
    var codeBytes = new TextEncoder().encode(code);
    var source = new Uint8Array(salt.length + codeBytes.length);
    source.set(salt, 0);
    source.set(codeBytes, salt.length);
    var digest = await window.crypto.subtle.digest("SHA-256", source);
    return bytesToBase64(new Uint8Array(digest));
  }

  function schoolModeElements() {
    var surface = one('[data-contract-surface="settings"]');
    if (!surface) return {};
    return {
      surface: surface,
      nameInput: one("[data-mss-school-name-input]", surface),
      setupCode: one("[data-mss-school-credential-setup]", surface),
      unlockCode: one("[data-mss-school-credential-unlock]", surface),
      setup: one("[data-mss-school-setup]", surface),
      saveName: one("[data-mss-school-save-name]", surface),
      enable: one("[data-mss-school-enable]", surface),
      unlock: one("[data-mss-school-unlock]", surface),
      disable: one("[data-mss-school-disable]", surface),
      reset: one("[data-mss-school-reset]", surface),
      status: one("[data-mss-school-status]", surface),
      boundary: one("[data-mss-school-boundary]", surface)
    };
  }

  function renderSchoolModeControls() {
    var elements = schoolModeElements();
    if (!elements.surface) return;
    var active = Boolean(state.settings && state.settings.schoolMode && state.settings.schoolMode.active);
    var name = schoolModeName();
    all("[data-mss-school-name]").forEach(function (element) { element.textContent = name; });
    if (elements.nameInput && document.activeElement !== elements.nameInput) elements.nameInput.value = name;
    if (elements.setup) elements.setup.hidden = active;
    if (elements.saveName) {
      elements.saveName.hidden = active;
      elements.saveName.textContent = "Save " + name + " name";
    }
    if (elements.enable) {
      elements.enable.hidden = active;
      elements.enable.textContent = "Configure and enable " + name;
    }
    if (elements.unlock) elements.unlock.hidden = !active;
    if (elements.disable) {
      elements.disable.hidden = !active;
      elements.disable.textContent = "Turn off " + name;
    }
    if (elements.reset) {
      elements.reset.hidden = !active;
      elements.reset.textContent = "Reset " + name + " lock";
    }
    all("[data-mss-suppressed-by-school]").forEach(function (element) { element.hidden = active; });
    if (active && window.speechSynthesis && typeof window.speechSynthesis.cancel === "function") {
      clearPendingNarration();
      safely(function () { window.speechSynthesis.cancel(); });
      narratorRuntime.speaking = false;
    }
    if (elements.boundary && hasContractMethod("getSchoolModeResetBoundary")) {
      var boundary = safely(function () { return contract.getSchoolModeResetBoundary(); }, null);
      if (boundary && boundary.message) elements.boundary.textContent = boundary.message;
    }
    if (elements.status) {
      if (!schoolCryptoAvailable()) {
        elements.status.textContent = "This browser does not provide the local cryptography needed to configure " + name + ".";
      } else if (active) {
        elements.status.textContent = name + " is active in this browser. English is forced and the language, tone, vocabulary, narrator, and schedule controls are hidden until a local unlock-code check succeeds. Saved local schedules stay stored but do not override this mode.";
      } else if (state.settings && state.settings.schoolMode && state.settings.schoolMode.credentialConfigured) {
        elements.status.textContent = "A browser-local unlock-code verifier is ready. Configure and enable " + name + " when you are ready.";
      } else {
        elements.status.textContent = "Set a browser-local unlock code before enabling " + name + ".";
      }
    }
  }

  function refreshAfterSchoolModeChange() {
    hydrateContractState();
    syncSettingsControls();
    applySettingsPresentation();
    applyVocabulary();
    renderVocabularyStatus();
    renderHistory();
  }

  function requestedSchoolModeName(input) {
    var value = input && typeof input.value === "string" ? input.value.trim() : "";
    return value || schoolModeName();
  }

  async function configureAndEnableSchoolMode(elements) {
    var name = requestedSchoolModeName(elements.nameInput);
    var code = elements.setupCode && elements.setupCode.value || "";
    if (!schoolCryptoAvailable()) {
      notify("warning", "This browser cannot create the required local unlock-code verifier.");
      return;
    }
    if (schoolCodeLength(code) < 4 || schoolCodeLength(code) > 64) {
      notify("warning", "Use an unlock code between 4 and 64 characters. The code was not stored.");
      return;
    }
    try {
      var saltBytes = window.crypto.getRandomValues(new Uint8Array(16));
      var verifier = await schoolCodeVerifier(code, saltBytes);
      code = "";
      if (elements.setupCode) elements.setupCode.value = "";
      var credential = hasContractMethod("setSchoolModeCredential") ? safely(function () {
        return contract.setSchoolModeCredential({ algorithm: "SHA-256", salt: bytesToBase64(saltBytes), verifier: verifier });
      }, null) : null;
      if (!credential || credential.ok !== true) {
        notify("warning", (credential && credential.error) || "The browser-local unlock-code verifier could not be saved.");
        return;
      }
      var enabled = hasContractMethod("setSchoolMode") ? safely(function () {
        return contract.setSchoolMode({ enabled: true, name: name });
      }, null) : null;
      if (!enabled || enabled.ok !== true) {
        notify("warning", (enabled && enabled.error) || "The presentation mode could not be enabled.");
        return;
      }
      refreshAfterSchoolModeChange();
      notify("success", name + " is now active in this browser. English is forced until the local unlock code is verified.");
    } catch (_) {
      if (elements.setupCode) elements.setupCode.value = "";
      notify("warning", "The browser-local unlock-code verifier could not be created. Nothing was enabled.");
    }
  }

  async function verifySchoolModeUnlock(elements) {
    var code = elements.unlockCode && elements.unlockCode.value || "";
    if (!schoolCryptoAvailable() || !hasContractMethod("getSchoolModeCredentialSalt") || !hasContractMethod("verifySchoolModeCredential")) {
      return { ok: false, error: "This browser cannot verify the local unlock code." };
    }
    if (Date.now() < nextSchoolUnlockAt) {
      return { ok: false, error: "Please wait briefly before another unlock-code attempt." };
    }
    try {
      var salt = base64ToBytes(contract.getSchoolModeCredentialSalt());
      var verifier = await schoolCodeVerifier(code, salt);
      code = "";
      if (elements.unlockCode) elements.unlockCode.value = "";
      var verdict = contract.verifySchoolModeCredential(verifier);
      if (!verdict || verdict.ok !== true) {
        schoolUnlockFailures += 1;
        nextSchoolUnlockAt = Date.now() + Math.min(30000, schoolUnlockFailures * 1000);
        return { ok: false, error: "The unlock code did not match. This is a local presentation lock; clearing this site's storage is the recovery route if the code is forgotten." };
      }
      schoolUnlockFailures = 0;
      nextSchoolUnlockAt = 0;
      return { ok: true };
    } catch (_) {
      if (elements.unlockCode) elements.unlockCode.value = "";
      return { ok: false, error: "The local unlock-code check could not finish." };
    }
  }

  function installSchoolMode() {
    var elements = schoolModeElements();
    if (!elements.surface) return;
    if (elements.saveName) elements.saveName.addEventListener("click", function () {
      var result = hasContractMethod("setSchoolMode") ? safely(function () {
        return contract.setSchoolMode({ enabled: false, name: requestedSchoolModeName(elements.nameInput) });
      }, null) : null;
      if (!result || result.ok !== true) {
        notify("warning", (result && result.error) || "The browser-local mode name could not be saved.");
        return;
      }
      refreshAfterSchoolModeChange();
      notify("info", schoolModeName() + " is the browser-local mode name for this page.");
    });
    if (elements.enable) elements.enable.addEventListener("click", function () { configureAndEnableSchoolMode(elements); });
    if (elements.disable) elements.disable.addEventListener("click", async function () {
      var verification = await verifySchoolModeUnlock(elements);
      if (!verification.ok) {
        notify("warning", verification.error);
        return;
      }
      var result = hasContractMethod("setSchoolMode") ? safely(function () { return contract.setSchoolMode({ enabled: false, credentialAccepted: true }); }, null) : null;
      if (!result || result.ok !== true) {
        notify("warning", (result && result.error) || "The browser-local presentation mode could not be turned off.");
        return;
      }
      refreshAfterSchoolModeChange();
      notify("success", schoolModeName() + " is off. Your previous browser-local preferences are available again.");
    });
    if (elements.reset) elements.reset.addEventListener("click", async function () {
      var verification = await verifySchoolModeUnlock(elements);
      if (!verification.ok) {
        notify("warning", verification.error);
        return;
      }
      var result = hasContractMethod("clearSchoolModeCredential") ? safely(function () { return contract.clearSchoolModeCredential({ credentialAccepted: true }); }, null) : null;
      if (!result || result.ok !== true) {
        notify("warning", (result && result.error) || "The browser-local presentation lock could not be reset.");
        return;
      }
      refreshAfterSchoolModeChange();
      notify("info", "The browser-local presentation lock and its one-way verifier were reset.");
    });
    renderSchoolModeControls();
  }

  function loadVocabulary(file, input) {
    if (!file) return;
    var reader = new FileReader();
    reader.onerror = function () {
      input.value = "";
      notify("warning", "The vocabulary file could not be read locally. Nothing was applied.");
    };
    reader.onload = function () {
      var validation = validatePersonalVocabularyPayload(reader.result);
      if (!validation || validation.ok !== true) {
        input.value = "";
        restoreVocabulary();
        renderVocabularyStatus();
        notify("warning", "The vocabulary file was invalid or exceeded the local bounds. Nothing was applied.");
        return;
      }
      var canonicalPayload = JSON.stringify(validation.value);
      var result = hasContractMethod("loadPersonalVocabulary") ? safely(function () { return contract.loadPersonalVocabulary(canonicalPayload); }, null) : null;
      if (!result || result.ok !== true) {
        input.value = "";
        restoreVocabulary();
        hydrateContractState();
        renderVocabularyStatus();
        notify("warning", ((result && result.error) || "The vocabulary file was invalid.") + " Nothing was applied.");
        return;
      }
      hydrateContractState();
      applyVocabulary();
      renderVocabularyStatus();
      renderHistory();
      notify("success", "A validated personal vocabulary preview is active in this browser. The file was not uploaded and its name or path was not retained.");
    };
    reader.readAsArrayBuffer(file);
  }

  function regexProblem(pattern) {
    if (pattern.length > 160) return "Patterns are limited to 160 characters in this preview.";
    if (/(?:\((?:[^()]|\([^()]*\))*[+*][^()]*\))[+*{]/.test(pattern) || /\(\.\*\)[+*{]|\(\.\+\)[+*{]/.test(pattern)) {
      return "This preview rejects nested quantified groups to keep the page responsive.";
    }
    return "";
  }

  function expression(pattern, flags) {
    var problem = regexProblem(pattern);
    if (problem) return { error: problem };
    try { return { regex: new RegExp(pattern, flags) }; } catch (error) { return { error: error.message || "The regular expression is invalid." }; }
  }

  function appendPattern(input, fragment) {
    var start = typeof input.selectionStart === "number" ? input.selectionStart : input.value.length;
    var end = typeof input.selectionEnd === "number" ? input.selectionEnd : start;
    input.value = input.value.slice(0, start) + fragment + input.value.slice(end);
    input.focus();
    input.setSelectionRange(start + fragment.length, start + fragment.length);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function textOf(element) {
    if (!element || element.hidden || element.closest("[hidden]")) return "";
    var copy = element.cloneNode(true);
    all("[hidden]", copy).forEach(function (hidden) { hidden.remove(); });
    return (copy.textContent || "").replace(/\s+/g, " ").trim();
  }

  function makeRegexBuilder(input, options) {
    if (!input || input.getAttribute("data-mss-regex-ready") === "true") return;
    input.setAttribute("data-mss-regex-ready", "true");
    var scope = options.scope || input.closest("[data-contract-surface]") || main || body;
    var candidates = options.candidates || function () { return []; };
    var globalResults = options.globalResults;
    var labelText = options.label || "this search";
    var host = input.closest(".preview-search, .history-controls, .converter-category-search") || input.parentElement || scope;
    var existing = one('button[aria-label*="regular expression builder"]', host);
    var opener = existing || button(".*", function () {});
    opener.disabled = false;
    opener.setAttribute("aria-label", "Open regular expression builder for " + labelText);
    opener.setAttribute("aria-expanded", "false");
    if (!existing) host.appendChild(opener);

    var builder = made("section");
    builder.setAttribute("data-mss-regex-builder", "true");
    builder.hidden = true;
    var heading = made("h3");
    heading.textContent = "Regular expression builder";
    var modeLabel = made("label");
    var mode = made("input");
    mode.type = "checkbox";
    modeLabel.append(mode, document.createTextNode(" Use regular expression mode"));
    var patternLabel = made("label");
    patternLabel.textContent = "Pattern";
    var pattern = made("input");
    pattern.type = "text";
    pattern.maxLength = 160;
    pattern.placeholder = "Pattern";
    patternLabel.appendChild(pattern);
    var flagsFieldset = made("fieldset");
    var legend = made("legend");
    legend.textContent = "Flags";
    flagsFieldset.appendChild(legend);
    var flags = {};
    ["i", "m", "s", "u"].forEach(function (flag) {
      var flagLabel = made("label");
      var checkbox = made("input");
      checkbox.type = "checkbox";
      checkbox.checked = flag === "i";
      flagLabel.append(checkbox, document.createTextNode(" " + flag));
      flagsFieldset.appendChild(flagLabel);
      flags[flag] = checkbox;
    });
    var helpers = made("div");
    helpers.setAttribute("role", "group");
    helpers.setAttribute("aria-label", "Regex construction helpers");
    [["Literal", "text"], ["Class", "[A-Za-z0-9]"], ["Start", "^"], ["End", "$"], ["Group", "()"], ["Either", "|"], ["One or more", "+"], ["Optional", "?"]].forEach(function (pair) {
      helpers.appendChild(button(pair[0], function () { appendPattern(pattern, pair[1]); }));
    });
    var sampleLabel = made("label");
    sampleLabel.textContent = "Sample text (evaluated locally)";
    var sample = made("textarea");
    sample.rows = 3;
    sample.maxLength = 4000;
    sample.value = textOf(scope).slice(0, 1000);
    sampleLabel.appendChild(sample);
    var status = made("output");
    status.setAttribute("aria-live", "polite");
    builder.append(heading, modeLabel, patternLabel, flagsFieldset, helpers, sampleLabel, status);
    host.appendChild(builder);

    function selectedFlags() {
      return Object.keys(flags).filter(function (flag) { return flags[flag].checked; }).join("");
    }

    function hasMatch(text) {
      if (!mode.checked) {
        var needle = input.value.trim().toLocaleLowerCase();
        return !needle || text.toLocaleLowerCase().indexOf(needle) !== -1;
      }
      var compiled = expression(pattern.value, selectedFlags());
      if (compiled.error) return false;
      compiled.regex.lastIndex = 0;
      return compiled.regex.test(text);
    }

    function refresh() {
      var items = candidates();
      var compiled = mode.checked ? expression(pattern.value, selectedFlags()) : null;
      if (compiled && compiled.error) {
        status.textContent = compiled.error;
        if (!globalResults) items.forEach(function (item) { item.hidden = false; });
        return;
      }
      if (globalResults) {
        globalResults.replaceChildren();
        if (!input.value.trim() && !mode.checked) {
          status.textContent = "Enter a term, or choose regular expression mode.";
        } else {
          var matches = items.filter(function (item) { return hasMatch(textOf(item)); });
          status.textContent = matches.length + " matching feature preview" + (matches.length === 1 ? "." : "s.");
          if (!matches.length) globalResults.textContent = "No matching feature preview was found.";
          matches.slice(0, 12).forEach(function (item) {
            var target = typeof options.targetFor === "function" ? options.targetFor(item) : (item.id || (item.closest("[id]") && item.closest("[id]").id));
            var heading = one("h2, h3", item);
            var resultButton = button((heading ? heading.textContent : textOf(item)).trim(), function () {
              if (target) activate(target, resultButton);
            });
            resultButton.disabled = !target;
            globalResults.appendChild(resultButton);
          });
        }
      } else {
        var active = mode.checked ? Boolean(pattern.value) : Boolean(input.value.trim());
        items.forEach(function (item) { item.hidden = active && !hasMatch(textOf(item)); });
        var count = items.filter(function (item) { return !item.hidden; }).length;
        status.textContent = active ? count + " local match" + (count === 1 ? "." : "es.") : "Plain-text search is ready.";
      }
      if (mode.checked && pattern.value) {
        var sampleExpression = expression(pattern.value, selectedFlags());
        if (!sampleExpression.error) {
          sampleExpression.regex.lastIndex = 0;
          var hit = sampleExpression.regex.exec(sample.value);
          status.textContent += hit ? " Sample match: " + hit[0] + "." : " No sample match.";
        }
      }
      if (hasContractMethod("evaluateRegex") && mode.checked && pattern.value) {
        safely(function () { contract.evaluateRegex({ pattern: pattern.value, flags: selectedFlags(), sample: sample.value }); });
      }
    }

    opener.addEventListener("click", function () {
      builder.hidden = !builder.hidden;
      opener.setAttribute("aria-expanded", String(!builder.hidden));
      if (!builder.hidden) pattern.focus();
    });
    input.addEventListener("input", function () {
      if (!mode.checked) pattern.value = input.value;
      refresh();
    });
    mode.addEventListener("change", function () {
      if (mode.checked && !pattern.value) pattern.value = input.value;
      refresh();
    });
    pattern.addEventListener("input", function () {
      if (mode.checked) input.value = pattern.value;
      refresh();
    });
    sample.addEventListener("input", refresh);
    Object.keys(flags).forEach(function (flag) { flags[flag].addEventListener("change", refresh); });
    refresh();
  }

  function installSearches() {
    if (!main) return;
    var globalHook = one('[data-contract-hook="global-search-regex"]');
    var globalInput = globalHook && one('input[type="search"]', globalHook);
    var globalResults = globalHook && one("[data-mss-global-results]", globalHook);
    if (!globalInput) {
      globalHook = made("section");
      globalHook.setAttribute("data-contract-hook", "global-search-regex");
      var label = made("label");
      label.textContent = "Find a feature preview";
      globalInput = made("input");
      globalInput.type = "search";
      globalInput.placeholder = "Search this public product preview";
      label.appendChild(globalInput);
      globalResults = made("div");
      globalResults.setAttribute("data-mss-global-results", "true");
      globalResults.setAttribute("role", "region");
      globalResults.setAttribute("aria-live", "polite");
      globalHook.append(label, globalResults);
      main.insertBefore(globalHook, main.firstChild);
    } else if (!globalResults) {
      globalResults = made("div");
      globalResults.setAttribute("data-mss-global-results", "true");
      globalResults.setAttribute("role", "region");
      globalResults.setAttribute("aria-live", "polite");
      globalHook.appendChild(globalResults);
    }
    makeRegexBuilder(globalInput, {
      label: "feature previews",
      globalResults: globalResults,
      candidates: function () { return all("[data-contract-surface], .feature-card, .detail-section, .automatic-section"); }
    });

    all('input[type="search"]').filter(function (input) {
      return input !== globalInput && input.getAttribute(generated) !== "true";
    }).forEach(function (input) {
      var scheduleSearch = input.closest('[data-contract-hook="scheduled-settings-search-regex"]');
      var surface = scheduleSearch ? input.closest('[data-contract-hook="scheduled-settings"]') : input.closest("[data-contract-surface]") || input.closest("section") || main;
      makeRegexBuilder(input, {
        label: (input.closest("label") && input.closest("label").textContent || "this surface").trim(),
        scope: surface,
        candidates: function () {
          if (scheduleSearch) return all(".schedule-list > li", surface);
          return all("label, a, li, article, .auth-card, .format-catalog span, .ollama-state, .empty-state", surface).filter(function (item) {
            return item.getAttribute(generated) !== "true";
          });
        }
      });
    });
  }

  function installTabsAndArticles() {
    var workspace = one("[data-mss-tab-workspace]");
    var tabList = workspace && one(".feature-tabs", workspace);
    var sourceTabs = all(".feature-tab", tabList);
    if (!workspace || !tabList || !sourceTabs.length) return;

    var definitions = sourceTabs.map(function (tab, index) {
      var panelId = (tab.getAttribute("href") || "").replace(/^#/, "");
      return {
        id: tab.getAttribute("data-mss-tab-id") || "feature-tab-" + index,
        label: (tab.textContent || panelId || "Feature preview").trim(),
        panelId: panelId,
        element: tab
      };
    }).filter(function (definition) { return definition.panelId && document.getElementById(definition.panelId); });
    var definitionById = {};
    var definitionByPanel = {};
    definitions.forEach(function (definition) {
      definitionById[definition.id] = definition;
      definitionByPanel[definition.panelId] = definition;
    });
    var groupDefinitions = [
      { id: "tab-group-workspace", label: "Workspace", color: "#3f7cff", tabs: ["feature-status", "feature-settings", "feature-docs"] },
      { id: "tab-group-local-tools", label: "Local tools", color: "#2f9a71", tabs: ["feature-converter", "feature-authenticator", "feature-ollama", "feature-history"] },
      { id: "tab-group-release", label: "Release information", color: "#b97823", tabs: ["feature-notifications", "feature-downloads"] }
    ];
    var defaultGroupForTab = {};
    groupDefinitions.forEach(function (group) {
      group.tabs.forEach(function (id) { defaultGroupForTab[id] = group.id; });
    });
    var controls = null;
    var dockSelect = null;
    var overflowList = null;
    var stripSearch = null;
    var groupSearch = null;
    var masterSearch = null;
    var masterResults = null;
    var masterSources = null;
    var groupResults = null;
    var groupName = null;
    var manageList = null;
    var responsiveQuery = typeof window.matchMedia === "function" ? window.matchMedia("(max-width: 820px)") : null;

    function snapshot() {
      return tabSnapshot();
    }

    function ensureTabState() {
      if (!hasContractMethod("registerTab")) return;
      var current = snapshot();
      if (!current) return;
      var knownGroups = current.groups.map(function (group) { return group.id; });
      groupDefinitions.forEach(function (group) {
        if (knownGroups.indexOf(group.id) === -1 && hasContractMethod("createTabGroup")) {
          safely(function () { return contract.createTabGroup(group); });
        }
      });
      current = snapshot() || current;
      definitions.forEach(function (definition) {
        var existing = current.tabs.filter(function (tab) { return tab.id === definition.id; })[0];
        if (!existing) {
          safely(function () {
            return contract.registerTab({
              id: definition.id,
              label: definition.label,
              panelId: definition.panelId,
              groupId: defaultGroupForTab[definition.id] || null,
              pinned: definition.id === "feature-status",
              closable: false
            });
          });
        } else if (!existing.groupId && defaultGroupForTab[definition.id]) {
          safely(function () { return contract.updateTab(definition.id, { groupId: defaultGroupForTab[definition.id] }); });
        }
      });
      hydrateContractState();
    }

    function responsiveOrientation(tabState) {
      if (responsiveQuery && responsiveQuery.matches) return "horizontal";
      return tabState && tabState.orientation || "vertical";
    }

    function targetPanel(id) {
      var definition = definitionById[id];
      return definition && document.getElementById(definition.panelId);
    }

    function tabRecords(tabState) {
      return tabState && Array.isArray(tabState.tabs) ? tabState.tabs.filter(function (tab) { return definitionById[tab.id]; }) : [];
    }

    function selectTab(id, focusPanel) {
      if (!definitionById[id]) return;
      if (hasContractMethod("setActiveTab")) {
        var result = safely(function () { return contract.setActiveTab(id); }, null);
        if (!result || result.ok !== true) {
          notify("warning", (result && result.error) || "The selected tab could not be saved locally.");
          return;
        }
        hydrateContractState();
      }
      render();
      if (focusPanel) {
        var panel = targetPanel(id);
        if (panel) focus(panel);
      }
      var definition = definitionById[id];
      live("Opened " + definition.label + " in this browser-local preview.");
    }

    function focusTabFrom(currentId, direction) {
      var stateSnapshot = snapshot();
      var records = tabRecords(stateSnapshot).filter(function (record) {
        var group = stateSnapshot.groups.filter(function (item) { return item.id === record.groupId; })[0];
        return !(group && group.collapsed && record.id !== stateSnapshot.activeId);
      });
      if (!records.length) return;
      var currentIndex = records.map(function (record) { return record.id; }).indexOf(currentId);
      var next = records[(currentIndex + direction + records.length) % records.length];
      if (!next) return;
      selectTab(next.id, false);
      var definition = definitionById[next.id];
      if (definition) definition.element.focus();
    }

    function wireTab(definition) {
      var tab = definition.element;
      if (tab.getAttribute("data-mss-tab-wired") === "true") return;
      tab.setAttribute("data-mss-tab-wired", "true");
      tab.addEventListener("click", function (event) {
        event.preventDefault();
        selectTab(definition.id, true);
      });
      tab.addEventListener("keydown", function (event) {
        var stateSnapshot = snapshot();
        var orientation = responsiveOrientation(stateSnapshot);
        var next = (orientation === "vertical" && event.key === "ArrowDown") || (orientation === "horizontal" && event.key === "ArrowRight");
        var previous = (orientation === "vertical" && event.key === "ArrowUp") || (orientation === "horizontal" && event.key === "ArrowLeft");
        if (next || previous) {
          event.preventDefault();
          focusTabFrom(definition.id, next ? 1 : -1);
        } else if (event.key === "Home" || event.key === "End") {
          event.preventDefault();
          var records = tabRecords(stateSnapshot);
          var target = event.key === "Home" ? records[0] : records[records.length - 1];
          if (target) {
            selectTab(target.id, false);
            definitionById[target.id].element.focus();
          }
        } else if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          selectTab(definition.id, true);
        }
      });
    }

    function setDock(value) {
      var result = hasContractMethod("setTabDock") ? safely(function () { return contract.setTabDock(value); }, null) : null;
      if (!result || result.ok !== true) {
        notify("warning", (result && result.error) || "The tab dock could not be saved locally.");
        return;
      }
      hydrateContractState();
      render();
      notify("info", "Feature tab dock updated for this browser-local preview.");
    }

    function updateGroup(group) {
      var result = hasContractMethod("createTabGroup") ? safely(function () { return contract.createTabGroup(group); }, null) : null;
      if (!result || result.ok !== true) {
        notify("warning", (result && result.error) || "The tab group could not be saved locally.");
        return;
      }
      hydrateContractState();
      render();
    }

    function renderOverflow(tabState, records) {
      if (!overflowList) return;
      overflowList.replaceChildren();
      records.forEach(function (record) {
        var definition = definitionById[record.id];
        var item = button((record.pinned ? "Pinned · " : "") + definition.label, function () { selectTab(record.id, true); });
        item.setAttribute("data-mss-overflow-tab", record.id);
        item.setAttribute("aria-current", String(record.id === tabState.activeId));
        overflowList.appendChild(item);
      });
      if (!records.length) overflowList.textContent = "No feature tabs are registered in this browser-local state.";
    }

    function renderGroups(tabState, records) {
      if (!groupResults) return;
      groupResults.replaceChildren();
      tabState.groups.forEach(function (group) {
        var count = records.filter(function (record) { return record.groupId === group.id; }).length;
        var card = made("article");
        card.className = "tab-group-result";
        card.setAttribute("data-mss-tab-group-result", group.id);
        card.textContent = group.label + " · " + count + " tab" + (count === 1 ? "" : "s") + (group.collapsed ? " · collapsed" : "");
        groupResults.appendChild(card);
      });
      if (!tabState.groups.length) groupResults.textContent = "No browser-local tab groups are configured.";
    }

    function renderMasterSources(records) {
      if (!masterSources) return;
      masterSources.replaceChildren();
      records.forEach(function (record) {
        var definition = definitionById[record.id];
        var source = made("span");
        source.className = "visually-hidden";
        source.setAttribute("data-mss-tab-search-source", record.panelId || definition.panelId);
        source.textContent = definition.label + " " + (record.pinned ? "pinned " : "") + (record.groupId || "ungrouped");
        masterSources.appendChild(source);
      });
    }

    function renderManagement(tabState, records) {
      if (!manageList) return;
      manageList.replaceChildren();
      records.forEach(function (record, index) {
        var definition = definitionById[record.id];
        var row = made("li");
        row.className = "tab-management-row";
        var opener = button(definition.label, function () { selectTab(record.id, true); });
        opener.className = "tab-management-open";
        var pin = button(record.pinned ? "Unpin" : "Pin", function () {
          var result = hasContractMethod("updateTab") ? safely(function () { return contract.updateTab(record.id, { pinned: !record.pinned }); }, null) : null;
          if (!result || result.ok !== true) notify("warning", (result && result.error) || "The tab pin state could not be saved locally.");
          else { hydrateContractState(); render(); }
        });
        var previous = button("Move earlier", function () {
          var result = hasContractMethod("moveTab") ? safely(function () { return contract.moveTab(record.id, Math.max(0, index - 1)); }, null) : null;
          if (!result || result.ok !== true) notify("warning", (result && result.error) || "The tab could not be reordered locally.");
          else { hydrateContractState(); render(); }
        });
        previous.disabled = index === 0;
        var next = button("Move later", function () {
          var result = hasContractMethod("moveTab") ? safely(function () { return contract.moveTab(record.id, Math.min(records.length - 1, index + 1)); }, null) : null;
          if (!result || result.ok !== true) notify("warning", (result && result.error) || "The tab could not be reordered locally.");
          else { hydrateContractState(); render(); }
        });
        next.disabled = index === records.length - 1;
        var groupLabel = made("label");
        groupLabel.textContent = "Group";
        var groupPicker = made("select");
        var ungrouped = document.createElement("option");
        ungrouped.value = "";
        ungrouped.textContent = "Ungrouped";
        groupPicker.appendChild(ungrouped);
        tabState.groups.forEach(function (group) {
          var option = document.createElement("option");
          option.value = group.id;
          option.textContent = group.label;
          groupPicker.appendChild(option);
        });
        groupPicker.value = record.groupId || "";
        groupPicker.setAttribute("aria-label", "Move " + definition.label + " into a tab group");
        groupPicker.addEventListener("change", function () {
          var result = hasContractMethod("updateTab") ? safely(function () { return contract.updateTab(record.id, { groupId: groupPicker.value || null }); }, null) : null;
          if (!result || result.ok !== true) notify("warning", (result && result.error) || "The tab group could not be saved locally.");
          else { hydrateContractState(); render(); }
        });
        groupLabel.appendChild(groupPicker);
        row.append(opener, pin, previous, next, groupLabel);
        manageList.appendChild(row);
      });
    }

    function appendGroupHeader(group, tabState) {
      var header = made("div");
      header.className = "feature-tab-group-header";
      header.setAttribute("data-mss-tab-group-header", group.id);
      header.style.setProperty("--mss-group-color", group.color || "#3f7cff");
      var toggle = button((group.collapsed ? "Expand " : "Collapse ") + group.label, function () {
        updateGroup({ id: group.id, label: group.label, color: group.color, collapsed: !group.collapsed });
      });
      toggle.setAttribute("aria-expanded", String(!group.collapsed));
      header.appendChild(toggle);
      tabList.appendChild(header);
    }

    function appendTab(record, tabState) {
      var definition = definitionById[record.id];
      if (!definition) return;
      var tab = definition.element;
      var group = tabState.groups.filter(function (item) { return item.id === record.groupId; })[0];
      var isActive = record.id === tabState.activeId;
      var isCollapsed = Boolean(group && group.collapsed && !isActive);
      var itemAppearance = record.appearance || {};
      var stripAppearance = tabState.appearance || {};
      var customAccent = safeHexColor(itemAppearance.accent, "");
      tab.setAttribute("role", "tab");
      tab.id = record.tabId || record.id + "-tab";
      tab.setAttribute("aria-controls", definition.panelId);
      tab.setAttribute("aria-selected", String(isActive));
      tab.setAttribute("aria-posinset", String(record.ariaPosInSet || 1));
      tab.setAttribute("aria-setsize", String(record.ariaSetSize || tabState.tabs.length));
      tab.setAttribute("aria-current", isActive ? "page" : "false");
      tab.setAttribute("tabindex", isActive ? "0" : "-1");
      tab.toggleAttribute("data-mss-active-tab", isActive);
      tab.toggleAttribute("data-mss-pinned-tab", Boolean(record.pinned));
      tab.hidden = isCollapsed;
      tab.style.setProperty("--mss-tab-item-accent", customAccent || stripAppearance.accent || "#3f7cff");
      var tabScale = itemAppearance.fontScale && itemAppearance.fontScale !== 1 ? itemAppearance.fontScale : stripAppearance.fontScale || 1;
      var pageScale = state.settings && state.settings.appearance && state.settings.appearance.font ? state.settings.appearance.font.scale : 1;
      tab.style.setProperty("--mss-tab-item-scale", String(tabScale));
      tab.style.setProperty("--mss-tab-item-font-size", (16 * pageScale * .82 * tabScale).toFixed(2) + "px");
      tab.style.setProperty("--mss-tab-item-weight", String(itemAppearance.fontWeight && itemAppearance.fontWeight !== 600 ? itemAppearance.fontWeight : stripAppearance.fontWeight || 600));
      wireTab(definition);
      tabList.appendChild(tab);
    }

    function render() {
      var tabState = snapshot();
      if (!tabState) return;
      var records = tabRecords(tabState);
      var activeId = tabState.activeId && definitionById[tabState.activeId] ? tabState.activeId : (records[0] && records[0].id);
      if (activeId && activeId !== tabState.activeId && hasContractMethod("setActiveTab")) {
        safely(function () { contract.setActiveTab(activeId); });
        tabState = snapshot() || tabState;
        records = tabRecords(tabState);
      }
      var orientation = responsiveOrientation(tabState);
      workspace.dataset.mssTabDock = tabState.dock || "left";
      workspace.dataset.mssTabOrientation = orientation;
      workspace.dataset.mssTabNarrow = responsiveQuery && responsiveQuery.matches ? "true" : "false";
      workspace.style.setProperty("--mss-tab-accent", safeHexColor(tabState.appearance && tabState.appearance.accent, "#3f7cff"));
      workspace.style.setProperty("--mss-tab-font-scale", String(tabState.appearance && tabState.appearance.fontScale || 1));
      workspace.style.setProperty("--mss-tab-font-weight", String(tabState.appearance && tabState.appearance.fontWeight || 600));
      tabList.setAttribute("role", "tablist");
      tabList.setAttribute("aria-label", "Feature previews");
      tabList.setAttribute("aria-orientation", orientation);
      tabList.replaceChildren();
      var pinned = records.filter(function (record) { return record.pinned; });
      if (pinned.length) {
        var pinnedHeader = made("div");
        pinnedHeader.className = "feature-tab-group-header feature-tab-group-header--pinned";
        pinnedHeader.textContent = "Pinned";
        tabList.appendChild(pinnedHeader);
        pinned.forEach(function (record) { appendTab(record, tabState); });
      }
      tabState.groups.forEach(function (group) {
        var grouped = records.filter(function (record) { return !record.pinned && record.groupId === group.id; });
        if (!grouped.length) return;
        appendGroupHeader(group, tabState);
        grouped.forEach(function (record) { appendTab(record, tabState); });
      });
      var ungrouped = records.filter(function (record) { return !record.pinned && !record.groupId; });
      if (ungrouped.length) {
        var ungroupedHeader = made("div");
        ungroupedHeader.className = "feature-tab-group-header";
        ungroupedHeader.textContent = "Ungrouped";
        tabList.appendChild(ungroupedHeader);
        ungrouped.forEach(function (record) { appendTab(record, tabState); });
      }
      definitions.forEach(function (definition) {
        var panel = document.getElementById(definition.panelId);
        var record = records.filter(function (item) { return item.id === definition.id; })[0];
        if (!panel || !record) return;
        var selected = record.id === tabState.activeId;
        panel.setAttribute("role", "tabpanel");
        panel.setAttribute("aria-labelledby", record.tabId || record.id + "-tab");
        panel.toggleAttribute("hidden", !selected);
        panel.toggleAttribute("data-mss-active-surface", selected);
      });
      if (dockSelect) dockSelect.value = tabState.dock || "left";
      renderOverflow(tabState, records);
      renderGroups(tabState, records);
      renderMasterSources(records);
      renderManagement(tabState, records);
      renderAppearanceEditor();
    }

    function createControls() {
      controls = made("section");
      controls.className = "tab-workspace-controls";
      controls.setAttribute("aria-label", "Feature tab controls");
      var dockLabel = made("label");
      dockLabel.textContent = "Dock feature tabs";
      dockSelect = made("select");
      [["left", "Left"], ["right", "Right"], ["top", "Top"], ["bottom", "Bottom"]].forEach(function (pair) {
        var option = document.createElement("option");
        option.value = pair[0];
        option.textContent = pair[1];
        dockSelect.appendChild(option);
      });
      dockSelect.setAttribute("aria-label", "Dock feature tabs at an edge");
      dockSelect.addEventListener("change", function () { setDock(dockSelect.value); });
      dockLabel.appendChild(dockSelect);

      var overflow = made("details");
      overflow.className = "tab-overflow";
      var overflowSummary = made("summary");
      overflowSummary.textContent = "All feature tabs";
      overflowList = made("div");
      overflowList.className = "tab-overflow-list";
      overflow.append(overflowSummary, overflowList);

      var discovery = made("section");
      discovery.className = "tab-discovery";
      var discoveryHeading = made("h3");
      discoveryHeading.textContent = "Find and organize feature tabs";
      var stripLabel = made("label");
      stripLabel.textContent = "Search this tab strip";
      stripSearch = made("input");
      stripSearch.type = "search";
      stripSearch.placeholder = "Find a visible feature tab";
      stripLabel.appendChild(stripSearch);
      var groupsLabel = made("label");
      groupsLabel.textContent = "Search tab groups";
      groupSearch = made("input");
      groupSearch.type = "search";
      groupSearch.placeholder = "Find a tab group";
      groupsLabel.appendChild(groupSearch);
      groupResults = made("div");
      groupResults.className = "tab-group-results";
      groupResults.setAttribute("aria-live", "polite");
      var masterLabel = made("label");
      masterLabel.textContent = "Search all feature tabs";
      masterSearch = made("input");
      masterSearch.type = "search";
      masterSearch.placeholder = "Find a feature tab across groups";
      masterLabel.appendChild(masterSearch);
      masterResults = made("div");
      masterResults.className = "tab-master-results";
      masterResults.setAttribute("aria-live", "polite");
      masterSources = made("div");
      masterSources.className = "visually-hidden";
      var createLabel = made("label");
      createLabel.textContent = "New tab group";
      groupName = made("input");
      groupName.type = "text";
      groupName.maxLength = 120;
      groupName.placeholder = "Name a browser-local group";
      createLabel.appendChild(groupName);
      var createButton = button("Create tab group", function () {
        var label = (groupName.value || "").trim();
        if (!label) {
          notify("warning", "Enter a visible tab-group name before creating it.");
          groupName.focus();
          return;
        }
        var result = hasContractMethod("createTabGroup") ? safely(function () { return contract.createTabGroup({ label: label, color: "#3f7cff", collapsed: false }); }, null) : null;
        if (!result || result.ok !== true) notify("warning", (result && result.error) || "The tab group could not be created locally.");
        else { groupName.value = ""; hydrateContractState(); render(); notify("info", "Browser-local tab group created."); }
      });
      discovery.append(discoveryHeading, stripLabel, groupsLabel, groupResults, masterLabel, masterResults, masterSources, createLabel, createButton);

      var manager = made("section");
      manager.className = "tab-manager";
      var managerHeading = made("h3");
      managerHeading.textContent = "Manage feature tabs";
      var managerCopy = made("p");
      managerCopy.textContent = "Pin, reorder, or place a browser-local feature tab in a group. These controls do not close a desktop document or act on a server.";
      manageList = made("ul");
      manageList.className = "tab-management-list";
      manager.append(managerHeading, managerCopy, manageList);
      controls.append(dockLabel, overflow, discovery, manager);
      workspace.insertBefore(controls, tabList);

      makeRegexBuilder(stripSearch, {
        label: "this tab strip",
        scope: discovery,
        candidates: function () { return sourceTabs.filter(function (tab) { return !tab.hidden; }); }
      });
      makeRegexBuilder(groupSearch, {
        label: "tab groups",
        scope: discovery,
        candidates: function () { return all("[data-mss-tab-group-result]", groupResults); }
      });
      makeRegexBuilder(masterSearch, {
        label: "all feature tabs",
        scope: discovery,
        globalResults: masterResults,
        candidates: function () { return all("[data-mss-tab-search-source]", masterSources); },
        targetFor: function (item) { return item.getAttribute("data-mss-tab-search-source"); }
      });
    }

    ensureTabState();
    createControls();
    definitions.forEach(function (definition) {
      if (hasContractMethod("registerCommand")) {
        safely(function () {
          contract.registerCommand({
            id: "destination-" + definition.panelId,
            title: definition.label,
            description: "Open this browser-local product preview.",
            group: "Browser-local destinations",
            elementId: definition.panelId,
            keywords: [definition.panelId, "preview", "local", "tab"]
          });
        });
      }
    });
    tabWorkspace = {
      hasPanel: function (panelId) { return Boolean(definitionByPanel[panelId]); },
      selectPanel: function (panelId) {
        var definition = definitionByPanel[panelId];
        if (definition) selectTab(definition.id, false);
      },
      render: render
    };
    if (responsiveQuery) {
      var updateResponsive = function () { render(); };
      if (typeof responsiveQuery.addEventListener === "function") responsiveQuery.addEventListener("change", updateResponsive);
      else if (typeof responsiveQuery.addListener === "function") responsiveQuery.addListener(updateResponsive);
    }
    render();
    all('[data-contract-hook="documentation-tabs"] a[href^="#"], .feature-card a[href^="#"]').forEach(function (link) {
      link.addEventListener("click", function () {
        var targetId = (link.getAttribute("href") || "").replace(/^#/, "");
        if (targetId) window.setTimeout(function () { activate(targetId, link); }, 0);
      });
    });
  }

  function makeListInteractive(target, title) {
    if (!target || target.getAttribute("data-mss-list-ready") === "true") return;
    target.setAttribute("data-mss-list-ready", "true");
    var parent = target.parentElement;
    if (!parent) return;
    var controls = made("div");
    controls.setAttribute("role", "group");
    controls.setAttribute("aria-label", title + " controls");
    var collapsed = false;
    var toggle = button("Collapse " + title, function () {
      collapsed = !collapsed;
      target.hidden = collapsed;
      toggle.textContent = (collapsed ? "Expand " : "Collapse ") + title;
      toggle.setAttribute("aria-expanded", String(!collapsed));
    });
    toggle.setAttribute("aria-expanded", "true");
    var label = made("label");
    label.textContent = "Filter " + title;
    var input = made("input");
    input.type = "search";
    input.placeholder = "Filter this list";
    label.appendChild(input);
    controls.append(toggle, label);
    parent.insertBefore(controls, target);
    makeRegexBuilder(input, {
      label: title,
      scope: parent,
      candidates: function () { return all("a, li, span", target); }
    });
  }

  function installCollapsibleLists() {
    makeListInteractive(one('[data-contract-hook="documentation-tabs"]'), "documentation articles");
    makeListInteractive(one('[data-contract-hook="notification-history"]'), "notification examples");
  }

  function humanSize(bytes) {
    if (!bytes) return "0 bytes";
    if (bytes < 1024) return bytes + " bytes";
    if (bytes < 1048576) return Math.round(bytes / 1024) + " KB";
    return (bytes / 1048576).toFixed(1) + " MB";
  }

  function installConverterPlanner() {
    var surface = one('[data-contract-surface="file-converter"]');
    var picker = one('[data-contract-hook="converter-file-picker"] input[type="file"]', surface);
    var queueHost = one("[data-mss-converter-queue]", surface);
    var catalogHost = one("[data-mss-converter-catalog]", surface);
    var historyHost = one("[data-mss-converter-history]", surface);
    var statusHost = one("[data-mss-converter-status]", surface);
    var queueCountHost = one("[data-mss-converter-queue-count]", surface);
    var clearHistory = one("[data-mss-converter-clear-history]", surface);
    if (!surface || !picker || !queueHost || !catalogHost || !historyHost || one("[data-mss-converter-ready]", surface)) return;
    surface.setAttribute("data-mss-converter-ready", "true");

    var limits = contract && contract.limits ? contract.limits : {};
    var inputLimit = Number(limits.conversionInputBytes) || (1024 * 1024);
    var sniffLimit = Number(limits.conversionSniffBytes) || 512;
    var selectionLimit = Number(limits.conversionSelectionFiles) || 12;
    var sessionLimit = Number(limits.conversionSessionQueue) || 24;
    var outputLimit = Number(limits.conversionOutputBytes) || (2 * 1024 * 1024);
    var rowLimit = 5000;
    var columnLimit = 80;
    var depthLimit = 16;
    var catalogCategories = ["Documents/PDF", "Images", "Audio", "Video", "Archives", "Structured Data/Spreadsheets", "Code/Text", "Binary Encodings"];
    var queue = [];
    var selecting = false;

    var targetDefinitions = Object.freeze({
      text: { id: "text", label: "UTF-8 text", targetType: "text/plain", targetFormat: "UTF-8 text", extension: "txt", mime: "text/plain;charset=utf-8", adapterId: "code-text-utf8" },
      json: { id: "json", label: "JSON", targetType: "application/json", targetFormat: "JSON", extension: "json", mime: "application/json;charset=utf-8", adapterId: "structured-utf8" },
      csv: { id: "csv", label: "CSV", targetType: "text/csv", targetFormat: "CSV", extension: "csv", mime: "text/csv;charset=utf-8", adapterId: "structured-utf8" },
      tsv: { id: "tsv", label: "TSV", targetType: "text/tab-separated-values", targetFormat: "TSV", extension: "tsv", mime: "text/tab-separated-values;charset=utf-8", adapterId: "structured-utf8" },
      yaml: { id: "yaml", label: "YAML-style text", targetType: "text/yaml", targetFormat: "YAML-style text", extension: "yaml", mime: "text/yaml;charset=utf-8", adapterId: "structured-utf8" },
      base64: { id: "base64", label: "Base64 text (encoding)", targetType: "text/plain", targetFormat: "Base64 text", extension: "base64.txt", mime: "text/plain;charset=utf-8", adapterId: "binary-base64" },
      hex: { id: "hex", label: "Hex text (encoding)", targetType: "text/plain", targetFormat: "Hex text", extension: "hex.txt", mime: "text/plain;charset=utf-8", adapterId: "binary-hex" }
    });

    function setStatus(message) {
      if (statusHost) statusHost.textContent = message;
    }

    function safeFileLabel(value) {
      var text = String(value || "").replace(/[\u0000-\u001f\u007f]/g, "");
      var parts = text.split(/[\\/]/);
      return (parts[parts.length - 1] || "local-file").trim().slice(0, 160) || "local-file";
    }

    function currentAdapters() {
      if (hasContractMethod("getFileAdapters")) {
        var result = safely(function () { return contract.getFileAdapters(); }, []);
        if (Array.isArray(result)) return result;
      }
      return [];
    }

    function adapterById(id) {
      return currentAdapters().find(function (adapter) { return adapter.id === id; }) || null;
    }

    function adapterAvailable(id) {
      var adapter = adapterById(id);
      return Boolean(adapter && adapter.enabled === true && adapter.bundled === true);
    }

    function sourceBytes(file) {
      return Number(file && file.size) || 0;
    }

    function hasPrefix(bytes, prefix, offset) {
      var start = offset || 0;
      if (!bytes || bytes.length < start + prefix.length) return false;
      return prefix.every(function (value, index) { return bytes[start + index] === value; });
    }

    function ascii(bytes, start, length) {
      var result = "";
      var stop = Math.min(bytes.length, start + length);
      for (var index = start; index < stop; index += 1) result += String.fromCharCode(bytes[index]);
      return result;
    }

    function decodeUtf8(bytes) {
      if (typeof window.TextDecoder !== "function") throw new Error("Text decoding is unavailable in this browser.");
      return new window.TextDecoder("utf-8", { fatal: true }).decode(bytes);
    }

    function looksLikeText(text) {
      if (text.indexOf("\u0000") !== -1) return false;
      var controls = 0;
      for (var index = 0; index < text.length; index += 1) {
        var code = text.charCodeAt(index);
        if (code < 32 && code !== 9 && code !== 10 && code !== 13) controls += 1;
      }
      return !text.length || controls / text.length < 0.02;
    }

    function nativeClassification(kind, category, reason) {
      return { kind: kind, sourceType: kind, category: category, mode: "native-unavailable", reason: reason };
    }

    function classifySniff(bytes) {
      if (hasPrefix(bytes, [37, 80, 68, 70, 45])) return nativeClassification("PDF document", "Documents/PDF", "PDF conversion is unavailable: this static page does not bundle a PDF parser, renderer, or writer. Base64 or hex encoding remains available.");
      if (hasPrefix(bytes, [137, 80, 78, 71, 13, 10, 26, 10]) || hasPrefix(bytes, [255, 216, 255]) || ascii(bytes, 0, 6) === "GIF87a" || ascii(bytes, 0, 6) === "GIF89a" || (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP")) return nativeClassification("Image bytes", "Images", "Image conversion is unavailable: this static page does not bundle an image decoder or encoder. Base64 or hex encoding remains available.");
      if ((ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WAVE") || ascii(bytes, 0, 3) === "ID3" || ascii(bytes, 0, 4) === "OggS" || ascii(bytes, 0, 4) === "fLaC" || hasPrefix(bytes, [255, 251]) || hasPrefix(bytes, [255, 243])) return nativeClassification("Audio bytes", "Audio", "Audio conversion is unavailable: this static page does not bundle an audio decoder or encoder. Base64 or hex encoding remains available.");
      if (ascii(bytes, 4, 4) === "ftyp" || hasPrefix(bytes, [26, 69, 223, 163])) return nativeClassification("Video bytes", "Video", "Video conversion is unavailable: this static page does not bundle a video decoder or encoder. Base64 or hex encoding remains available.");
      if (hasPrefix(bytes, [80, 75, 3, 4]) || hasPrefix(bytes, [80, 75, 5, 6]) || hasPrefix(bytes, [80, 75, 7, 8]) || hasPrefix(bytes, [55, 122, 188, 175, 39, 28]) || ascii(bytes, 0, 7) === "Rar!\x1A\x07") return nativeClassification("Archive container bytes", "Archives", "Archive conversion is unavailable: this static page does not bundle an archive reader or writer. Base64 or hex encoding remains available.");
      if (hasPrefix(bytes, [208, 207, 17, 224, 161, 177, 26, 225])) return nativeClassification("Legacy workbook container bytes", "Structured Data/Spreadsheets", "Native workbook conversion is unavailable: this static page does not bundle a workbook parser or writer. Base64 or hex encoding remains available.");
      try {
        var decoded = decodeUtf8(bytes);
        if (looksLikeText(decoded)) return { kind: "UTF-8 text candidate", sourceType: "UTF-8 text", category: "Code/Text", mode: "text-candidate", reason: "The first " + bytes.length + " bytes look like UTF-8 text. Full bounded local inspection determines whether structured routes are available." };
      } catch (_) {
        // The binary-encoding route remains the honest fallback.
      }
      return { kind: "Unknown binary bytes", sourceType: "binary", category: "Binary Encodings", mode: "binary", reason: "The byte sniff found no bundled native converter. Base64 or hex encoding is available locally." };
    }

    function valueWithinBounds(value, depth, tracker) {
      if (depth > depthLimit || tracker.count > rowLimit * columnLimit) return false;
      if (value === null || typeof value === "boolean" || typeof value === "number") return Number.isFinite(value) || value === null;
      if (typeof value === "string") return value.length <= 32768;
      if (Array.isArray(value)) {
        tracker.count += value.length;
        return value.every(function (entry) { return valueWithinBounds(entry, depth + 1, tracker); });
      }
      if (value && Object.getPrototypeOf(value) === Object.prototype) {
        var keys = Object.keys(value);
        tracker.count += keys.length;
        return keys.length <= columnLimit && keys.every(function (key) { return key.length <= 160 && valueWithinBounds(value[key], depth + 1, tracker); });
      }
      return false;
    }

    function parseDelimited(text, delimiter) {
      var rows = [];
      var row = [];
      var cell = "";
      var quoted = false;
      var afterQuote = false;
      function pushCell() {
        if (cell.length > 32768) throw new Error("A delimited cell exceeds the local safety limit.");
        row.push(cell);
        cell = "";
      }
      function pushRow() {
        pushCell();
        if (row.length > columnLimit) throw new Error("A delimited row exceeds the local column limit.");
        if (rows.length >= rowLimit) throw new Error("The delimited file exceeds the local row limit.");
        rows.push(row);
        row = [];
      }
      for (var index = 0; index < text.length; index += 1) {
        var character = text[index];
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
          } else if (character === "\n" || character === "\r") {
            if (character === "\r" && text[index + 1] === "\n") index += 1;
            pushRow();
            afterQuote = false;
          } else if (character !== " " && character !== "\t") {
            throw new Error("A quoted delimited field has unexpected content after its closing quote.");
          }
          continue;
        }
        if (character === '"') {
          if (cell.length) throw new Error("A quote may start only at the beginning of a delimited field.");
          quoted = true;
        } else if (character === delimiter) {
          pushCell();
        } else if (character === "\n" || character === "\r") {
          if (character === "\r" && text[index + 1] === "\n") index += 1;
          pushRow();
        } else {
          cell += character;
        }
      }
      if (quoted) throw new Error("The delimited file ends inside a quoted field.");
      if (cell.length || row.length || text.length === 0 || afterQuote) pushRow();
      while (rows.length && rows[rows.length - 1].every(function (entry) { return entry === ""; })) rows.pop();
      if (!rows.length) return { headers: [], records: [] };
      var rawHeaders = rows.shift();
      if (!rawHeaders.length) throw new Error("The delimited file has no columns.");
      var seen = Object.create(null);
      var headers = rawHeaders.map(function (header, column) {
        var base = String(header || "").trim().slice(0, 160) || "column" + (column + 1);
        seen[base] = (seen[base] || 0) + 1;
        return seen[base] === 1 ? base : base + "_" + seen[base];
      });
      var records = rows.map(function (cells) {
        if (cells.length > headers.length) throw new Error("A delimited row has more values than the header row, so no values were dropped.");
        var record = {};
        headers.forEach(function (header, column) { record[header] = cells[column] == null ? "" : cells[column]; });
        return record;
      });
      return { headers: headers, records: records };
    }

    function likelyDelimited(text, delimiter) {
      var lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(function (line) { return line.trim().length; });
      return lines.length >= 2 && lines[0].indexOf(delimiter) !== -1;
    }

    function classifyText(text) {
      var compact = text.replace(/^\uFEFF/, "").trim();
      if (compact && (compact[0] === "{" || compact[0] === "[")) {
        try {
          var json = JSON.parse(compact);
          if (valueWithinBounds(json, 0, { count: 0 })) return { kind: "JSON", sourceType: "UTF-8 JSON", category: "Structured Data/Spreadsheets", mode: "structured-json", value: json, reason: "Validated JSON is available for bounded local structured-data conversion." };
        } catch (_) {
          // Continue as text; an invalid JSON-looking file is not treated as structured data.
        }
      }
      if (likelyDelimited(text, ",")) {
        try {
          var csv = parseDelimited(text, ",");
          return { kind: "CSV", sourceType: "UTF-8 CSV", category: "Structured Data/Spreadsheets", mode: "structured-delimited", delimiter: ",", headers: csv.headers, records: csv.records, reason: "Validated CSV is available for bounded local structured-data conversion." };
        } catch (_) {
          // A malformed CSV remains text rather than a guessed table.
        }
      }
      if (likelyDelimited(text, "\t")) {
        try {
          var tsv = parseDelimited(text, "\t");
          return { kind: "TSV", sourceType: "UTF-8 TSV", category: "Structured Data/Spreadsheets", mode: "structured-delimited", delimiter: "\t", headers: tsv.headers, records: tsv.records, reason: "Validated TSV is available for bounded local structured-data conversion." };
        } catch (_) {
          // A malformed TSV remains text rather than a guessed table.
        }
      }
      return { kind: "UTF-8 text", sourceType: "UTF-8 text", category: "Code/Text", mode: "text", reason: "Validated UTF-8 text is available for a local text-to-text conversion." };
    }

    function inspectionFromBytes(bytes, sniff) {
      if (sniff.mode === "native-unavailable" || sniff.mode === "binary") return sniff;
      try {
        var text = decodeUtf8(bytes);
        if (!looksLikeText(text)) return { kind: "Unknown binary bytes", sourceType: "binary", category: "Binary Encodings", mode: "binary", reason: "Full bounded inspection found binary control bytes. Base64 or hex encoding is available locally." };
        return classifyText(text);
      } catch (_) {
        return { kind: "Unknown binary bytes", sourceType: "binary", category: "Binary Encodings", mode: "binary", reason: "Full bounded inspection could not validate UTF-8 text. Base64 or hex encoding is available locally." };
      }
    }

    function targetsFor(inspection) {
      var binary = [targetDefinitions.base64, targetDefinitions.hex].filter(function (target) { return adapterAvailable(target.adapterId); });
      if (!inspection) return [];
      if (inspection.mode === "structured-json" || inspection.mode === "structured-delimited") return [targetDefinitions.json, targetDefinitions.csv, targetDefinitions.tsv, targetDefinitions.yaml].filter(function (target) { return adapterAvailable(target.adapterId); }).concat(binary);
      if (inspection.mode === "text") return [targetDefinitions.text].filter(function (target) { return adapterAvailable(target.adapterId); }).concat(binary);
      return binary;
    }

    function displayStatus(status) {
      var labels = {
        queued: "queued",
        ready: "ready",
        converting: "converting locally",
        converted: "output ready",
        "download-requested": "download requested",
        unsupported: "unsupported",
        unavailable: "unavailable",
        failed: "not converted"
      };
      return labels[status] || status || "queued";
    }

    function targetNameFor(item, target) {
      var name = safeFileLabel(item.sourceName || "converted-file");
      var dot = name.lastIndexOf(".");
      var stem = dot > 0 ? name.slice(0, dot) : name;
      return (stem || "converted-file").slice(0, 120) + "." + target.extension;
    }

    function textByteLength(value) {
      if (typeof window.TextEncoder === "function") return new window.TextEncoder().encode(value).byteLength;
      return new Blob([value]).size;
    }

    function bytesToBase64(bytes) {
      var chunks = [];
      for (var offset = 0; offset < bytes.length; offset += 32768) {
        var part = bytes.subarray(offset, Math.min(bytes.length, offset + 32768));
        var text = "";
        for (var index = 0; index < part.length; index += 1) text += String.fromCharCode(part[index]);
        chunks.push(text);
      }
      return window.btoa(chunks.join(""));
    }

    function bytesToHex(bytes) {
      var pieces = new Array(bytes.length);
      for (var index = 0; index < bytes.length; index += 1) pieces[index] = bytes[index].toString(16).padStart(2, "0");
      return pieces.join("");
    }

    function scalarForTable(value) {
      if (value === null) return "";
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
      throw new Error("Tabular conversion is available only for arrays of records with scalar values, so no nested value was flattened or dropped.");
    }

    function recordsFromJson(value) {
      if (!Array.isArray(value) || value.length > rowLimit) throw new Error("CSV and TSV output requires a bounded top-level JSON array of records.");
      var keys = [];
      var seen = Object.create(null);
      value.forEach(function (entry) {
        if (!entry || Object.getPrototypeOf(entry) !== Object.prototype) throw new Error("CSV and TSV output requires each JSON array entry to be a record object.");
        Object.keys(entry).forEach(function (key) {
          if (!seen[key]) {
            if (keys.length >= columnLimit) throw new Error("The JSON records exceed the local column limit.");
            seen[key] = true;
            keys.push(key);
          }
        });
      });
      value.forEach(function (entry) { keys.forEach(function (key) { scalarForTable(Object.prototype.hasOwnProperty.call(entry, key) ? entry[key] : null); }); });
      return { headers: keys, records: value };
    }

    function escapeDelimited(value) {
      var text = String(value == null ? "" : value);
      return /["\n\r,\t]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
    }

    function tableToDelimited(table, delimiter) {
      if (!table.headers.length) return "";
      var lines = [table.headers.map(escapeDelimited).join(delimiter)];
      table.records.forEach(function (record) {
        lines.push(table.headers.map(function (header) { return escapeDelimited(scalarForTable(Object.prototype.hasOwnProperty.call(record, header) ? record[header] : null)); }).join(delimiter));
      });
      return lines.join("\r\n") + "\r\n";
    }

    function yamlScalar(value) {
      if (value === null) return "null";
      if (typeof value === "boolean" || typeof value === "number") return String(value);
      if (typeof value === "string") return JSON.stringify(value);
      throw new Error("YAML-style export cannot silently flatten a nested value at this position.");
    }

    function yamlStyle(value, depth, indent) {
      if (depth > depthLimit) throw new Error("YAML-style export exceeds the local nesting limit.");
      var padding = new Array(indent + 1).join(" ");
      if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") return yamlScalar(value);
      if (Array.isArray(value)) {
        if (!value.length) return "[]";
        return value.map(function (entry) {
          if (entry === null || typeof entry === "boolean" || typeof entry === "number" || typeof entry === "string") return padding + "- " + yamlScalar(entry);
          return padding + "-\n" + yamlStyle(entry, depth + 1, indent + 2);
        }).join("\n");
      }
      if (value && Object.getPrototypeOf(value) === Object.prototype) {
        var keys = Object.keys(value);
        if (!keys.length) return "{}";
        return keys.map(function (key) {
          var entry = value[key];
          var quotedKey = JSON.stringify(key);
          if (entry === null || typeof entry === "boolean" || typeof entry === "number" || typeof entry === "string") return padding + quotedKey + ": " + yamlScalar(entry);
          return padding + quotedKey + ":\n" + yamlStyle(entry, depth + 1, indent + 2);
        }).join("\n");
      }
      throw new Error("YAML-style export received an unsupported value.");
    }

    function outputFrom(item, target, bytes) {
      if (target.id === "base64") return bytesToBase64(bytes);
      if (target.id === "hex") return bytesToHex(bytes);
      var text = decodeUtf8(bytes);
      if (!looksLikeText(text)) throw new Error("The selected output needs valid UTF-8 text, but the source contains binary control bytes.");
      var inspection = inspectionFromBytes(bytes, item.sniff);
      if (target.id === "text") {
        if (inspection.mode !== "text") throw new Error("Plain UTF-8 text output is available only after the source is validated as text.");
        return text;
      }
      if (inspection.mode !== "structured-json" && inspection.mode !== "structured-delimited") throw new Error("Structured output is available only for validated JSON, CSV, or TSV; the source was left unchanged.");
      var value = inspection.mode === "structured-json" ? inspection.value : inspection.records;
      if (target.id === "json") return JSON.stringify(value, null, 2) + "\n";
      if (target.id === "yaml") return yamlStyle(value, 0, 0) + "\n";
      var table = inspection.mode === "structured-json" ? recordsFromJson(inspection.value) : { headers: inspection.headers, records: inspection.records };
      return tableToDelimited(table, target.id === "tsv" ? "\t" : ",");
    }

    function updateRecord(item, patch) {
      if (!item.jobId || !hasContractMethod("updateBrowserConversionJob")) return;
      safely(function () { contract.updateBrowserConversionJob(item.jobId, patch); });
    }

    function recordItem(item) {
      if (!hasContractMethod("recordBrowserConversionJob")) return;
      var result = safely(function () {
        return contract.recordBrowserConversionJob({
          sourceName: item.sourceName,
          sourceType: item.sniff.sourceType,
          sourceBytes: item.sourceBytes,
          detectedKind: item.sniff.kind,
          category: item.sniff.category,
          targetType: "",
          targetFormat: "",
          targetName: "",
          status: item.status,
          adapterId: "",
          reason: item.reason
        });
      }, null);
      if (result && result.ok && result.job) item.jobId = result.job.id;
    }

    function releaseOutput(item) {
      if (item.output && item.output.url) safely(function () { window.URL.revokeObjectURL(item.output.url); });
      item.output = null;
    }

    function renderQueue() {
      queueHost.replaceChildren();
      if (queueCountHost) queueCountHost.textContent = queue.length + " active file" + (queue.length === 1 ? "" : "s");
      if (!queue.length) {
        var empty = made("p");
        empty.className = "converter-empty";
        empty.textContent = "No source file is active. Choose a local file to create a bounded browser-only queue entry.";
        queueHost.appendChild(empty);
        return;
      }
      var list = made("ol");
      list.className = "converter-job-list";
      queue.forEach(function (item) {
        var row = made("li");
        row.className = "converter-job";
        var header = made("div");
        header.className = "converter-job-header";
        var title = made("div");
        var strong = made("strong");
        strong.textContent = item.sourceName;
        var metadata = made("span");
        metadata.className = "converter-job-meta";
        metadata.textContent = humanSize(item.sourceBytes) + " · " + item.inspection.kind + " · " + item.inspection.category;
        title.append(strong, metadata);
        var stateBadge = made("span");
        stateBadge.className = "converter-state";
        stateBadge.setAttribute("data-state", item.status);
        stateBadge.textContent = displayStatus(item.status);
        header.append(title, stateBadge);
        row.appendChild(header);

        var controls = made("div");
        controls.className = "converter-job-controls";
        var targetLabel = made("label");
        targetLabel.textContent = "Local output";
        var target = made("select");
        var options = targetsFor(item.inspection);
        if (!options.length) {
          var pending = made("option");
          pending.value = "";
          pending.textContent = item.status === "unsupported" ? "No safe output for this queue entry" : "Inspecting local compatibility…";
          target.appendChild(pending);
          target.disabled = true;
        } else {
          options.forEach(function (definition) {
            var option = made("option");
            option.value = definition.id;
            option.textContent = definition.label;
            target.appendChild(option);
          });
          if (!item.targetId || !options.some(function (definition) { return definition.id === item.targetId; })) item.targetId = options[0].id;
          target.value = item.targetId;
          target.disabled = item.busy || item.status === "unsupported";
        }
        target.addEventListener("change", function () {
          item.targetId = target.value;
          releaseOutput(item);
          var definition = targetDefinitions[item.targetId];
          item.status = "ready";
          item.reason = "Ready for an explicit browser-local " + definition.label + " conversion. Source bytes are not persisted.";
          updateRecord(item, { targetType: definition.targetType, targetFormat: definition.targetFormat, targetName: targetNameFor(item, definition), status: item.status, adapterId: definition.adapterId, reason: item.reason });
          renderQueue();
          renderConverterHistory();
        });
        targetLabel.appendChild(target);
        var convert = button(item.output ? "Re-create output" : "Create local output", function () { convertItem(item); });
        convert.disabled = !options.length || item.busy || item.status === "unsupported";
        var remove = button("Remove active file", function () {
          releaseOutput(item);
          queue = queue.filter(function (entry) { return entry !== item; });
          item.file = null;
          setStatus("Removed an active source from memory. Its metadata-only record remains in browser-local history until you remove that record.");
          renderQueue();
        });
        controls.append(targetLabel, convert, remove);
        row.appendChild(controls);
        var reason = made("p");
        reason.className = "converter-job-reason";
        reason.textContent = item.reason;
        row.appendChild(reason);
        if (item.output && item.output.preview) {
          var preview = made("pre");
          preview.className = "converter-preview";
          preview.setAttribute("aria-label", "In-memory output preview; it is not stored in history");
          preview.textContent = item.output.preview;
          row.appendChild(preview);
          var download = button("Request browser download", function () { requestDownload(item); });
          download.setAttribute("aria-label", "Request a browser download for " + item.output.name);
          row.appendChild(download);
        }
        list.appendChild(row);
      });
      queueHost.appendChild(list);
    }

    function renderCatalog() {
      catalogHost.replaceChildren();
      var adapters = currentAdapters();
      var categories = made("div");
      categories.className = "converter-category-list";
      catalogCategories.forEach(function (categoryName) {
        var details = made("details");
        details.className = "converter-category";
        details.open = true;
        var summary = made("summary");
        var inCategory = adapters.filter(function (adapter) { return adapter.category === categoryName; });
        var enabledCount = inCategory.filter(function (adapter) { return adapter.enabled && adapter.bundled; }).length;
        summary.textContent = categoryName;
        var compact = made("span");
        compact.textContent = enabledCount + " available · " + (inCategory.length - enabledCount) + " unavailable";
        summary.appendChild(compact);
        var search = made("div");
        search.className = "converter-category-search";
        var label = made("label");
        label.textContent = "Filter " + categoryName;
        var input = made("input");
        input.type = "search";
        input.placeholder = "Search this category";
        label.appendChild(input);
        var builder = button(".*", function () {});
        builder.setAttribute("aria-label", "Open regular expression builder for " + categoryName + " adapters");
        search.append(label, builder);
        var list = made("ul");
        list.className = "converter-adapter-list";
        if (!inCategory.length) {
          var absent = made("li");
          absent.className = "converter-adapter";
          absent.textContent = "No adapter registry entry is available for this category.";
          list.appendChild(absent);
        } else {
          inCategory.forEach(function (adapter) {
            var entry = made("li");
            entry.className = "converter-adapter";
            entry.setAttribute("data-mss-converter-adapter", "true");
            entry.setAttribute("data-enabled", String(Boolean(adapter.enabled && adapter.bundled)));
            var title = made("strong");
            title.textContent = adapter.label;
            var formats = made("span");
            formats.textContent = "Source: " + adapter.sourceFormats.join(", ") + " → Output: " + adapter.targetFormats.join(", ");
            var reason = made("em");
            reason.textContent = adapter.reason;
            var badge = made("span");
            badge.className = "converter-adapter-badge";
            badge.textContent = adapter.enabled && adapter.bundled ? "Available locally" : "Unavailable";
            entry.append(title, formats, reason, badge);
            list.appendChild(entry);
          });
        }
        details.append(summary, search, list);
        categories.appendChild(details);
        makeRegexBuilder(input, {
          label: categoryName + " adapters",
          scope: details,
          candidates: function () { return all("[data-mss-converter-adapter]", list); }
        });
      });
      catalogHost.appendChild(categories);
    }

    function renderConverterHistory() {
      historyHost.replaceChildren();
      var records = hasContractMethod("getBrowserConversionJobs") ? safely(function () { return contract.getBrowserConversionJobs(); }, []) : [];
      if (!Array.isArray(records) || !records.length) {
        var empty = made("p");
        empty.className = "converter-empty";
        empty.textContent = "No conversion metadata has been recorded in this browser.";
        historyHost.appendChild(empty);
        return;
      }
      var list = made("ol");
      list.className = "converter-history-list";
      records.forEach(function (record) {
        var entry = made("li");
        entry.className = "converter-history-item";
        var copy = made("div");
        var title = made("strong");
        title.textContent = safeFileLabel(record.sourceName || "local-file") + " · " + displayStatus(record.status);
        var detail = made("span");
        detail.textContent = humanSize(record.sourceBytes) + " · " + (record.detectedKind || record.sourceType || "unknown") + " · " + (record.targetFormat || "no output selected") + ". " + (record.reason || "No additional detail.");
        copy.append(title, detail);
        var remove = button("Remove metadata", function () {
          if (!window.confirm("Remove this browser-local conversion metadata record? Source files, output files, and browser downloads are not changed.")) return;
          if (hasContractMethod("removeBrowserConversionJob")) safely(function () { contract.removeBrowserConversionJob(record.id); });
          renderConverterHistory();
          setStatus("A browser-local metadata record was removed. No source or output file changed.");
        });
        remove.setAttribute("aria-label", "Remove browser-local metadata for " + safeFileLabel(record.sourceName || "local-file"));
        entry.append(copy, remove);
        list.appendChild(entry);
      });
      historyHost.appendChild(list);
    }

    async function inspectItem(item) {
      if (!item.file || item.busy || item.status === "unsupported") return;
      item.busy = true;
      item.status = "converting";
      item.reason = "Inspecting this selected file locally within the 1 MiB bound.";
      updateRecord(item, { status: item.status, reason: item.reason });
      renderQueue();
      try {
        var buffer = await item.file.arrayBuffer();
        if (buffer.byteLength > inputLimit) throw new Error("The selected file exceeds the 1 MiB local input bound.");
        item.inspection = inspectionFromBytes(new Uint8Array(buffer), item.sniff);
        var targets = targetsFor(item.inspection);
        item.targetId = targets.length ? targets[0].id : "";
        item.status = targets.length ? "ready" : "unavailable";
        item.reason = item.inspection.reason;
        var target = item.targetId ? targetDefinitions[item.targetId] : null;
        updateRecord(item, { sourceType: item.inspection.sourceType, sourceBytes: item.sourceBytes, detectedKind: item.inspection.kind, category: item.inspection.category, targetType: target ? target.targetType : "", targetFormat: target ? target.targetFormat : "", targetName: target ? targetNameFor(item, target) : "", adapterId: target ? target.adapterId : "", status: item.status, reason: item.reason });
      } catch (_) {
        item.status = "unsupported";
        item.inspection = { kind: "Unreadable local source", sourceType: "unknown", category: "Binary Encodings", mode: "binary", reason: "This page could not inspect the selected file within the local safety bounds. No source bytes were retained; Base64 and hex were not offered without a successful bounded read." };
        item.reason = item.inspection.reason;
        updateRecord(item, { status: item.status, detectedKind: item.inspection.kind, category: item.inspection.category, reason: item.reason });
      } finally {
        item.busy = false;
        renderQueue();
        renderConverterHistory();
      }
    }

    async function convertItem(item) {
      var target = targetDefinitions[item.targetId];
      if (!item.file || !target || item.busy) return;
      item.busy = true;
      releaseOutput(item);
      item.status = "converting";
      item.reason = "Creating a bounded browser-local output. Nothing is uploaded or written until you request a browser download.";
      updateRecord(item, { status: item.status, targetType: target.targetType, targetFormat: target.targetFormat, targetName: targetNameFor(item, target), adapterId: target.adapterId, reason: item.reason });
      renderQueue();
      try {
        var buffer = await item.file.arrayBuffer();
        if (buffer.byteLength > inputLimit) throw new Error("The source file exceeds the 1 MiB local input bound.");
        var bytes = new Uint8Array(buffer);
        var output = outputFrom(item, target, bytes);
        if (textByteLength(output) > outputLimit) throw new Error("The converted output exceeds the 2 MiB local output bound.");
        var blob = new Blob([output], { type: target.mime });
        item.output = { blob: blob, url: window.URL.createObjectURL(blob), name: targetNameFor(item, target), preview: output.slice(0, 1400) + (output.length > 1400 ? "\n… preview truncated in memory …" : "") };
        item.status = "converted";
        item.reason = "A local output is ready in memory. Request a browser download to choose the next step; this page cannot know the destination or completion result.";
        updateRecord(item, { sourceType: item.inspection.sourceType, detectedKind: item.inspection.kind, category: item.inspection.category, targetType: target.targetType, targetFormat: target.targetFormat, targetName: item.output.name, status: item.status, adapterId: target.adapterId, reason: item.reason });
        setStatus("Local output ready. It remains in this browser's memory until you remove it, replace it, or leave the page.");
      } catch (_) {
        item.status = "failed";
        item.reason = "The requested conversion could not be completed within this page's bounded local format rules. The source file was not changed and no output was written.";
        updateRecord(item, { status: item.status, reason: item.reason });
        setStatus("A local conversion did not produce output. The source file was not changed.");
      } finally {
        item.busy = false;
        renderQueue();
        renderConverterHistory();
      }
    }

    function requestDownload(item) {
      if (!item.output || !item.output.url) return;
      var anchor = made("a");
      anchor.href = item.output.url;
      anchor.download = item.output.name;
      anchor.hidden = true;
      (body || document.documentElement).appendChild(anchor);
      anchor.click();
      anchor.remove();
      item.status = "download-requested";
      item.reason = "A browser download was requested. This page does not receive the browser destination or completion result.";
      updateRecord(item, { status: item.status, downloadRequestedAt: new Date().toISOString(), reason: item.reason });
      setStatus("Browser download requested. Its destination and completion are not available to this page.");
      renderQueue();
      renderConverterHistory();
    }

    async function addFile(file) {
      if (queue.length >= sessionLimit) {
        notify("warning", "The current browser-local converter queue is full. Remove an active file before adding another.");
        return;
      }
      var item = {
        file: file,
        sourceName: safeFileLabel(file && file.name),
        sourceBytes: sourceBytes(file),
        sniff: { kind: "Waiting for byte sniff", sourceType: "unknown", category: "Unknown", mode: "pending", reason: "Waiting for a bounded local byte sniff." },
        inspection: { kind: "Waiting for byte sniff", sourceType: "unknown", category: "Unknown", mode: "pending", reason: "Waiting for a bounded local byte sniff." },
        targetId: "",
        status: "queued",
        reason: "Waiting for a bounded local byte sniff.",
        busy: true,
        jobId: "",
        output: null
      };
      queue.push(item);
      if (item.sourceBytes > inputLimit) {
        item.busy = false;
        item.status = "unsupported";
        item.sniff = { kind: "Oversized local source", sourceType: "unknown", category: "Unknown", mode: "oversized", reason: "The selected file exceeds the 1 MiB input bound, so this page did not read its bytes." };
        item.inspection = item.sniff;
        item.reason = item.sniff.reason;
        recordItem(item);
        renderQueue();
        renderConverterHistory();
        return;
      }
      renderQueue();
      try {
        var buffer = await file.slice(0, Math.min(sourceBytes(file), sniffLimit)).arrayBuffer();
        item.sniff = classifySniff(new Uint8Array(buffer));
        item.inspection = item.sniff;
        item.reason = item.sniff.reason;
        item.busy = false;
        recordItem(item);
        renderQueue();
        await inspectItem(item);
      } catch (_) {
        item.busy = false;
        item.status = "unsupported";
        item.sniff = { kind: "Unreadable local source", sourceType: "unknown", category: "Unknown", mode: "unreadable", reason: "The page could not read the bounded byte sniff. No source bytes were retained." };
        item.inspection = item.sniff;
        item.reason = item.sniff.reason;
        recordItem(item);
        renderQueue();
        renderConverterHistory();
      }
    }

    picker.addEventListener("change", async function () {
      if (selecting) return;
      selecting = true;
      var files = Array.prototype.slice.call(picker.files || []);
      var accepted = files.slice(0, selectionLimit);
      if (files.length > selectionLimit) notify("warning", "Only the first " + selectionLimit + " selected files were admitted to this browser-local queue. The remaining selections were not read.");
      for (var index = 0; index < accepted.length; index += 1) {
        if (queue.length >= sessionLimit) {
          notify("warning", "The browser-local queue reached its " + sessionLimit + " file limit. Remaining selections were not read.");
          break;
        }
        await addFile(accepted[index]);
      }
      picker.value = "";
      selecting = false;
      setStatus(queue.length ? "Local compatibility inspection completed for the active queue. Choose an output only where the registry says it is available." : "No active local source file is queued.");
    });

    if (clearHistory) clearHistory.addEventListener("click", function () {
      var records = hasContractMethod("getBrowserConversionJobs") ? safely(function () { return contract.getBrowserConversionJobs(); }, []) : [];
      if (!Array.isArray(records) || !records.length) return;
      if (!window.confirm("Remove " + records.length + " browser-local conversion metadata record" + (records.length === 1 ? "?" : "s?") + " Source files, output files, and browser downloads are not changed.")) return;
      records.forEach(function (record) {
        if (hasContractMethod("removeBrowserConversionJob")) safely(function () { contract.removeBrowserConversionJob(record.id); });
      });
      renderConverterHistory();
      setStatus("Browser-local conversion metadata history was cleared. No source or output file changed.");
    });

    renderCatalog();
    renderQueue();
    renderConverterHistory();
    setStatus("Ready for up to " + selectionLimit + " selected local files at a time; each file is bounded to " + humanSize(inputLimit) + ".");
  }

  function installOllamaPreview() {
    var surface = one('[data-contract-surface="ollama-manager"]');
    var host = one('[data-contract-hook="ollama-status"]', surface);
    if (!surface || !host || one("[data-mss-ollama-preview]", surface)) return;
    var endpoint = "http://127.0.0.1:11434";
    var sessionKey = "minecraft-server-studio.site.ollama-observer.v1";
    var responseByteLimit = 96 * 1024;
    var modelLimit = 80;
    var requestTimeoutMs = 4500;
    var activeController = null;
    var abortReason = "";
    var sessionSnapshot = loadSessionSnapshot();
    var area = made("div");
    area.setAttribute("data-mss-ollama-preview", "true");
    area.className = "ollama-observer-controls";
    var indicator = made("span");
    indicator.className = "state-indicator";
    indicator.setAttribute("aria-hidden", "true");
    var copy = made("div");
    var title = made("strong");
    var detail = made("small");
    copy.append(title, detail);
    var actions = made("div");
    actions.className = "ollama-observer-actions";
    var refresh = button("Refresh local runtime", refreshLocalRuntime);
    refresh.setAttribute("data-mss-ollama-refresh", "true");
    var cancel = button("Cancel refresh", function () {
      if (!activeController) return;
      abortReason = "cancelled";
      activeController.abort();
    });
    cancel.disabled = true;
    actions.append(refresh, cancel);
    area.append(indicator, copy, actions);
    host.replaceChildren(area);

    var statusBadge = one(".preview-status", surface);
    var searchHook = one('[data-contract-hook="ollama-catalog-search-regex"]', surface);
    var searchInput = searchHook && one('input[type="search"]', searchHook);
    var inventory = one('[data-contract-hook="ollama-inventory"]', surface);

    function plainRecord(value) {
      if (!value || typeof value !== "object" || Array.isArray(value)) return false;
      var prototype = Object.getPrototypeOf(value);
      if (prototype !== Object.prototype && prototype !== null) return false;
      return !Object.prototype.hasOwnProperty.call(value, "__proto__") && !Object.prototype.hasOwnProperty.call(value, "prototype") && !Object.prototype.hasOwnProperty.call(value, "constructor");
    }

    function safeText(value, maximum) {
      if (typeof value !== "string") return "";
      return value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, maximum);
    }

    function safeNumber(value) {
      if (value === null || value === undefined || value === "") return null;
      var numeric = Number(value);
      return Number.isFinite(numeric) && numeric >= 0 && numeric <= Number.MAX_SAFE_INTEGER ? Math.round(numeric) : null;
    }

    function localError(code, message) {
      var error = new Error(message);
      error.code = code;
      return error;
    }

    function normalizeModel(raw) {
      if (!plainRecord(raw)) throw localError("rejected", "A local model record was not an object.");
      var details = plainRecord(raw.details) ? raw.details : {};
      var name = safeText(raw.name, 180) || safeText(raw.model, 180);
      if (!name) throw localError("rejected", "A local model record did not include a safe model name.");
      return {
        name: name,
        size: safeNumber(raw.size),
        sizeVram: safeNumber(raw.size_vram !== undefined ? raw.size_vram : raw.sizeVram),
        modifiedAt: safeText(raw.modified_at !== undefined ? raw.modified_at : raw.modifiedAt, 80),
        expiresAt: safeText(raw.expires_at !== undefined ? raw.expires_at : raw.expiresAt, 80),
        family: safeText(details.family !== undefined ? details.family : raw.family, 120),
        parameterSize: safeText(details.parameter_size !== undefined ? details.parameter_size : raw.parameterSize, 80),
        quantization: safeText(details.quantization_level !== undefined ? details.quantization_level : raw.quantization, 80)
      };
    }

    function normalizeModels(payload, label) {
      if (!plainRecord(payload) || !Array.isArray(payload.models)) {
        throw localError("rejected", "The fixed local " + label + " response did not contain a model array.");
      }
      if (payload.models.length > modelLimit) {
        throw localError("rejected", "The fixed local " + label + " response exceeded this page's " + modelLimit + "-model safety boundary.");
      }
      return payload.models.map(normalizeModel);
    }

    function normalizeSnapshot(raw) {
      if (!plainRecord(raw)) return null;
      var version = safeText(raw.version, 80);
      var observedAt = safeText(raw.observedAt, 80);
      if (!version || !observedAt || !Array.isArray(raw.installed) || !Array.isArray(raw.running) || raw.installed.length > modelLimit || raw.running.length > modelLimit) return null;
      try {
        return {
          version: version,
          observedAt: observedAt,
          installed: raw.installed.map(normalizeModel),
          running: raw.running.map(normalizeModel)
        };
      } catch (_) {
        return null;
      }
    }

    function loadSessionSnapshot() {
      try {
        if (!window.sessionStorage) return null;
        return normalizeSnapshot(JSON.parse(window.sessionStorage.getItem(sessionKey) || "null"));
      } catch (_) {
        return null;
      }
    }

    function persistSessionSnapshot(snapshot) {
      try {
        var serialized = JSON.stringify(snapshot);
        if (serialized.length > responseByteLimit) return false;
        window.sessionStorage.setItem(sessionKey, serialized);
        return true;
      } catch (_) {
        return false;
      }
    }

    function browserSupportsBoundedLocalRead() {
      return typeof window.fetch === "function" && typeof window.AbortController === "function" && typeof window.TextDecoder === "function";
    }

    function setStatus(kind, heading, message) {
      host.setAttribute("data-mss-ollama-state", kind);
      root.dataset.mssOllamaPreview = kind;
      title.textContent = heading;
      detail.textContent = message;
      if (statusBadge) statusBadge.textContent = {
        idle: "Not checked",
        stale: "Session snapshot",
        checking: "Checking local runtime",
        healthy: "Local runtime healthy",
        unavailable: "Local runtime unavailable",
        blocked: "Browser or CORS blocked",
        unsupported: "Browser unsupported",
        rejected: "Response rejected",
        cancelled: "Refresh cancelled",
        timeout: "Timed out"
      }[kind] || "Local state";
    }

    function renderModel(model, kind) {
      var row = made("li");
      row.setAttribute("data-mss-ollama-model", "true");
      var name = made("strong");
      name.textContent = model.name;
      var metadata = [];
      if (model.size !== null) metadata.push("size " + humanSize(model.size));
      if (kind === "running" && model.sizeVram !== null) metadata.push("VRAM " + humanSize(model.sizeVram));
      if (model.family) metadata.push(model.family);
      if (model.parameterSize) metadata.push(model.parameterSize);
      if (model.quantization) metadata.push(model.quantization);
      if (kind === "installed" && model.modifiedAt) metadata.push("modified " + model.modifiedAt);
      if (kind === "running" && model.expiresAt) metadata.push("expires " + model.expiresAt);
      var description = made("small");
      description.textContent = metadata.length ? metadata.join(" · ") : "No additional safe model metadata was supplied by the local response.";
      row.append(name, description);
      return row;
    }

    function renderCollection(label, models, kind) {
      var section = made("section");
      section.className = "ollama-model-collection";
      var heading = made("h3");
      heading.textContent = label + " (" + models.length + ")";
      section.appendChild(heading);
      if (!models.length) {
        var empty = made("p");
        empty.className = "empty-state";
        empty.textContent = kind === "installed" ? "The local tags response reported no installed models." : "The local running-model response reported no loaded models.";
        section.appendChild(empty);
        return section;
      }
      var list = made("ul");
      list.className = "ollama-model-list";
      models.forEach(function (model) { list.appendChild(renderModel(model, kind)); });
      section.appendChild(list);
      return section;
    }

    function refreshSearchResults() {
      if (!searchInput || searchInput.getAttribute("data-mss-regex-ready") !== "true") return;
      safely(function () { searchInput.dispatchEvent(new Event("input", { bubbles: true })); });
    }

    function renderInventory() {
      if (!inventory) return;
      inventory.replaceChildren();
      if (!sessionSnapshot) {
        var empty = made("p");
        empty.className = "empty-state";
        empty.textContent = "No browser-session model snapshot exists yet. Refresh is required before this page can show local model information.";
        inventory.appendChild(empty);
        refreshSearchResults();
        return;
      }
      var observation = made("p");
      observation.className = "annotation";
      observation.textContent = "Last successful browser-session observation: Ollama " + sessionSnapshot.version + " at " + sessionSnapshot.observedAt + ". This is a stale observation until a new Refresh succeeds.";
      inventory.append(observation, renderCollection("Installed models", sessionSnapshot.installed, "installed"), renderCollection("Running models", sessionSnapshot.running, "running"));
      refreshSearchResults();
    }

    function readBoundedJson(response, path) {
      if (!response || !response.ok) {
        throw localError("unavailable", "The fixed local " + path + " endpoint did not return a successful response.");
      }
      if (response.redirected === true) {
        throw localError("redirect", "The fixed local response followed a redirect and was not accepted.");
      }
      var responseUrl = safeText(response.url, 300);
      if (!responseUrl) {
        throw localError("rejected", "The browser did not disclose a fixed local response URL.");
      }
      try {
        var parsed = new URL(responseUrl);
        if (parsed.origin !== endpoint || parsed.pathname !== path || parsed.search || parsed.hash) {
          throw localError("redirect", "The browser reported a response outside the fixed local endpoint; it was not accepted.");
        }
      } catch (error) {
        if (error && error.code) throw error;
        throw localError("rejected", "The browser returned an unusable local response URL.");
      }
      var declaredLength = Number(response.headers && response.headers.get("content-length"));
      if (Number.isFinite(declaredLength) && declaredLength > responseByteLimit) {
        throw localError("rejected", "The fixed local " + path + " response exceeded the " + responseByteLimit + "-byte safety boundary.");
      }
      if (!response.body || typeof response.body.getReader !== "function") {
        throw localError("unsupported", "This browser cannot read a bounded local response safely.");
      }
      var reader = response.body.getReader();
      var chunks = [];
      var total = 0;
      function consume() {
        return reader.read().then(function (part) {
          if (part.done) {
            var joined = new Uint8Array(total);
            var offset = 0;
            chunks.forEach(function (chunk) { joined.set(chunk, offset); offset += chunk.byteLength; });
            try {
              return JSON.parse(new window.TextDecoder("utf-8", { fatal: true }).decode(joined));
            } catch (_) {
              throw localError("rejected", "The fixed local " + path + " response was not valid bounded JSON.");
            }
          }
          var chunk = part.value;
          if (!chunk || typeof chunk.byteLength !== "number") throw localError("rejected", "The fixed local " + path + " response included an invalid byte chunk.");
          total += chunk.byteLength;
          if (total > responseByteLimit) {
            safely(function () { reader.cancel(); });
            throw localError("rejected", "The fixed local " + path + " response exceeded the " + responseByteLimit + "-byte safety boundary.");
          }
          chunks.push(chunk);
          return consume();
        });
      }
      return consume();
    }

    function requestLocalJson(path) {
      var url = endpoint + path;
      try {
        return window.fetch(url, {
          method: "GET",
          mode: "cors",
          credentials: "omit",
          cache: "no-store",
          redirect: "error",
          referrerPolicy: "no-referrer",
          headers: { Accept: "application/json" },
          signal: activeController.signal
        }).then(function (response) { return readBoundedJson(response, path); });
      } catch (error) {
        return Promise.reject(error);
      }
    }

    function failureState(error) {
      var code = error && error.code;
      if (abortReason === "cancelled") return { kind: "cancelled", heading: "Local refresh cancelled", message: "The in-flight fixed local read was aborted. Any prior browser-session snapshot remains unchanged." };
      if (abortReason === "timeout") return { kind: "timeout", heading: "Fixed local read timed out", message: "No complete local snapshot was accepted within " + requestTimeoutMs + " ms. Any prior browser-session snapshot remains stale." };
      if (code === "unsupported") return { kind: "unsupported", heading: "Browser feature unavailable", message: "This browser cannot safely perform the bounded local read. No response was accepted and no fallback or bypass was used." };
      if (code === "redirect") return { kind: "rejected", heading: "Redirect rejected", message: "This page accepts only the fixed local address and does not follow redirects, proxies, or alternate hosts." };
      if (code === "unavailable") return { kind: "unavailable", heading: "Local runtime unavailable", message: "The fixed local API did not return a successful response. The page did not try another host, cloud service, or proxy." };
      if (code === "rejected") return { kind: "rejected", heading: "Local response rejected", message: "The fixed local response was malformed or exceeded a browser safety boundary. No partial model data was used." };
      return { kind: "blocked", heading: "CORS or browser-blocked local request", message: "The browser returned no readable local response. This can mean CORS, mixed-content or privacy blocking, or an unavailable local runtime; the page cannot distinguish or bypass those conditions." };
    }

    function finishRefresh(timeoutId) {
      window.clearTimeout(timeoutId);
      activeController = null;
      abortReason = "";
      refresh.disabled = false;
      cancel.disabled = true;
    }

    function refreshLocalRuntime() {
      if (activeController) return;
      if (!browserSupportsBoundedLocalRead()) {
        setStatus("unsupported", "Browser feature unavailable", "This browser lacks the bounded local-request primitives required by this page. No request was made.");
        notify("warning", "The browser-local Ollama observer is unavailable in this browser. No local request was made.");
        return;
      }
      activeController = new window.AbortController();
      abortReason = "";
      refresh.disabled = true;
      cancel.disabled = false;
      setStatus("checking", "Checking the fixed local runtime", "Reading only /api/version, /api/tags, and /api/ps from " + endpoint + " after your explicit Refresh action.");
      var timeoutId = window.setTimeout(function () {
        if (!activeController) return;
        abortReason = "timeout";
        activeController.abort();
      }, requestTimeoutMs);
      requestLocalJson("/api/version").then(function (versionPayload) {
        if (!plainRecord(versionPayload) || !safeText(versionPayload.version, 80)) throw localError("rejected", "The fixed local version response did not include a safe version value.");
        return requestLocalJson("/api/tags").then(function (tagsPayload) {
          return requestLocalJson("/api/ps").then(function (runningPayload) {
            return {
              version: safeText(versionPayload.version, 80),
              observedAt: new Date().toISOString(),
              installed: normalizeModels(tagsPayload, "installed-model"),
              running: normalizeModels(runningPayload, "running-model")
            };
          });
        });
      }).then(function (snapshot) {
        sessionSnapshot = snapshot;
        var stored = persistSessionSnapshot(snapshot);
        renderInventory();
        setStatus("healthy", "Local runtime healthy", "Ollama " + snapshot.version + " returned bounded local model summaries: " + snapshot.installed.length + " installed and " + snapshot.running.length + " running. " + (stored ? "The nonsecret snapshot is kept for this browser session only." : "The nonsecret snapshot remains only in this open page because browser session storage was unavailable."));
        notify("success", "A read-only local Ollama snapshot was refreshed. No catalog, pull, chat, delete, copy, hardware-fit, or harness action was started.");
        finishRefresh(timeoutId);
      }, function (error) {
        var failed = failureState(error);
        setStatus(failed.kind, failed.heading, failed.message);
        renderInventory();
        notify("warning", "The browser-local Ollama refresh did not produce a new accepted snapshot. " + failed.message);
        finishRefresh(timeoutId);
      });
    }

    renderInventory();
    if (sessionSnapshot) {
      setStatus("stale", "Browser-session snapshot available", "A nonsecret local observation is available from " + sessionSnapshot.observedAt + ". Refresh to confirm the current runtime state; no request was made on page load.");
    } else {
      setStatus("idle", "No local runtime checked", "No request occurs until you choose Refresh. The only accepted target is " + endpoint + ".");
    }
    if (searchInput) {
      makeRegexBuilder(searchInput, {
        label: "installed and running local models",
        scope: surface,
        candidates: function () { return all("[data-mss-ollama-model]", inventory); }
      });
    }
  }

  function closeDialog(instance) {
    if (instance && typeof instance.close === "function") instance.close();
    else if (instance) instance.hidden = true;
  }

  function showDialog(title, build) {
    if (dialog && dialog.open) closeDialog(dialog);
    dialog = dialog || made("dialog");
    dialog.replaceChildren();
    var heading = made("h2");
    heading.textContent = title;
    var content = made("div");
    var close = button("Close", function () { closeDialog(dialog); });
    build(content, dialog);
    dialog.append(heading, content, close);
    if (!dialog.isConnected) (body || document.documentElement).appendChild(dialog);
    if (typeof dialog.showModal === "function") dialog.showModal();
    else {
      dialog.hidden = false;
      focus(dialog);
    }
  }

  function installAuthenticatorEducation() {
    var surface = one('[data-contract-surface="authenticator"]');
    if (!surface) return;
    initializeAuthenticatorAndToyLocks({
      surface: surface,
      contract: contract,
      notify: notify,
      addHistory: addHistory
    });
  }

  function installDestructiveDemo() {
    var surface = one('[data-contract-surface="notification-center"]');
    if (!surface || one("[data-mss-confirmation-demo]", surface)) return;
    var area = made("section");
    area.setAttribute("data-mss-confirmation-demo", "true");
    var heading = made("h3");
    heading.textContent = "Safe confirmation interaction demo";
    var copy = made("p");
    copy.textContent = "This educational flow cannot delete, change, upload, download, or otherwise affect anything. It only demonstrates deliberate confirmation controls.";
    area.append(heading, copy);
    area.appendChild(button("Open non-destructive confirmation demo", function () {
      showDialog("Non-destructive confirmation demo", function (content) {
        var description = made("p");
        description.textContent = "Complete both acknowledgements and move the slider. The final control only reports that nothing changed.";
        var firstLabel = made("label");
        var first = made("input");
        first.type = "checkbox";
        firstLabel.append(first, document.createTextNode(" I understand this is only a demonstration."));
        var secondLabel = made("label");
        var second = made("input");
        second.type = "checkbox";
        secondLabel.append(second, document.createTextNode(" I understand no data can be changed here."));
        var rangeLabel = made("label");
        rangeLabel.textContent = "Confirmation slider";
        var range = made("input");
        range.type = "range";
        range.min = "0";
        range.max = "100";
        range.value = "0";
        range.disabled = true;
        rangeLabel.appendChild(range);
        var output = made("output");
        output.setAttribute("aria-live", "polite");
        var finish = button("Finish safe demo", function () {
          output.textContent = "Demo complete. Nothing was changed.";
          addHistory("Confirmation demo completed", "No operation was available or performed.");
          notify("demo", "The confirmation demonstration completed. Nothing was changed.");
        });
        finish.disabled = true;
        function update() {
          range.disabled = !(first.checked && second.checked);
          finish.disabled = range.disabled || range.value !== "100";
          output.textContent = range.disabled ? "Acknowledge both statements to enable the slider." : range.value === "100" ? "Ready to complete the safe demonstration." : "Move the slider to 100 to finish the demonstration.";
        }
        first.addEventListener("change", update);
        second.addEventListener("change", update);
        range.addEventListener("input", update);
        content.append(description, firstLabel, secondLabel, rangeLabel, output, finish);
        update();
      });
    }));
    surface.appendChild(area);
  }

  function renderNotifications() {
    var surface = one('[data-contract-surface="notification-center"]');
    if (!surface) return;
    var area = one("[data-mss-local-notifications]", surface);
    if (!area) {
      area = made("section");
      area.setAttribute("data-mss-local-notifications", "true");
      var heading = made("h3");
      heading.textContent = "Browser-local demonstration notices";
      var list = made("ul");
      list.setAttribute("data-mss-notification-list", "true");
      area.append(heading, button("Add demo notice", function () {
        addHistory("Demo notice added", "A browser-local notice was added.");
        notify("demo", "A browser-local demonstration notice was added. No server or installer action occurred.");
      }), list);
      surface.appendChild(area);
    }
    var listHost = one("[data-mss-notification-list]", area);
    listHost.replaceChildren();
    if (!state.notifications.length) {
      var empty = made("li");
      empty.textContent = "No browser-local notices yet.";
      listHost.appendChild(empty);
      return;
    }
    state.notifications.forEach(function (notice) {
      var item = made("li");
      var level = notificationLevel(notice);
      item.dataset.level = level;
      item.textContent = emoji(level) + notificationMessage(notice) + " Recorded locally at " + (notice.createdAt || notice.when || new Date().toISOString()) + ".";
      listHost.appendChild(item);
    });
  }

  function renderHistory() {
    var surface = one('[data-contract-surface="local-history"]');
    if (!surface) return;
    var area = one("[data-mss-local-history]", surface);
    if (!area) {
      area = made("section");
      area.setAttribute("data-mss-local-history", "true");
      var heading = made("h3");
      heading.textContent = "Browser-local demonstration history";
      var list = made("ul");
      list.setAttribute("data-mss-history-list", "true");
      area.append(heading, list);
      surface.appendChild(area);
    }
    var filters = one('[data-contract-hook="history-filters"]', surface);
    var date = filters && one('input[type="date"]', filters);
    var action = filters && one("select", filters);
    var query = filters && one('input[type="search"]', filters);
    var dateValue = date && date.value;
    var actionValue = action && action.value && action.value !== "All actions" ? action.value.toLocaleLowerCase() : "";
    var queryValue = query && query.value ? query.value.toLocaleLowerCase() : "";
    var entries = state.history.filter(function (entry) {
      if (dateValue && historyTime(entry).slice(0, 10) !== dateValue) return false;
      if (actionValue && entry.action.toLocaleLowerCase().indexOf(actionValue) === -1) return false;
      return !queryValue || (entry.action + " " + entry.detail).toLocaleLowerCase().indexOf(queryValue) !== -1;
    });
    var listHost = one("[data-mss-history-list]", area);
    listHost.replaceChildren();
    if (!entries.length) {
      var empty = made("li");
      empty.textContent = state.history.length ? "No browser-local history matches the active filters." : "No browser-local history exists yet.";
      listHost.appendChild(empty);
      return;
    }
    entries.forEach(function (entry) {
      var item = made("li");
      item.textContent = entry.action + ": " + entry.detail + " Recorded locally at " + historyTime(entry) + ".";
      listHost.appendChild(item);
    });
  }

  function installHistoryFilters() {
    var filters = one('[data-contract-hook="history-filters"]');
    if (!filters) return;
    all("input, select", filters).forEach(function (input) {
      input.addEventListener("input", renderHistory);
      input.addEventListener("change", renderHistory);
    });
  }

  function html(value) {
    return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function csv(value) {
    return '"' + String(value).replace(/"/g, '""') + '"';
  }

  function exportRecord() {
    return {
      kind: "Minecraft Server Studio browser-local marketing preview",
      generatedAt: new Date().toISOString(),
      boundary: "No server, installer, credential, file content, custom-logo image representation, or runtime data is included.",
      settings: Object.assign({}, state.settings),
      logo: {
        sourceType: state.logo && state.logo.sourceType === "custom" ? "custom" : "preset",
        presetId: logoPreset(state.logo && state.logo.presetId).id,
        customImageOmitted: true
      },
      notificationCount: state.notifications.length,
      history: state.history.map(function (entry) {
        return { action: entry.action, detail: entry.detail, when: historyTime(entry) };
      })
    };
  }

  function serialize(format, record) {
    if (format === "json") return { text: JSON.stringify(record, null, 2), type: "application/json", extension: "json" };
    if (format === "csv") {
      var rows = [["section", "key", "value"]];
      Object.keys(record.settings).forEach(function (key) { rows.push(["settings", key, String(record.settings[key])]); });
      rows.push(["summary", "boundary", record.boundary], ["summary", "notificationCount", String(record.notificationCount)]);
      return { text: rows.map(function (row) { return row.map(csv).join(","); }).join("\r\n"), type: "text/csv", extension: "csv" };
    }
    if (format === "markdown") {
      return {
        text: "# Minecraft Server Studio browser-local marketing preview\n\n**Boundary:** " + record.boundary + "\n\n## Settings\n\n" +
          Object.keys(record.settings).map(function (key) { return "- " + key + ": " + record.settings[key]; }).join("\n") +
          "\n\n## Browser-local history\n\n" + (record.history.length ? record.history.map(function (entry) { return "- " + entry.action + ": " + entry.detail; }).join("\n") : "- No browser-local history entries.") + "\n",
        type: "text/markdown",
        extension: "md"
      };
    }
    return {
      text: "<!doctype html><meta charset=\"utf-8\"><title>Minecraft Server Studio browser-local preview</title><h1>Minecraft Server Studio browser-local marketing preview</h1><p><strong>Boundary:</strong> " + html(record.boundary) + "</p><h2>Settings</h2><ul>" + Object.keys(record.settings).map(function (key) { return "<li>" + html(key) + ": " + html(record.settings[key]) + "</li>"; }).join("") + "</ul>",
      type: "text/html",
      extension: "html"
    };
  }

  function installExports() {
    if (!main || one("[data-mss-export-controls]", main)) return;
    var panel = made("section");
    panel.setAttribute("data-mss-export-controls", "true");
    var heading = made("h2");
    heading.textContent = "Export browser-local demonstration data";
    var copy = made("p");
    copy.textContent = "Choose a format to save this page's local preview settings and demonstration history. The export excludes server data, installer assets, file contents, credentials, and personal vocabulary values.";
    var label = made("label");
    label.textContent = "Format";
    var format = made("select");
    [["json", "JSON"], ["jsonl", "JSON Lines"], ["csv", "CSV"], ["tsv", "TSV"], ["markdown", "Markdown"]].forEach(function (pair) {
      var option = document.createElement("option");
      option.value = pair[0];
      option.textContent = pair[1];
      format.appendChild(option);
    });
    label.appendChild(format);
    var output = made("output");
    output.setAttribute("aria-live", "polite");
    var prepare = button("Prepare browser-local export", function () {
      var record = exportRecord();
      var contractExport = hasContractMethod("createExport") ? safely(function () { return contract.createExport(format.value, [record]); }, null) : null;
      var data = contractExport && contractExport.text ? {
        text: contractExport.text,
        type: contractExport.mime || "text/plain",
        extension: contractExport.format === "markdown" ? "md" : contractExport.format
      } : serialize(format.value, record);
      var mime = data.type || "text/plain";
      var blob = new Blob([data.text], { type: /(?:^|;)\s*charset=/i.test(mime) ? mime : mime + ";charset=utf-8" });
      var url = URL.createObjectURL(blob);
      var link = document.createElement("a");
      link.href = url;
      link.download = "minecraft-server-studio-browser-preview." + data.extension;
      link.hidden = true;
      (body || document.documentElement).appendChild(link);
      link.click();
      window.setTimeout(function () {
        URL.revokeObjectURL(url);
        link.remove();
      }, 1000);
      output.textContent = "A browser-local " + format.value.toUpperCase() + " export was prepared. It contains only this page's demo data.";
      addHistory("Browser-local export prepared", format.value.toUpperCase() + " demo export prepared without server or credential data.");
      notify("success", "Browser-local demo export prepared. It contains no server, installer, credential, file, or runtime data.");
    });
    panel.append(heading, copy, label, prepare, output);
    var install = one("#install");
    if (install && install.parentNode) install.parentNode.insertBefore(panel, install);
    else main.appendChild(panel);
  }

  function installVerifiedDownloadCtas() {
    all("a[data-mss-verified-installer][href]").forEach(function (cta) {
      cta.removeAttribute("aria-disabled");
      cta.removeAttribute("disabled");
      cta.removeAttribute("title");
      delete cta.dataset.mssUnavailable;
      cta.dataset.mssVerified = "true";
    });
    all('[data-contract-hook="download-states"]').forEach(function (grid) {
      delete grid.dataset.mssUnavailable;
      grid.dataset.mssVerified = "true";
    });
  }

  function evidence(status, reference, detail, reason) {
    return {
      status: status,
      reference: reference || "",
      detail: detail || "",
      reason: reason || ""
    };
  }

  function inventoryFeature(id, label, stateValue, notes, statuses) {
    var values = statuses || {};
    return {
      id: id,
      label: label,
      state: stateValue,
      notes: notes,
      evidence: {
        implementation: evidence(values.implementation || "missing", values.implementationReference, values.implementationDetail, values.implementationReason),
        documentation: evidence(values.documentation || "missing", values.documentationReference, values.documentationDetail, values.documentationReason),
        localization: evidence(values.localization || "missing", values.localizationReference, values.localizationDetail, values.localizationReason),
        persistence: evidence(values.persistence || "missing", values.persistenceReference, values.persistenceDetail, values.persistenceReason),
        test: evidence(values.test || "missing", values.testReference, values.testDetail, values.testReason),
        interaction: evidence(values.interaction || "missing", values.interactionReference, values.interactionDetail, values.interactionReason),
        capture: evidence(values.capture || "missing", values.captureReference, values.captureDetail, values.captureReason)
      }
    };
  }

  function handWrittenInventory() {
    var staticHook = {
      implementation: "in-progress",
      implementationReference: "site/index.html data-contract-surface hook",
      implementationDetail: "Static public preview and browser-local interaction only.",
      documentation: "in-progress",
      documentationReference: "site/README.md, site/CONTRACT.md, and site/NARRATOR_AND_SCHEDULE.md",
      persistence: "not-applicable",
      persistenceReason: "This static preview does not own a desktop application record.",
      test: "missing",
      testDetail: "No test result is recorded by this browser-local inventory.",
      interaction: "missing",
      interactionDetail: "No real desktop-app interaction is evidenced by this public page.",
      capture: "missing",
      captureDetail: "No real built-artifact capture is recorded."
    };
    var localContract = {
      implementation: "in-progress",
      implementationReference: "site/contract.js and site/app.js",
      implementationDetail: "Bounded browser-local contract and visible controls are wired together.",
      documentation: "verified",
      documentationReference: "site/CONTRACT.md",
      localization: "missing",
      persistence: "in-progress",
      persistenceReference: "browser localStorage key minecraft-server-studio.site.contract.v2",
      persistenceDetail: "Only this browser's contract state is persisted; no cross-app synchronization exists.",
      test: "missing",
      interaction: "missing",
      capture: "missing"
    };
    var universalControlsCore = {
      implementation: "in-progress",
      implementationReference: "site/index.html, site/app.js, site/contract.js, and site/vocabulary-loader.js",
      implementationDetail: "Real browser-local settings controls persist through the page contract; no desktop action is delegated from this core.",
      documentation: "verified",
      documentationReference: "site/README.md and site/CONTRACT.md",
      localization: "in-progress",
      localizationDetail: "The settings core supplies English, Cantonese, and bilingual copy; page-wide localization remains incomplete.",
      persistence: "in-progress",
      persistenceReference: "browser localStorage key minecraft-server-studio.site.contract.v2",
      persistenceDetail: "Validated values persist only for this page's origin in this browser.",
      test: "missing",
      testDetail: "The fast-delivery lane intentionally did not run tests.",
      interaction: "missing",
      interactionDetail: "No built-artifact interaction is recorded.",
      capture: "missing",
      captureDetail: "No real built-artifact capture is recorded."
    };
    var ollamaBrowserObserver = {
      implementation: "in-progress",
      implementationReference: "site/index.html and site/app.js local Ollama observer",
      implementationDetail: "Only an explicit Refresh can read fixed loopback version, installed-model, and running-model endpoints; the page accepts bounded normalized summaries only.",
      documentation: "verified",
      documentationReference: "site/README.md, site/CONTRACT.md, and docs/features/browser-local-ollama-observer.md",
      persistence: "in-progress",
      persistenceReference: "browser sessionStorage key minecraft-server-studio.site.ollama-observer.v1",
      persistenceDetail: "Only the last successful nonsecret normalized snapshot is retained for the current browser session; no endpoint, token, prompt, or raw response is stored.",
      test: "missing",
      testDetail: "The fast-delivery lane intentionally did not run tests.",
      interaction: "missing",
      interactionDetail: "No real local Ollama interaction is recorded in the evidence set.",
      capture: "missing",
      captureDetail: "No real built-artifact capture is recorded."
    };
    var browserAuthenticator = {
      implementation: "in-progress",
      implementationReference: "site/authenticator-locks.js and site/index.html",
      implementationDetail: "Browser-local RFC 4226/6238 codes, pairing QR reveal/confirmation, registered-target toy locks, and local Support Tickets controls are wired without a network route.",
      documentation: "in-progress",
      documentationReference: "site/README.md, site/CONTRACT.md, and docs/features/browser-local-authenticator-and-toy-locks.md",
      localization: "missing",
      localizationDetail: "This operational surface is English-first in the current delivery lane.",
      persistence: "in-progress",
      persistenceReference: "browser localStorage key minecraft-server-studio.site.authenticator-locks.v1",
      persistenceDetail: "Bounded origin-scoped browser storage is used because the static page has no operating-system credential vault; it is not a security boundary.",
      test: "missing",
      testDetail: "No automated test was run in this fast-delivery lane.",
      interaction: "missing",
      interactionDetail: "No built-site interaction is recorded.",
      capture: "missing",
      captureDetail: "No real built-site capture is recorded."
    };
    var narratorAndSchedules = {
      implementation: "in-progress",
      implementationReference: "site/index.html, site/app.js, and site/contract.js",
      implementationDetail: "Optional browser speech, late voice enumeration, serialized event queue, and bounded local schedule records are implemented without a network source.",
      documentation: "verified",
      documentationReference: "site/README.md and site/CONTRACT.md",
      localization: "in-progress",
      localizationDetail: "The controls expose English baseline copy; page-wide localization remains incomplete.",
      persistence: "in-progress",
      persistenceReference: "browser localStorage key minecraft-server-studio.site.contract.v2, schema version 5, schedule rule version 1",
      persistenceDetail: "Voice identities and schedule rules persist only in this browser and only after bounded validation.",
      test: "missing",
      testDetail: "The fast-delivery lane intentionally did not run tests.",
      interaction: "missing",
      interactionDetail: "No built-artifact interaction is recorded.",
      capture: "missing",
      captureDetail: "No real built-artifact capture is recorded."
    };
    var browserLocalLogo = {
    var browserLocalLogo = {
      implementation: "in-progress",
      implementationReference: "site/index.html, site/app.js, and site/contract.js",
      implementationDetail: "Shipped CSS/markup presets and a bounded custom PNG/JPEG display path operate only in this browser-local page.",
      documentation: "verified",
      documentationReference: "site/README.md, site/CONTRACT.md, and docs/features/site-logo-customization.md",
      localization: "in-progress",
      localizationDetail: "The foundation is English-first while the settings core supplies the page language modes.",
      persistence: "in-progress",
      persistenceReference: "browser localStorage key minecraft-server-studio.site.contract.v2 logo record",
      persistenceDetail: "Only a bounded derived data URL and presentation metadata can persist for this site origin; no source path, name, or original image is retained.",
      test: "missing",
      testDetail: "The fast-delivery lane intentionally did not run tests.",
      interaction: "missing",
      interactionDetail: "No built-site interaction is recorded.",
      capture: "missing",
      captureDetail: "No real built-site capture is recorded."
    };
    var surfaces = [
      { id: "marketing-shell", label: "Marketing landing shell", route: "#main-content", features: [
        inventoryFeature("marketing-copy", "Marketing content and direct installer boundary", "in-progress", "The page exposes a static verified installer anchor and must not simulate a transfer.", staticHook),
        inventoryFeature("marketing-status", "Browser-local status model", "in-progress", "The page stores its status model in browser local storage only; no chat or status-service bridge exists.", localContract)
      ] },
      { id: "settings", label: "Settings and appearance preview", route: "#settings-preview", features: [
        inventoryFeature("settings-controls", "Visible browser-local language, independently persisted funny-level, and notice-emoji controls", "in-progress", "These controls operate this public page rather than delegating to the installed application.", universalControlsCore),
        inventoryFeature("appearance-tab-foundation", "Browser-local appearance and feature-tab foundation", "in-progress", "Theme, density, accent, safe generic typography, docked feature tabs, groups, pins, order, searches, and bounded appearance targets are wired locally. The full per-element and proof contract remains incomplete.", universalControlsCore),
        inventoryFeature("event-narrator", "Optional browser-local event narrator", "in-progress", "Uses actual browser speechSynthesis voices only after opt-in; browser screen-reader activity cannot be reliably detected.", narratorAndSchedules),
        inventoryFeature("scheduled-settings", "Browser-local language and appearance schedules", "in-progress", "Local date, time, weekday, priority, and tie-break rules are wired; HTTPS and Home Assistant options remain explicitly unavailable.", narratorAndSchedules),
        inventoryFeature("site-logo-customization", "Browser-local public-page logo customization", "in-progress", "Shipped CSS/markup presets and a byte-validated bounded custom PNG/JPEG display representation are local to this browser and never alter product identity.", browserLocalLogo),
        inventoryFeature("personal-vocabulary", "Personal vocabulary JSON loader", "in-progress", "Strict version-1 parser and revalidation protect the local cache; no file name, path, upload, or telemetry.", universalControlsCore),
        inventoryFeature("renamed-presentation-mode", "Renamed browser-local presentation mode", "in-progress", "The local one-way verifier controls English-only presentation and suppression; it is a user-experience lock, not security protection.", universalControlsCore)
      ] },
      { id: "documentation", label: "Offline documentation preview", route: "#docs-preview", features: [inventoryFeature("documentation-preview", "Static documentation and search preview", "in-progress", "The page links static content but does not prove a packaged offline documentation browser.", staticHook)] },
      { id: "converter", label: "Browser-local file converter", route: "#converter-preview", features: [inventoryFeature("converter-local-routes", "Bounded browser-local text, structured-data, and encoding conversions", "in-progress", "The page byte-sniffs selected bounded files, enables only bundled browser-local adapters, and never persists source/output bytes or claims a browser download completed.", localContract)] },
      { id: "authenticator", label: "Browser-local authenticator and toy locks", route: "#authenticator-preview", features: [inventoryFeature("browser-local-authenticator-and-toy-locks", "Browser-local TOTP, pairing QR, toy-lock, and Support Tickets foundation", "in-progress", "The independently stored browser-local record excludes ordinary export/history/status data and remains incomplete for QR import, every-element locks, localization, testing, interaction, and capture evidence.", browserAuthenticator)] },
      { id: "ollama", label: "Local Ollama suite preview", route: "#ollama-preview", features: [
        inventoryFeature("ollama-local-observer", "User-triggered fixed-loopback Ollama observer", "in-progress", "The browser reads only the documented local version, installed-model, and running-model endpoints after explicit Refresh, with no proxy, redirect, token, cloud fallback, or background request.", ollamaBrowserObserver),
        inventoryFeature("ollama-privileged-boundary", "Unavailable browser-only Ollama actions", "in-progress", "Model Store, pull, chat, delete, copy, hardware-fit, and harness actions remain visibly unavailable because this static browser surface cannot safely implement them.", ollamaBrowserObserver)
      ] },
      { id: "history", label: "Local history preview", route: "#history-preview", features: [inventoryFeature("history-preview", "Browser-local audit preview", "in-progress", "The browser-local contract audit is not Git-backed desktop history.", localContract)] },
      { id: "notifications", label: "Notification center preview", route: "#notifications-preview", features: [inventoryFeature("notification-preview", "Browser-local notification preview", "in-progress", "Notifications are browser-local and do not represent a server or installer outcome.", localContract)] },
      { id: "downloads", label: "Download and release states", route: "#downloads-preview", features: [inventoryFeature("download-boundary", "Static verified installer anchor", "in-progress", "The browser owns transfer behavior; this page does not start, track, pause, resume, or confirm a transfer.", staticHook)] }
    ];
    return { surfaces: surfaces };
  }

  function renderCompletenessStatus() {
    var surface = one('[data-contract-surface="status"]');
    var host = surface && one('[data-contract-hook="status-local-evidence"]', surface);
    if (!host || !hasContractMethod("getCompletenessSummary")) return;
    var summary = safely(function () { return contract.getCompletenessSummary(); }, null);
    if (!summary) return;
    var output = one("[data-mss-completeness-summary]", host);
    if (!output) {
      output = made("span");
      output.setAttribute("data-mss-completeness-summary", "true");
      host.appendChild(output);
    }
    output.textContent = "Hand-written browser-local inventory: " + summary.surfaces + " surfaces, " + summary.features + " feature records, " + summary.incompleteFeatures + " incomplete. Missing proof remains visible rather than treated as shipped.";
  }

  function seedCompletenessInventory() {
    if (!hasContractMethod("setCompletenessInventory")) return;
    var current = safely(function () { return contract.getCompletenessInventory(); }, null);
    var desired = handWrittenInventory();
    var signature = function (inventory) {
      return inventory && Array.isArray(inventory.surfaces) ? inventory.surfaces.map(function (surface) {
        return surface.id + ":" + (Array.isArray(surface.features) ? surface.features.map(function (feature) { return feature.id; }).sort().join(",") : "");
      }).sort().join("|") : "";
    };
    if (signature(current) !== signature(desired)) {
      safely(function () { contract.setCompletenessInventory(desired); });
    }
    renderCompletenessStatus();
  }

  function renderStatusModel() {
    var surface = one('[data-contract-surface="status"]');
    if (!surface || !hasContractMethod("getStatusModel")) return;
    var model = safely(function () { return contract.getStatusModel(); }, null);
    if (!model) return;
    var summary = one('[data-contract-hook="status-summary"]', surface);
    var current = one('[data-contract-hook="status-current-state"] output', surface);
    var lastUpdated = one('[data-contract-hook="status-last-updated"] span', surface);
    var bridge = one('[data-contract-hook="status-no-bridge"] span', surface);
    var evidenceHost = one('[data-contract-hook="status-local-evidence"] span', surface);
    var interactions = one('[data-contract-hook="status-active-interactions"] span', surface);
    var nextSteps = one('[data-contract-hook="status-next-steps"] span', surface);
    if (summary) summary.textContent = model.summary;
    if (current) current.textContent = "Browser-local state: " + model.currentState + ". This is not server, installer, release, or desktop-app health.";
    if (lastUpdated) lastUpdated.textContent = model.lastUpdatedAt ? "Updated in this browser: " + model.lastUpdatedAt : "No browser-local status update has been recorded.";
    if (bridge) bridge.textContent = model.chatBridge.message;
    if (evidenceHost) evidenceHost.textContent = model.evidence.length ? model.evidence.map(function (item) { return item.label + ": " + item.state + "."; }).join(" ") : "No browser-local evidence has been recorded yet.";
    if (interactions) interactions.textContent = model.activeInteractions.length ? model.activeInteractions.map(function (item) { return item.label + ": " + item.state + "."; }).join(" ") : "No browser-local interaction is active. The page does not run desktop actions.";
    if (nextSteps) nextSteps.textContent = model.nextSteps.length ? model.nextSteps.map(function (item) { return item.label + ": " + item.detail; }).join(" ") : "Use the direct installer link only when you choose to hand transfer control to your browser.";
  }

  function seedStatusModel() {
    if (!hasContractMethod("updateStatusModel")) return;
    var current = safely(function () { return contract.getStatusModel(); }, null);
    if (!current || current.currentState === "idle") {
      safely(function () {
        contract.updateStatusModel({
          currentState: "waiting",
          summary: "This status model is browser-local. It reports the static public preview only and is not connected to a server, installer, desktop application, release workflow, or chat service.",
          evidence: [{ id: "marketing-source", label: "Static public preview source", state: "verified", detail: "The marketing surface and direct installer anchor are present in this page source.", reference: "site/index.html" }],
          activeInteractions: [{ id: "browser-local", label: "Browser-local interaction boundary", state: "waiting", detail: "No desktop action or network transfer is active from this page." }],
          nextSteps: [{ id: "installer-link", label: "Optional direct installer handoff", state: "waiting", detail: "The user may activate the verified link; browser transfer and installation are outside this page." }]
        });
      });
    }
    renderStatusModel();
  }

  function installPalette() {
    if (!main || one("[data-mss-palette]")) return;
    var palette = made("dialog");
    palette.setAttribute("data-mss-palette", "true");
    palette.setAttribute("aria-label", "Command palette");
    var heading = made("h2");
    heading.textContent = "Command palette";
    var copy = made("p");
    copy.textContent = "Navigate browser-local feature previews and settings. No desktop action can run from this page.";
    var label = made("label");
    label.textContent = "Find a command or feature";
    var input = made("input");
    input.type = "search";
    input.placeholder = "Search public page destinations";
    label.appendChild(input);
    var results = made("div");
    results.setAttribute("role", "list");
    results.setAttribute("aria-live", "polite");
    palette.append(heading, copy, label, results, button("Close palette", function () { closeDialog(palette); }));
    (body || document.documentElement).appendChild(palette);
    function commands() {
      var fallback = all("[data-contract-surface], section[id]").map(function (element) {
        var heading = one("h2, h3", element);
        return { id: element.id, label: (heading ? heading.textContent : element.id || "Feature preview").trim() };
      }).filter(function (entry) { return entry.id; });
      if (!hasContractMethod("searchCommandPalette")) return fallback;
      var registered = safely(function () { return contract.searchCommandPalette(""); }, []);
      return Array.isArray(registered) && registered.length ? registered.map(function (entry) {
        return { id: entry.elementId, label: entry.title, commandId: entry.id };
      }).filter(function (entry) { return entry.id; }) : fallback;
    }
    function render() {
      var needle = input.value.toLocaleLowerCase();
      results.replaceChildren();
      commands().filter(function (entry) {
        return !needle || entry.label.toLocaleLowerCase().indexOf(needle) !== -1 || entry.id.toLocaleLowerCase().indexOf(needle) !== -1;
      }).slice(0, 20).forEach(function (entry) {
          var result = button(entry.label, function () {
          closeDialog(palette);
          if (entry.commandId && hasContractMethod("teleportTo")) {
            var outcome = safely(function () { return contract.teleportTo(entry.commandId); }, null);
            if (!outcome || outcome.ok !== true) activate(entry.id, result);
          } else {
            activate(entry.id, result);
          }
        });
        result.setAttribute("role", "listitem");
        results.appendChild(result);
      });
      if (!results.childElementCount) results.textContent = "No matching command or feature.";
    }
    input.addEventListener("input", render);
    document.addEventListener("keydown", function (event) {
      if (!(event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "f")) return;
      event.preventDefault();
      render();
      if (typeof palette.showModal === "function") {
        if (!palette.open) palette.showModal();
      } else {
        palette.hidden = false;
      }
      input.focus();
      live("Command palette opened.");
    });
  }

  function initialize() {
    body = document.body || body;
    main = document.getElementById("main-content") || document.querySelector("main") || main;
    contract = window.MinecraftServerStudioContract || contract;
    if (!main || root.getAttribute("data-mss-interactions-ready") === "true") return;
    root.setAttribute("data-mss-interactions-ready", "true");
    hydrateContractState();
    seedStatusModel();
    seedCompletenessInventory();
    installSettings();
    installNarrator();
    installSchedules();
    installSchoolMode();
    installLogoCustomization();
    installTabsAndArticles();
    installAppearanceEditor();
    installCollapsibleLists();
    installConverterPlanner();
    installOllamaPreview();
    installAuthenticatorEducation();
    renderNotifications();
    installDestructiveDemo();
    installHistoryFilters();
    installExports();
    installVerifiedDownloadCtas();
    installSearches();
    installPalette();
    if (hasContractMethod("subscribe")) {
      safely(function () {
        contract.subscribe(function () {
          hydrateContractState();
          syncSettingsControls();
          applySettingsPresentation();
          syncNarratorControls();
          renderScheduleList();
          renderLogoCustomizer();
          renderVocabularyStatus();
          renderNotifications();
          renderHistory();
          renderStatusModel();
          renderCompletenessStatus();
        });
      });
    }
    notify("info", "Browser-local product preview ready. This page does not contact a server, installer, runtime, or file service.");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
  else initialize();
}());
