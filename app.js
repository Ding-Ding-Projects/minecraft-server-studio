(function () {
  "use strict";

  /*
   * Browser-local marketing interactions only.
   * No fetch, server control, installer action, credential storage, runtime query,
   * or conversion occurs in this file. A user-selected personal-vocabulary JSON
   * file is read locally only so the contract can validate and store its bounded
   * payload in this browser's local storage.
   */

  var root = document.documentElement;
  var body = document.body;
  var main = document.getElementById("main-content") || document.querySelector("main");
  var contract = window.MinecraftServerStudioContract || null;
  var dialog = null;
  var generated = "data-mss-generated";
  var originals = new Map();
  var state = {
    notifications: [],
    history: [],
    settings: defaultSettings()
  };

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
    state.settings = settings;
    state.notifications = Array.isArray(snapshot.notifications) ? snapshot.notifications.slice() : [];
    state.history = Array.isArray(snapshot.audit) ? snapshot.audit.slice() : [];
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
    all(".feature-tab").forEach(function (tab) {
      var active = tab.getAttribute("href") === "#" + targetId;
      tab.setAttribute("aria-selected", String(active));
      tab.setAttribute("aria-current", active ? "page" : "false");
      tab.toggleAttribute("data-mss-active-tab", active);
    });
    all("[data-contract-surface]").forEach(function (surface) {
      surface.toggleAttribute("data-mss-active-surface", surface === target);
    });
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

  function languageMode(label) {
    return { "English": "english", "Playful Hong Kong-style Cantonese": "cantonese", "Bilingual": "bilingual" }[label] || "english";
  }

  function themeLabel(theme) {
    return { system: "System default", light: "Light", dark: "Dark" }[theme] || "System default";
  }

  function themeValue(label) {
    return { "System default": "system", "Light": "light", "Dark": "dark" }[label] || "system";
  }

  function syncSettingsControls(surface) {
    var scope = surface || one('[data-contract-surface="settings"]');
    if (!scope) return;
    var settings = state.settings;
    var language = one('[data-contract-hook="language-mode"] select', scope);
    var englishTone = one('[data-contract-hook="english-funny-level"] input[type="range"]', scope);
    var cantoneseTone = one('[data-contract-hook="cantonese-funny-level"] input[type="range"]', scope);
    var theme = one('[data-contract-hook="appearance-theme"] select', scope);
    var density = one('[data-contract-hook="density"] select', scope);
    var emojiToggle = one('[data-contract-hook="emoji-toggle"] input[type="checkbox"]', scope);
    if (language) language.value = languageLabel(settings.languageMode);
    if (englishTone) englishTone.value = String(settings.funnyLevel.english);
    if (cantoneseTone) cantoneseTone.value = String(settings.funnyLevel.cantonese);
    if (theme) theme.value = themeLabel(settings.appearance.theme);
    if (density) density.value = settings.appearance.density;
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
    root.lang = settings.languageMode === "cantonese" ? "zh-Hant" : "en";
    var output = one("[data-mss-settings-status]");
    if (output) output.textContent = "Browser-local preferences are stored in this browser's local storage: " + languageLabel(settings.languageMode) + ", " + themeLabel(settings.appearance.theme) + " theme, " + settings.appearance.density + " density. Nothing is sent to a server or desktop application.";
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

    if (!one('[data-contract-hook="density"]', surface)) {
      var density = made("select");
      [["comfortable", "Comfortable"], ["compact", "Compact"], ["spacious", "Spacious"]].forEach(function (pair) {
        var option = document.createElement("option");
        option.value = pair[0];
        option.textContent = pair[1];
        density.appendChild(option);
      });
      density.addEventListener("change", function () {
        updateSettings({ appearance: { density: density.value } }, "density", "Density preference updated for this browser-local preview.");
      });
      grid.appendChild(generatedSetting("Density", density, "density"));
    }

    if (!one('[data-contract-hook="emoji-toggle"]', surface)) {
      var emojiToggle = made("input");
      emojiToggle.type = "checkbox";
      emojiToggle.addEventListener("change", function () {
        updateSettings({ showDialogEmoji: emojiToggle.checked }, "dialog-emoji", "Emoji decoration updated. The factual status stays the same.");
      });
      grid.appendChild(generatedSetting("Show emojis in browser-local notices", emojiToggle, "emoji-toggle"));
    }

    var logo = one('[data-contract-hook="app-logo-upload"] input[type="file"]', surface);
    if (logo) logo.addEventListener("change", function () {
      if (logo.files && logo.files[0]) {
        addHistory("Preview input selected", "A local logo input was selected without upload.");
        notify("info", "A logo was selected for a browser-local preview only. It was not uploaded, stored, or used as application identity.");
      }
    });

    var vocabularyInput = one('[data-contract-hook="personal-vocabulary-upload"] input[type="file"]', surface);
    if (vocabularyInput) {
      var vocabularyHint = one('[data-contract-hook="personal-vocabulary-upload"] small', surface);
      if (vocabularyHint) vocabularyHint.textContent = "Version 1 JSON only: a bounded list of from/to replacement entries is validated and stored only in this browser until cleared.";
      vocabularyInput.addEventListener("change", function () {
        loadVocabulary(vocabularyInput.files && vocabularyInput.files[0], vocabularyInput);
      });
      var clearer = button("Clear in-page vocabulary preview", function () {
        clearVocabulary();
        vocabularyInput.value = "";
        notify("info", "The browser-local vocabulary cache was cleared. No source file name or path was retained.");
      });
      var owner = vocabularyInput.closest("label");
      if (owner) {
        owner.appendChild(clearer);
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
    var replacements = payload && Array.isArray(payload.replacements) ? payload.replacements : [];
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
    if (state.settings.schoolMode.active) {
      output.textContent = "A validated vocabulary cache is stored locally but is inactive while School mode is enabled.";
      return;
    }
    output.textContent = payload.replacements.length + " validated replacement entries are stored only in this browser's local storage. Clear removes the local cache immediately.";
  }

  function clearVocabulary() {
    if (hasContractMethod("clearPersonalVocabulary")) safely(function () { contract.clearPersonalVocabulary(); });
    hydrateContractState();
    restoreVocabulary();
    renderVocabularyStatus();
    renderHistory();
  }

  function loadVocabulary(file, input) {
    if (!file) return;
    var reader = new FileReader();
    reader.onerror = function () {
      input.value = "";
      notify("warning", "The vocabulary file could not be read locally. Nothing was applied.");
    };
    reader.onload = function () {
      var source = String(reader.result || "");
      var result = hasContractMethod("loadPersonalVocabulary") ? safely(function () { return contract.loadPersonalVocabulary(source); }, null) : null;
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
    reader.readAsText(file);
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
    return (element.textContent || "").replace(/\s+/g, " ").trim();
  }

  function makeRegexBuilder(input, options) {
    if (!input || input.getAttribute("data-mss-regex-ready") === "true") return;
    input.setAttribute("data-mss-regex-ready", "true");
    var scope = options.scope || input.closest("[data-contract-surface]") || main || body;
    var candidates = options.candidates || function () { return []; };
    var globalResults = options.globalResults;
    var labelText = options.label || "this search";
    var host = input.closest(".preview-search, .history-controls") || input.parentElement || scope;
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
            var target = item.id || (item.closest("[id]") && item.closest("[id]").id);
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
      var surface = input.closest("[data-contract-surface]") || input.closest("section") || main;
      makeRegexBuilder(input, {
        label: (input.closest("label") && input.closest("label").textContent || "this surface").trim(),
        scope: surface,
        candidates: function () {
          return all("label, a, li, article, .auth-card, .format-catalog span, .ollama-state, .empty-state", surface).filter(function (item) {
            return item.getAttribute(generated) !== "true";
          });
        }
      });
    });
  }

  function installTabsAndArticles() {
    var tabList = one(".feature-tabs");
    var tabs = all(".feature-tab", tabList);
    if (hasContractMethod("setTeleportHandler")) {
      safely(function () {
        contract.setTeleportHandler(function (command) {
          if (!command || !command.elementId) return false;
          activate(command.elementId);
          return true;
        });
      });
    }
    if (tabList && tabs.length) {
      tabList.setAttribute("role", "tablist");
      tabList.setAttribute("aria-label", "Feature previews");
      tabs.forEach(function (tab, index) {
        var targetId = (tab.getAttribute("href") || "").replace(/^#/, "");
        tab.setAttribute("role", "tab");
        tab.setAttribute("aria-controls", targetId);
        tab.setAttribute("aria-selected", String(index === 0));
        tab.addEventListener("click", function () {
          if (targetId) window.setTimeout(function () { activate(targetId, tab); }, 0);
        });
        tab.addEventListener("keydown", function (event) {
          var position = tabs.indexOf(tab);
          var next = null;
          if (event.key === "ArrowRight" || event.key === "ArrowDown") next = tabs[(position + 1) % tabs.length];
          if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = tabs[(position - 1 + tabs.length) % tabs.length];
          if (event.key === "Home") next = tabs[0];
          if (event.key === "End") next = tabs[tabs.length - 1];
          if (!next) return;
          event.preventDefault();
          next.focus();
          next.click();
        });
        if (hasContractMethod("registerCommand")) {
          safely(function () {
            contract.registerCommand({
              id: "destination-" + targetId,
              title: (tab.textContent || targetId).trim(),
              description: "Open this browser-local product preview.",
              group: "Browser-local destinations",
              elementId: targetId,
              keywords: [targetId, "preview", "local"]
            });
          });
        }
      });
    }
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
    makeListInteractive(one('[data-contract-hook="converter-adapter-catalog"]'), "adapter categories");
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
    if (!surface || !picker || one("[data-mss-converter-plan]", surface)) return;
    var plan = made("section");
    plan.setAttribute("data-mss-converter-plan", "true");
    var heading = made("h3");
    heading.textContent = "Browser-local conversion planner";
    var note = made("p");
    note.textContent = "This planner only records the browser-provided file label and your intended category for this open tab. It does not inspect bytes, select a real adapter, convert a file, upload a file, or write output.";
    var categoryLabel = made("label");
    categoryLabel.textContent = "Plan category";
    var category = made("select");
    ["Documents / PDF", "Images", "Audio", "Video", "Archives", "Structured data", "Code / text", "Binary encodings"].forEach(function (name) {
      var option = document.createElement("option");
      option.textContent = name;
      category.appendChild(option);
    });
    categoryLabel.appendChild(category);
    var targetLabel = made("label");
    targetLabel.textContent = "Intended output note";
    var target = made("select");
    ["Choose later in the desktop app", "Review compatible adapters locally", "Keep source unchanged"].forEach(function (name) {
      var option = document.createElement("option");
      option.textContent = name;
      target.appendChild(option);
    });
    targetLabel.appendChild(target);
    var summary = made("output");
    summary.setAttribute("aria-live", "polite");
    function render() {
      var file = picker.files && picker.files[0];
      summary.textContent = (file ? "Selected in this browser only: " + file.name + " (" + humanSize(file.size) + "). " : "No source file selected. ") + "Plan: " + category.value + ". " + target.value + ".";
    }
    picker.addEventListener("change", function () {
      render();
      notify("info", "A local file selection is visible only to this browser page. No file bytes were read, uploaded, converted, or retained.");
    });
    category.addEventListener("change", function () {
      render();
      addHistory("Conversion plan changed", "Planner category set to " + category.value + ".");
    });
    target.addEventListener("change", render);
    plan.append(heading, note, categoryLabel, targetLabel, summary);
    var layout = one(".converter-layout", surface) || surface;
    insertAfter(layout, plan);
    render();
  }

  function installOllamaPreview() {
    var surface = one('[data-contract-surface="ollama-manager"]');
    var host = one('[data-contract-hook="ollama-status"]', surface);
    if (!surface || !host || one("[data-mss-ollama-preview]", surface)) return;
    var area = made("div");
    area.setAttribute("data-mss-ollama-preview", "true");
    var label = made("label");
    label.textContent = "Browser-local preview state";
    var select = made("select");
    [["not-checked", "No runtime checked"], ["offline-info", "Offline information only"], ["desktop-boundary", "Desktop app boundary explained"]].forEach(function (pair) {
      var option = document.createElement("option");
      option.value = pair[0];
      option.textContent = pair[1];
      select.appendChild(option);
    });
    label.appendChild(select);
    var output = made("output");
    output.setAttribute("aria-live", "polite");
    function render() {
      var messages = {
        "not-checked": "No local runtime is queried from this public page.",
        "offline-info": "Offline information only: use the installed desktop app to inspect a local runtime.",
        "desktop-boundary": "The installed desktop app owns local runtime health, models, pulls, chats, and harness controls."
      };
      output.textContent = messages[select.value];
      root.dataset.mssOllamaPreview = select.value;
    }
    select.addEventListener("change", render);
    area.append(label, button("Refresh browser-local preview", function () {
      render();
      notify("info", "The Ollama preview was refreshed locally. This page did not call localhost or any model service.");
    }), output);
    host.appendChild(area);
    render();
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
    if (!surface || one("[data-mss-auth-education]", surface)) return;
    var area = made("section");
    area.setAttribute("data-mss-auth-education", "true");
    var heading = made("h3");
    heading.textContent = "Educational browser-local preview";
    var copy = made("p");
    copy.textContent = "This page deliberately has no secret, password, code, QR, or recovery form. Those sensitive local-only flows belong to the installed desktop app.";
    area.append(heading, copy);
    area.appendChild(button("Read authenticator boundary", function () {
      showDialog("Authenticator boundary", function (content) {
        var paragraph = made("p");
        paragraph.textContent = "This public page does not accept, generate, scan, store, reveal, or export authenticator secrets. It only explains that the installed desktop app manages local authenticator entries.";
        content.appendChild(paragraph);
      });
    }));
    area.appendChild(button("Read toy-lock boundary", function () {
      showDialog("Toy-lock boundary", function (content) {
        var paragraph = made("p");
        paragraph.textContent = "Element and tab locks are a local desktop-app feature. This page does not ask for a password or one-time code, and it cannot lock or unlock content.";
        content.appendChild(paragraph);
      });
    }));
    surface.appendChild(area);
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
      boundary: "No server, installer, credential, file content, or runtime data is included.",
      settings: Object.assign({}, state.settings),
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
      documentation: "verified",
      documentationReference: "site/README.md and site/CONTRACT.md",
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
    var surfaces = [
      { id: "marketing-shell", label: "Marketing landing shell", route: "#main-content", features: [
        inventoryFeature("marketing-copy", "Marketing content and direct installer boundary", "in-progress", "The page exposes a static verified installer anchor and must not simulate a transfer.", staticHook),
        inventoryFeature("marketing-status", "Browser-local status model", "in-progress", "The page stores its status model in browser local storage only; no chat or status-service bridge exists.", localContract)
      ] },
      { id: "settings", label: "Settings and appearance preview", route: "#settings-preview", features: [
        inventoryFeature("settings-controls", "Visible browser-local language, funny-level, theme, density, and emoji controls", "in-progress", "Controls use the local contract but do not alter the installed application.", localContract),
        inventoryFeature("personal-vocabulary", "Personal vocabulary JSON loader", "in-progress", "Exact bounded version-1 array schema; local cache only; no file name, path, upload, or telemetry.", localContract)
      ] },
      { id: "documentation", label: "Offline documentation preview", route: "#docs-preview", features: [inventoryFeature("documentation-preview", "Static documentation and search preview", "in-progress", "The page links static content but does not prove a packaged offline documentation browser.", staticHook)] },
      { id: "converter", label: "File converter preview", route: "#converter-preview", features: [inventoryFeature("converter-boundary", "Unavailable browser conversion boundary", "in-progress", "The static page does not read bytes, select an adapter, or write output.", staticHook)] },
      { id: "authenticator", label: "Authenticator and toy-lock preview", route: "#authenticator-preview", features: [inventoryFeature("authenticator-boundary", "Credential-free public preview", "in-progress", "No secret, password, QR, or recovery data is accepted by the public page.", staticHook)] },
      { id: "ollama", label: "Local Ollama suite preview", route: "#ollama-preview", features: [inventoryFeature("ollama-boundary", "No runtime-query public preview", "in-progress", "The page does not call localhost or a model service.", staticHook)] },
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
    var expectedIds = desired.surfaces.map(function (surface) { return surface.id; }).sort().join(",");
    var currentIds = current && Array.isArray(current.surfaces) ? current.surfaces.map(function (surface) { return surface.id; }).sort().join(",") : "";
    if (currentIds !== expectedIds) {
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
    installTabsAndArticles();
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
