(function () {
  "use strict";

  /*
   * Browser-local marketing interactions only.
   * No fetch, server control, installer action, file upload, credential storage,
   * runtime query, or conversion occurs in this file.
   */

  var root = document.documentElement;
  var body = document.body;
  var main = document.getElementById("main-content") || document.querySelector("main");
  var contract = window.MinecraftServerStudioContract || null;
  var session = null;
  var dialog = null;
  var generated = "data-mss-generated";
  var originals = new Map();
  var state = {
    notifications: [],
    history: [],
    vocabulary: new Map(),
    settings: {
      language: "English",
      englishTone: "3",
      cantoneseTone: "3",
      theme: "System default",
      density: "comfortable",
      emojis: true,
      socialStyle: "balanced"
    }
  };

  try { session = window.sessionStorage; } catch (_) { session = null; }

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

  function storageKey(key) {
    return "minecraft-server-studio-marketing:" + key;
  }

  function contractRead(key) {
    if (!contract) return undefined;
    var reads = [
      function () { return typeof contract.getSetting === "function" ? contract.getSetting(key) : undefined; },
      function () { return contract.settings && typeof contract.settings.get === "function" ? contract.settings.get(key) : undefined; },
      function () { return contract.settings && Object.prototype.hasOwnProperty.call(contract.settings, key) ? contract.settings[key] : undefined; }
    ];
    for (var index = 0; index < reads.length; index += 1) {
      var result = safely(reads[index], undefined);
      if (result !== undefined && !(result && typeof result.then === "function")) return result;
    }
    return undefined;
  }

  function saved(key, fallback) {
    var fromContract = contractRead(key);
    if (fromContract !== undefined) return fromContract;
    if (!session) return fallback;
    var raw = safely(function () { return session.getItem(storageKey(key)); }, null);
    return raw ? safely(function () { return JSON.parse(raw); }, fallback) : fallback;
  }

  function persist(key, value) {
    if (session) safely(function () { session.setItem(storageKey(key), JSON.stringify(value)); });
    if (!contract) return;
    safely(function () {
      if (typeof contract.setSetting === "function") contract.setSetting(key, value);
      else if (contract.settings && typeof contract.settings.set === "function") contract.settings.set(key, value);
      else if (typeof contract.persistSetting === "function") contract.persistSetting(key, value);
    });
  }

  function localize(key, fallback) {
    if (!contract) return fallback;
    var result = safely(function () {
      if (typeof contract.localize === "function") return contract.localize(key, fallback);
      if (typeof contract.t === "function") return contract.t(key, fallback);
      if (contract.localization && typeof contract.localization.get === "function") return contract.localization.get(key, fallback);
      return undefined;
    }, undefined);
    return typeof result === "string" && result ? result : fallback;
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
    if (!state.settings.emojis) return "";
    return { info: "ℹ ", success: "✓ ", warning: "⚠ ", demo: "◇ " }[level] || "ℹ ";
  }

  function addHistory(action, detail) {
    var entry = {
      id: "history-" + Date.now() + "-" + Math.random().toString(16).slice(2),
      action: action,
      detail: detail,
      when: new Date().toISOString()
    };
    state.history.unshift(entry);
    if (state.history.length > 30) state.history.length = 30;
    if (contract) safely(function () {
      if (typeof contract.recordHistory === "function") contract.recordHistory(entry);
      else if (contract.history && typeof contract.history.record === "function") contract.history.record(entry);
    });
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
    state.notifications.unshift(notice);
    if (state.notifications.length > 12) state.notifications.length = 12;
    if (contract) safely(function () {
      if (typeof contract.notify === "function") contract.notify(notice);
      else if (contract.notifications && typeof contract.notifications.add === "function") contract.notifications.add(notice);
    });
    renderNotifications();
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

  function applySettingsPresentation() {
    root.dataset.mssLanguageMode = state.settings.language;
    root.dataset.mssTheme = state.settings.theme;
    root.dataset.mssDensity = state.settings.density;
    root.dataset.mssSocialStyle = state.settings.socialStyle;
    root.dataset.mssEmojis = state.settings.emojis ? "on" : "off";
    root.lang = state.settings.language === "Playful Hong Kong-style Cantonese" ? "zh-Hant" : "en";
    var output = one("[data-mss-settings-status]");
    if (output) output.textContent = "Browser-local preview: " + state.settings.language + ", " + state.settings.theme + " theme, " + state.settings.density + " density.";
    emit("settings-changed", Object.assign({}, state.settings));
  }

  function updateSetting(key, value, message) {
    state.settings[key] = value;
    persist("setting:" + key, value);
    applySettingsPresentation();
    addHistory("Settings changed", key + " set to " + value + ".");
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
    var status = one("[data-mss-settings-status]", surface);
    if (!status) {
      status = made("p");
      status.setAttribute("data-mss-settings-status", "true");
      status.setAttribute("role", "status");
      insertAfter(grid, status);
    }

    var language = one('[data-contract-hook="language-mode"] select', surface);
    if (language) {
      language.value = saved("setting:language", language.value || "English");
      state.settings.language = language.value;
      language.addEventListener("change", function () {
        updateSetting("language", language.value, "Language preference updated for this browser-local preview.");
      });
    }

    [
      ["english-funny-level", "englishTone", "English tone"],
      ["cantonese-funny-level", "cantoneseTone", "Cantonese tone"]
    ].forEach(function (definition) {
      var input = one('[data-contract-hook="' + definition[0] + '"] input[type="range"]', surface);
      if (!input) return;
      var output = one('[data-contract-hook="' + definition[0] + '"] output', surface);
      input.value = saved("setting:" + definition[1], input.value || "3");
      state.settings[definition[1]] = input.value;
      if (output) output.textContent = input.value + " of 5";
      input.addEventListener("input", function () {
        if (output) output.textContent = input.value + " of 5";
      });
      input.addEventListener("change", function () {
        updateSetting(definition[1], input.value, definition[2] + " updated for this local demonstration.");
      });
    });

    var theme = one('[data-contract-hook="appearance-theme"] select', surface);
    if (theme) {
      theme.value = saved("setting:theme", theme.value || "System default");
      state.settings.theme = theme.value;
      theme.addEventListener("change", function () {
        updateSetting("theme", theme.value, "Theme preference updated for this browser-local preview.");
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
      density.value = saved("setting:density", "comfortable");
      state.settings.density = density.value;
      density.addEventListener("change", function () {
        updateSetting("density", density.value, "Density preference updated for this browser-local preview.");
      });
      grid.appendChild(generatedSetting("Density", density, "density"));
    }

    if (!one('[data-contract-hook="emoji-toggle"]', surface)) {
      var emojiToggle = made("input");
      emojiToggle.type = "checkbox";
      emojiToggle.checked = saved("setting:emojis", true) !== false;
      state.settings.emojis = emojiToggle.checked;
      emojiToggle.addEventListener("change", function () {
        updateSetting("emojis", emojiToggle.checked, "Emoji decoration updated. The factual status stays the same.");
      });
      grid.appendChild(generatedSetting("Show emojis in browser-local notices", emojiToggle, "emoji-toggle"));
    }

    if (!one('[data-contract-hook="social-style"]', surface)) {
      var social = made("select");
      [["balanced", "Balanced"], ["social", "Social"], ["quiet", "Quiet"]].forEach(function (pair) {
        var option = document.createElement("option");
        option.value = pair[0];
        option.textContent = pair[1];
        social.appendChild(option);
      });
      social.value = saved("setting:socialStyle", "balanced");
      state.settings.socialStyle = social.value;
      social.addEventListener("change", function () {
        updateSetting("socialStyle", social.value, "Marketing preview style updated locally. Nothing was posted or shared.");
      });
      grid.appendChild(generatedSetting("Marketing preview style", social, "social-style"));
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
      vocabularyInput.addEventListener("change", function () {
        loadVocabulary(vocabularyInput.files && vocabularyInput.files[0], vocabularyInput);
      });
      var clearer = button("Clear in-page vocabulary preview", function () {
        clearVocabulary();
        vocabularyInput.value = "";
        notify("info", "The in-page vocabulary preview was cleared. No file or mapping was retained.");
      });
      var owner = vocabularyInput.closest("label");
      if (owner) owner.appendChild(clearer);
    }

    applySettingsPresentation();
  }

  function parseJsonWithDuplicateCheck(source) {
    var cursor = { index: 0 };
    function spaces() {
      while (cursor.index < source.length && /\s/.test(source.charAt(cursor.index))) cursor.index += 1;
    }
    function string() {
      var start = cursor.index;
      if (source.charAt(cursor.index) !== '"') throw new Error("Expected a JSON string.");
      cursor.index += 1;
      while (cursor.index < source.length) {
        var character = source.charAt(cursor.index);
        if (character === "\\") { cursor.index += 2; continue; }
        cursor.index += 1;
        if (character === '"') return JSON.parse(source.slice(start, cursor.index));
      }
      throw new Error("Unterminated JSON string.");
    }
    function value(depth) {
      if (depth > 4) throw new Error("The vocabulary file is nested too deeply.");
      spaces();
      var character = source.charAt(cursor.index);
      if (character === '"') return string();
      if (character === "{") {
        var object = {};
        var keys = new Set();
        cursor.index += 1;
        spaces();
        if (source.charAt(cursor.index) === "}") { cursor.index += 1; return object; }
        while (cursor.index < source.length) {
          spaces();
          var key = string();
          if (keys.has(key)) throw new Error("Duplicate JSON key: " + key + ".");
          keys.add(key);
          spaces();
          if (source.charAt(cursor.index) !== ":") throw new Error("Expected a colon in the JSON object.");
          cursor.index += 1;
          object[key] = value(depth + 1);
          spaces();
          if (source.charAt(cursor.index) === "}") { cursor.index += 1; return object; }
          if (source.charAt(cursor.index) !== ",") throw new Error("Expected a comma in the JSON object.");
          cursor.index += 1;
        }
        throw new Error("Unterminated JSON object.");
      }
      if (character === "[") {
        var array = [];
        cursor.index += 1;
        spaces();
        if (source.charAt(cursor.index) === "]") { cursor.index += 1; return array; }
        while (cursor.index < source.length) {
          array.push(value(depth + 1));
          spaces();
          if (source.charAt(cursor.index) === "]") { cursor.index += 1; return array; }
          if (source.charAt(cursor.index) !== ",") throw new Error("Expected a comma in the JSON array.");
          cursor.index += 1;
        }
        throw new Error("Unterminated JSON array.");
      }
      var start = cursor.index;
      while (cursor.index < source.length && !/[\s,\]\}]/.test(source.charAt(cursor.index))) cursor.index += 1;
      var primitive = source.slice(start, cursor.index);
      if (!primitive) throw new Error("Expected a JSON value.");
      return JSON.parse(primitive);
    }
    var parsed = value(0);
    spaces();
    if (cursor.index !== source.length) throw new Error("Unexpected text after the JSON payload.");
    return parsed;
  }

  function validateVocabulary(payload) {
    if (!payload || Object.getPrototypeOf(payload) !== Object.prototype) throw new Error("The vocabulary file must contain a JSON object.");
    if (payload.version !== 1) throw new Error("The vocabulary file must declare supported version 1.");
    var fields = Object.keys(payload);
    if (fields.some(function (key) { return key !== "version" && key !== "replacements"; })) throw new Error("The vocabulary file contains an unsupported field.");
    var replacements = payload.replacements;
    if (!replacements || Object.getPrototypeOf(replacements) !== Object.prototype) throw new Error("The replacements field must be a JSON object.");
    var entries = Object.entries(replacements);
    if (entries.length > 100) throw new Error("The vocabulary file may contain at most 100 replacements.");
    entries.forEach(function (entry) {
      var key = entry[0];
      var value = entry[1];
      if (key === "__proto__" || key === "prototype" || key === "constructor") throw new Error("The vocabulary file contains an unsafe replacement key.");
      if (!key || key.length > 80 || typeof value !== "string" || value.length > 120) throw new Error("Vocabulary replacements must have a non-empty key up to 80 characters and a string value up to 120 characters.");
    });
    return new Map(entries);
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
    if (!state.vocabulary.size) return;
    var keys = Array.from(state.vocabulary.keys()).sort(function (a, b) { return b.length - a.length; });
    var matcher = new RegExp(keys.map(escapePattern).join("|"), "g");
    var walker = document.createTreeWalker(main || body, NodeFilter.SHOW_TEXT);
    var node;
    while ((node = walker.nextNode())) {
      var parent = node.parentElement;
      if (!parent || parent.closest("script, style, code, pre, textarea, select, option, button, [data-mss-generated]")) continue;
      if (!originals.has(node)) originals.set(node, node.nodeValue);
      node.nodeValue = originals.get(node).replace(matcher, function (match) {
        return state.vocabulary.has(match) ? state.vocabulary.get(match) : match;
      });
    }
  }

  function clearVocabulary() {
    state.vocabulary = new Map();
    restoreVocabulary();
    addHistory("Vocabulary preview cleared", "The in-page vocabulary preview was removed.");
  }

  function loadVocabulary(file, input) {
    if (!file) return;
    if (file.size > 65536) {
      input.value = "";
      notify("warning", "The vocabulary file was not loaded because it exceeds the 64 KB local preview limit.");
      return;
    }
    var reader = new FileReader();
    reader.onerror = function () {
      input.value = "";
      notify("warning", "The vocabulary file could not be read locally. Nothing was applied.");
    };
    reader.onload = function () {
      try {
        state.vocabulary = validateVocabulary(parseJsonWithDuplicateCheck(String(reader.result || "")));
        applyVocabulary();
        addHistory("Vocabulary preview loaded", "A validated mapping was applied only to this open browser page.");
        notify("success", "A validated personal vocabulary preview is active in this browser tab. The file was not uploaded or persisted.");
      } catch (error) {
        input.value = "";
        state.vocabulary = new Map();
        restoreVocabulary();
        notify("warning", (error && error.message ? error.message : "The vocabulary file was invalid.") + " Nothing was applied.");
      }
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
      if (contract) safely(function () {
        var request = { pattern: pattern.value, flags: selectedFlags(), plainText: input.value, mode: mode.checked ? "regex" : "plain" };
        if (contract.regex && typeof contract.regex.evaluate === "function") contract.regex.evaluate(request);
        else if (typeof contract.evaluateRegex === "function") contract.evaluateRegex(request);
      });
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
      item.dataset.level = notice.level;
      item.textContent = emoji(notice.level) + notice.message + " Just now.";
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
      if (dateValue && entry.when.slice(0, 10) !== dateValue) return false;
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
      item.textContent = entry.action + ": " + entry.detail + " Just now.";
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
        return { action: entry.action, detail: entry.detail, when: entry.when };
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
    [["json", "JSON"], ["csv", "CSV"], ["markdown", "Markdown"], ["html", "HTML"]].forEach(function (pair) {
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
      var data = serialize(format.value, record);
      if (contract) safely(function () {
        if (contract.exports && typeof contract.exports.create === "function") contract.exports.create({ format: format.value, data: record });
        else if (typeof contract.export === "function") contract.export({ format: format.value, data: record });
      });
      var blob = new Blob([data.text], { type: data.type + ";charset=utf-8" });
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

  function installUnavailableDownloadCtas() {
    all(".download-button").forEach(function (cta) {
      cta.disabled = true;
      cta.setAttribute("aria-disabled", "true");
      cta.setAttribute("title", "Unavailable: an installer link appears only after a verified public release.");
      cta.dataset.mssUnavailable = "true";
    });
    all('[data-contract-hook="download-states"]').forEach(function (grid) {
      grid.dataset.mssUnavailable = "true";
    });
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
      return all("[data-contract-surface], section[id]").map(function (element) {
        var heading = one("h2, h3", element);
        return { id: element.id, label: (heading ? heading.textContent : element.id || "Feature preview").trim() };
      }).filter(function (entry) { return entry.id; });
    }
    function render() {
      var needle = input.value.toLocaleLowerCase();
      results.replaceChildren();
      commands().filter(function (entry) {
        return !needle || entry.label.toLocaleLowerCase().indexOf(needle) !== -1 || entry.id.toLocaleLowerCase().indexOf(needle) !== -1;
      }).slice(0, 20).forEach(function (entry) {
        var result = button(entry.label, function () {
          closeDialog(palette);
          activate(entry.id, result);
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
      if (contract) safely(function () {
        if (contract.palette && typeof contract.palette.open === "function") contract.palette.open();
        else if (typeof contract.openPalette === "function") contract.openPalette();
      });
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
    installUnavailableDownloadCtas();
    installSearches();
    installPalette();
    notify("info", localize("marketing.preview.ready", "Browser-local product preview ready. This page does not contact a server, installer, runtime, or file service."));
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
  else initialize();
}());
