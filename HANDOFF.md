# Handoff

## Minecraft Server Studio expanded candidate

The application source provides a Windows Electron control center, shared CLI, structured Paper/Spigot settings, local lifecycle control, version-aware Java planning, persistent app-managed Java runtime recovery, BuildTools preflight planning, plugin metadata discovery, a capability-first Command Center, management-protocol discovery, protected credential storage, and automatic Java/Git detection and installation fallback. The companion site is a public marketing surface with browser-local controls only; it does not claim to operate a server.

### Changed areas

- `src/main/server-manager.cjs`: server registry, Paper/Spigot provisioning, dependency bootstrap, lifecycle, plugins, and RCON.
- `src/main/command-runtime-discovery.cjs`: bounded selected-JAR `--help`/`--version` evidence and fixed-query loopback-RCON discovery adapter; it never opens a shell or starts a server lifecycle operation.
- `src/main/buildtools-adapter.cjs`, `command-center-registry.cjs`, `minecraft-management-protocol.cjs`, `credential-vault.cjs`, `desktop-status-model.cjs`, and `java-runtime-manager.cjs`: capability, safety, status, secret-boundary, and version-aware Java runtime modules, including persistent app-managed Java inventory and official Adoptium metadata selection for portable recovery.
- `src/main/config-plugin-safety.cjs`: lossless `server.properties` updates, Minecraft 1.21.9+ game-rule delivery state, bounded local plugin JAR inspection, dependency/cycle planning, staging, atomic promotion, and rollback records.
- `src/main/server-backup-manager.cjs`: bounded local snapshot inventory, manifest hashing, stopped-server restore staging, official stable Paper update staging, and retained-JAR rollback helpers.
- `docs/features/shared-status-hub-bridge.md` and `docs/features/local-status-and-completeness.md`: an opt-in external Status Hub documentation boundary. It requires explicit transport acceptance before claiming registration, update, inbox polling, or reply delivery; raw replies and credentials remain outside the renderer, history, exports, and logs.
- `src/main/main.cjs` and `src/main/preload.cjs`: desktop process and safe IPC boundary for status, BuildTools planning, runtime inventory, protocol discovery, command planning, and update-state/restart requests.
- `src/renderer/rcon-response-safety.js`, `src/main/main.cjs`, `src/main/preload.cjs`, and `src/renderer/renderer.js`: bounded RCON response envelope that redacts the current vault-only password and credential-shaped values before renderer-visible console or notifier state.
- `src/main/studio-settings.cjs`, `src/main/main.cjs`, and `src/main/preload.cjs`: app-private presentation settings, a watched shared per-user School-mode record, protected shared unlock-credential boundary, and narrow renderer IPC.
- `src/main/narration-schedule-settings.cjs`, `src/main/main.cjs`, `src/main/preload.cjs`, `src/renderer/narrator.js`, and the preferences renderer: persisted optional event narration, platform-only voice enumeration, separate English/Cantonese voice/rate/pitch choices, serialized speech queue, screen-reader yield state, and bounded local-time scheduled language rules. HTTPS API and Home Assistant schedule options are visible but disabled because no validated privileged adapter is implemented.
- `src/main/update-controller.cjs`, `src/renderer/index.html`, and `src/renderer/renderer.js`: approved-feed validation, Electron Squirrel update-state wiring, visible update status, and user-controlled restart handling.
- `src/renderer/`: desktop UI with rich server controls, capability-first management, Command Center, confirmation, backup/update/rollback previews, application-update controls, and Local status destination.
- `src/renderer/experience-copy.js` and the preferences dialog: persisted English/Cantonese/bilingual presentation, independent message-playfulness controls, decorative message emoji preference, display-name label, and School-mode status/recovery controls.
- `src/cli/mss.cjs` and `src/cli/rcon-gateway.cjs`: shared local CLI plus a one-shot protected Electron gateway for fixed-loopback RCON command and stop operations. The CLI rejects password configuration, removes legacy RCON password fields from JSON output, and never carries an RCON credential across its own arguments, environment, stdin, or registry path.
- `docs/features/backups-and-paper-updates.md` and `docs/features/unsigned-automatic-updates.md`: local snapshot/Paper lifecycle and unsigned application-update behavior, failure modes, and credential boundaries.
- `site/`: public marketing and browser-local interaction source, including a local Status destination.
- `.github/workflows/windows-package.yml`: Windows GitHub Actions release workflow source for push and manual dispatch. It packages unsigned Squirrel assets, validates `Setup.exe`, `RELEASES`, the full `.nupkg`, the `RELEASES` index, and `NotSigned` status; uploads safe evidence; generates line-count release notes; verifies published asset download metadata; and publishes one rerun-unique non-draft release when an Actions run reaches publication. It does not assert a dim sum code name or photo unless a separately verified catalog asset is available.
- `assets/minecraft-server-studio.svg`, `assets/minecraft-server-studio.ico`, and `scripts/generate-app-icon.ps1`: original vector master and reproducible multi-resolution Windows icon source.
- `package.json`: local Windows executable icon plus an immutable commit-pinned Squirrel icon metadata URL.

