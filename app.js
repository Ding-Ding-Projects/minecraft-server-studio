(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const state = { software: "Paper", version: "1.21.8", command: "list", plugins: [] };
  const logList = $("event-log");
  const toastRegion = $("toast-region");

  function toast(message) {
    const element = document.createElement("div");
    element.className = "toast";
    element.textContent = message;
    toastRegion.append(element);
    window.setTimeout(() => element.remove(), 4200);
  }

  function log(message) {
    const item = document.createElement("li");
    const time = document.createElement("time");
    const copy = document.createElement("span");
    time.textContent = "Now";
    copy.textContent = message;
    item.append(time, copy);
    logList.prepend(item);
  }

  function value(id) {
    return $(id).value;
  }

  function setOutput(id, copy) {
    $(id).value = copy;
    $(id).textContent = copy;
  }

  function updateRangeOutputs() {
    setOutput("memory-output", `${value("memory")} GB`);
    setOutput("max-players-output", value("max-players"));
    setOutput("view-distance-output", `${value("view-distance")} chunks`);
  }

  function updatePreview() {
    const lines = [
      `software=${state.software.toLowerCase()}`,
      `version=${state.version}`,
      `memory=${value("memory")}G`,
      `max-players=${value("max-players")}`,
      `view-distance=${value("view-distance")}`,
      `gamemode=${value("gamemode")}`,
      `difficulty=${value("difficulty")}`,
      `server-port=${value("server-port")}`,
      `online-mode=${$("online-mode").checked}`,
      `allow-flight=${$("allow-flight").checked}`,
      `eula=${$("eula").checked}`,
    ];
    const seed = value("world-seed").trim();
    if (seed) lines.push(`level-seed=${seed}`);
    $("plan-preview").textContent = lines.join("\n");
  }

  function updateSetup() {
    const autoInstall = $("auto-install").checked;
    const taskCount = (autoInstall ? 4 : 0) + (state.plugins.length ? 1 : 0);
    const percent = autoInstall ? Math.min(86, 64 + (state.plugins.length ? 16 : 0)) : (state.plugins.length ? 25 : 0);
    $("summary-software").textContent = state.software;
    $("summary-version").textContent = state.version;
    $("summary-install").textContent = autoInstall ? "Enabled" : "Off";
    $("setup-progress-text").textContent = taskCount ? `${taskCount} task${taskCount === 1 ? "" : "s"} selected` : "No setup tasks selected";
    $("setup-progress-bar").style.width = `${percent}%`;
    $("distribution-detail").textContent = `${state.software} ${state.version} will be verified before it is retrieved.`;
  }

  function updateCommand() {
    const argumentsValue = value("command-arguments").trim();
    $("command-preview").textContent = `/${state.command}${argumentsValue ? ` ${argumentsValue}` : ""}`;
  }

  function focusTarget(id) {
    const target = $(id);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => target.focus({ preventScroll: true }), 320);
  }

  function formatBytes(bytes) {
    return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function setPlugins(files) {
    state.plugins = Array.from(files || []);
    const list = $("plugin-list");
    list.replaceChildren();
    if (state.plugins.length === 0) {
      const empty = document.createElement("li");
      empty.className = "empty-plugin-state";
      empty.textContent = "No plugin JAR files selected.";
      list.append(empty);
    } else {
      state.plugins.forEach((file) => {
        const item = document.createElement("li");
        const name = document.createElement("span");
        const size = document.createElement("span");
        name.className = "plugin-file-name";
        size.className = "plugin-file-size";
        name.textContent = file.name;
        size.textContent = formatBytes(file.size);
        item.append(name, size);
        list.append(item);
      });
    }
    $("plugin-count").textContent = state.plugins.length ? `${state.plugins.length} file${state.plugins.length === 1 ? "" : "s"} staged` : "No files selected";
    $("queue-plugins").disabled = state.plugins.length === 0;
    updateSetup();
  }

  document.querySelectorAll(".nav-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".nav-tab").forEach((candidate) => {
        const selected = candidate === tab;
        candidate.classList.toggle("is-active", selected);
        candidate.setAttribute("aria-selected", String(selected));
      });
      focusTarget(tab.dataset.target);
    });
  });

  document.querySelectorAll(".focus-target").forEach((button) => {
    button.addEventListener("click", () => focusTarget(button.dataset.target));
  });

  document.querySelectorAll('input[name="software"]').forEach((input) => {
    input.addEventListener("change", () => {
      state.software = input.value;
      document.querySelectorAll(".choice-card").forEach((card) => card.classList.toggle("is-selected", card.contains(input)));
      updatePreview();
      updateSetup();
      log(`${state.software} selected for the current server plan.`);
    });
  });

  $("minecraft-version").addEventListener("change", (event) => {
    state.version = event.target.value;
    updatePreview();
    updateSetup();
    log(`Minecraft ${state.version} selected for the server plan.`);
  });

  $("server-profile").addEventListener("change", (event) => {
    const presets = {
      "Small friends server": { memory: 4, players: 8, distance: 10 },
      "Community survival": { memory: 8, players: 30, distance: 12 },
      "Creative workshop": { memory: 6, players: 16, distance: 16 },
    };
    const preset = presets[event.target.value];
    if (!preset) {
      log("Custom server profile retained with the current control values.");
      return;
    }
    $("memory").value = preset.memory;
    $("max-players").value = preset.players;
    $("view-distance").value = preset.distance;
    updateRangeOutputs();
    updatePreview();
    log(`${event.target.value} profile applied to the plan.`);
  });

  ["memory", "max-players", "view-distance"].forEach((id) => {
    $(id).addEventListener("input", () => {
      updateRangeOutputs();
      updatePreview();
    });
  });

  ["gamemode", "difficulty", "server-port", "world-seed", "online-mode", "allow-flight", "eula"].forEach((id) => {
    $(id).addEventListener("input", updatePreview);
    $(id).addEventListener("change", updatePreview);
  });

  $("auto-install").addEventListener("change", () => {
    updateSetup();
    log(`Automatic setup ${$("auto-install").checked ? "enabled" : "disabled"} in the current plan.`);
  });

  $("generate-server-name").addEventListener("click", () => {
    const names = ["weekend-world", "spruce-harbor", "copper-cove", "nether-station", "mossy-meadow"];
    const next = names[(names.indexOf(value("server-name")) + 1 + names.length) % names.length];
    $("server-name").value = next;
    log(`Suggested server folder changed to ${next}.`);
  });

  $("randomize-seed").addEventListener("click", () => {
    $("world-seed").value = Math.floor(Math.random() * 9_000_000_000_000_000).toString();
    updatePreview();
    log("A local random world seed was placed in the plan.");
  });

  $("reset-config").addEventListener("click", () => {
    $("memory").value = "4";
    $("max-players").value = "12";
    $("view-distance").value = "10";
    $("gamemode").value = "survival";
    $("difficulty").value = "normal";
    $("server-port").value = "25565";
    $("world-seed").value = "";
    $("online-mode").checked = true;
    $("allow-flight").checked = false;
    $("eula").checked = false;
    updateRangeOutputs();
    updatePreview();
    log("Configuration values restored to the current profile defaults.");
    toast("Configuration values restored to the current profile defaults.");
  });

  $("copy-plan").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText($("plan-preview").textContent);
      toast("Generated plan copied to the clipboard.");
    } catch (_) {
      toast("The browser could not copy the plan. Select the preview text instead.");
    }
  });

  document.querySelectorAll(".command-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      state.command = chip.dataset.command;
      document.querySelectorAll(".command-chip").forEach((candidate) => candidate.classList.toggle("is-selected", candidate === chip));
      updateCommand();
    });
  });
  $("command-arguments").addEventListener("input", updateCommand);
  $("copy-command").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText($("command-preview").textContent);
      log(`${$("command-preview").textContent} copied as a local command draft.`);
      toast("Command copied. It has not been sent to a server.");
    } catch (_) {
      toast("The browser could not copy the command. Select the text instead.");
    }
  });
  $("clear-log").addEventListener("click", () => {
    logList.replaceChildren();
    log("Activity log cleared in this browser session.");
  });

  $("server-recipe-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const name = value("server-name").trim();
    if (!/^[a-zA-Z0-9_-]{3,40}$/.test(name)) {
      toast("Use 3–40 letters, numbers, hyphens, or underscores for the server folder.");
      $("server-name").focus();
      return;
    }
    log(`Saved the ${state.software} ${state.version} plan for servers/${name}.`);
    toast("Server plan saved in this browser session. Connect the desktop app to execute it.");
  });

  const dropZone = $("plugin-drop-zone");
  const pluginFiles = $("plugin-files");
  pluginFiles.addEventListener("change", () => setPlugins(pluginFiles.files));
  ["dragenter", "dragover"].forEach((eventName) => dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.add("is-dragging");
  }));
  ["dragleave", "drop"].forEach((eventName) => dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.remove("is-dragging");
  }));
  dropZone.addEventListener("drop", (event) => {
    const files = Array.from(event.dataTransfer.files || []).filter((file) => file.name.toLowerCase().endsWith(".jar"));
    if (files.length === 0) {
      toast("Choose one or more .jar plugin files to stage them.");
      return;
    }
    setPlugins(files);
    log(`${files.length} plugin file${files.length === 1 ? "" : "s"} staged in the local browser session.`);
  });
  $("queue-plugins").addEventListener("click", () => {
    log(`${state.plugins.length} plugin file${state.plugins.length === 1 ? "" : "s"} marked ready for desktop hand-off.`);
    toast("Plugin hand-off prepared. No file has been copied or uploaded by this page.");
  });

  document.querySelectorAll(".boundary-trigger").forEach((button) => button.addEventListener("click", () => $("boundary-dialog").showModal()));
  document.querySelectorAll(".close-boundary").forEach((button) => button.addEventListener("click", () => $("boundary-dialog").close()));
  $("theme-toggle").addEventListener("click", () => {
    const isLight = document.body.classList.toggle("is-light");
    $("theme-toggle").setAttribute("aria-pressed", String(isLight));
    $("theme-toggle").setAttribute("aria-label", isLight ? "Use dark theme" : "Use light theme");
    toast(`${isLight ? "Light" : "Dark"} theme enabled for this browser session.`);
  });

  updateRangeOutputs();
  updatePreview();
  updateSetup();
}());