## Unsigned Squirrel application-update controller

The updater lane adds an application-update controller for the Windows
Squirrel.Windows install path. It derives only the approved public
`https://github.com/Ding-Ding-Projects/minecraft-server-studio/releases/latest/download/`
feed and uses it only from a packaged Windows Squirrel installation. It
publishes distinct unconfigured, disabled, idle, checking, current, available,
downloading, ready, offline, and failed states, and leaves the installed
application usable if feed discovery, metadata validation, or package transfer
fails. It does not accept a user-configured feed URL or any update credentials.

The controller validates `RELEASES` before it calls Electron's updater, then
uses the resulting Squirrel package metadata for the update event flow. The
release and update artifacts are unsigned by design; the product must keep the
unknown-publisher/SmartScreen warning visible and never claim signature
verification. A staged `ready` update is not installed until the user selects
restart, and normal unsaved-work protection must still run before that restart.

### Directly related documentation

- `docs/features/unsigned-automatic-updates.md`: approved-feed derivation,
  literal state semantics, Squirrel metadata boundary, restart policy,
  failure/offline recovery, and no-secret boundary.
- `docs/features/local-status-and-completeness.md`: separate incomplete rows for
  application updates and the server backup/Paper lifecycle.

### Verification boundary

No tests, linting, build, package, packaged-runtime interaction, capture, or
installed-update cycle was run by this documentation lane. Source-level updater
behavior and any eventual release evidence must be recorded separately; this
handoff does not claim either.

### Remaining work

- Keep the source inventory's `application-updates` and `backups-and-updates`
  rows incomplete until each row has its own localization, test, built-artifact,
  and capture evidence.
- Application self-update is not evidence for server, world, or plugin lifecycle
  behavior, and server backup/Paper lifecycle work is not evidence that an
  application update installed.

### Verification state

This is an ultra-speed candidate. Tests, lint, type checks, reviews, runtime interaction, and screenshots have not been run or claimed. The local status/completeness inventories intentionally show those evidence types as pending rather than verified. The failed package attempt against `7671f55f2cc6642df274d2352015661b534253b1` is superseded by local package evidence pinned to `4f6021fb40380487a6be919695b936ce18b014e5`: the unsigned Squirrel output contains `Setup.exe`, `RELEASES`, and the full `.nupkg`, while `Setup.exe` reports `NotSigned`. That local evidence is not a tag, GitHub Release, deployment, runtime test, or capture. No release, deployment, tag, or publish action was performed here.

The management-protocol source now normalizes discovered method descriptors into an endpoint-bound, time-limited snapshot. A new client may restore only a matching, unexpired method allowlist before invocation. The generic WebSocket client deliberately does not transmit stored management credentials; the desktop reports an authentication-adapter-required state until a documented provider-specific adapter is implemented. This repair was delivered under the speed-delivery boundary; tests, runtime interaction, screenshots, and independent review remain unrun.

CLI `command` and `stop` now launch a bounded Electron main-process gateway with no browser window. The gateway uses the desktop profile's protected credential vault on the same Windows account, requires a configured local profile and RCON marker, fixes networking to `127.0.0.1`, and sends a serialized Minecraft `stop` command rather than forcing process termination. It deliberately rejects a custom `MSS_DATA_DIR` for these protected routes. Tests, runtime interaction, package production, screenshots, and independent review remain unrun under the speed-delivery boundary.
The desktop RCON response path now uses a source-level versioned safe envelope before IPC. It redacts the current protected RCON password and credential-shaped values, neutralizes unsafe display control characters, bounds renderer-visible text to 64 KiB, fails closed on malformed IPC values, and labels altered console output. No real RCON endpoint, malformed-frame behavior, credential echo, or bounded response presentation has been exercised in this pass.
The backup/update candidate adds a bounded local snapshot lifecycle for world, configuration, plugin, log, and server-JAR state. A running locally managed server must acknowledge `save-all` or the snapshot is refused. Restore is stopped-server-only, creates a new pre-restore snapshot, and requires two confirmations plus a full authorization slider. The Paper update flow uses the official stable Downloads Service metadata, requires a pre-update backup, validates the reviewed JAR size/checksum/signature in local staging, swaps only a stopped `server.jar`, retains the old JAR for rollback, and never auto-updates plugins. This source is unverified under the speed-delivery boundary; tests, lint, type checks, runtime interaction, packaging, screenshots, and independent review remain unrun.

### Remaining work

- The dedicated Java runtime-manager now owns strict Paper/Spigot compatibility policy, direct Java probes, bounded configured/PATH/JAVA_HOME and persistent managed-runtime discovery, explicit package-manager plans, official Adoptium metadata selection for compatible Windows JDK recovery, provider size/SHA-256 validation, staged direct-argv extraction, and launch preflight. Tests, runtime interaction, and captures remain unrun under the speed-delivery boundary.
- Configuration saves now preserve comments, unknown keys, line endings, and original file layout while changing only GUI-managed `server.properties` keys. The five current game-rule controls are version-badged for Minecraft 1.21.9+ and report saved, sent-local-console, sent-RCON, incompatible, or unconfirmed outcomes without treating them as server properties. Plugin installation now plans and stages a user-selected local JAR with bounded signature, SHA-256, manifest, descriptor, dependency, duplicate, cycle, target-compatibility, atomic-promotion, and rollback-record behavior. Tests, runtime interaction, and captures remain unrun under the speed-delivery boundary.
- Add a provider-specific authenticated WebSocket connector before treating a stored management bearer credential as transmitted authentication.
- Runtime command discovery is now sourced from explicitly selected local JAR probes and observed running local-console or loopback-RCON `help`/`plugins`/Paper `paper` responses. It has not been exercised against a real server in this fast-delivery pass, so source, timeout, truncation, and interleaving states remain intentionally visible instead of being claimed as verified runtime support.
- Exercise desktop RCON against an intentionally redacted credential echo, unsafe control characters, malformed frames, and oversized replies once the speed-delivery verification boundary is lifted.
- The optional Status Hub bridge still needs its complete independent proof set: localized copy, focused tests, built-artifact interaction, real capture, and actual accepted external registration/update/poll/reply evidence. Local status remains the required fallback if it is unconfigured or unavailable.
- Run the repository's normal focused verification after the speed-delivery boundary is lifted.
- Run and inspect the release workflow against an immutable integrated candidate when external delivery authority is available; verify the resulting non-draft release, tag, assets, line-count note, and workflow timing rather than predicting them.
- The presentation-settings foundation does not yet complete universal localization, personal-vocabulary upload, full narrator runtime evidence, scheduled appearance values or validated external schedule sources, appearance customization, tabs/regex/palette, converter, local model manager, authenticator/toy locks, history, exports, or packaged-runtime evidence. Its status inventory keeps those requirements pending.
