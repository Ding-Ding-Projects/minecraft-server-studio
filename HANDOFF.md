# Handoff

## Minecraft Server Studio expanded candidate

The application source provides a Windows Electron control center, shared CLI, structured Paper/Spigot settings, local lifecycle control, version-aware Java planning, persistent app-managed Java runtime recovery, BuildTools preflight planning, plugin metadata discovery, a capability-first Command Center, management-protocol discovery, protected credential storage, and automatic Java/Git detection and installation fallback. The companion site is a public marketing surface with browser-local controls only; it does not claim to operate a server.

## Appearance and browser-style server-tab foundation

The desktop source now keeps a separate strict local appearance/navigation record
alongside the existing presentation, narrator/schedule, authenticator/toy-lock,
converter, documentation, updater, BuildTools, Paper JAR CLI, backup, Ollama,
and Status Hub bridge modules. It persists theme, density, seed color, a bounded
font family/scale/weight set, direct shell/tab-strip/primary-action overrides,
the active server settings tab, and the tab dock edge. The server tab strip
defaults to the left edge, changes its ARIA orientation and arrow-key axis with
the dock, keeps an all-tabs overflow list, and has independent anchored regex
builders for tab and appearance-control searches.

This is deliberately not an every-element appearance editor or complete tab
management suite. Installed-font enumeration, Word-style typography, an
infinite color translator, pinning, grouping, reordering, master tab search,
bulk close, and command-palette coverage remain unavailable and are shown as
such in the preferences inventory.

### Directly related paths

- `src/main/appearance-navigation-settings.cjs`
- `src/main/studio-settings.cjs`
- `src/main/main.cjs`
- `src/main/preload.cjs`
- `src/main/server-manager.cjs`
- `src/renderer/index.html`
- `src/renderer/renderer.js`
- `src/renderer/styles.css`
- `docs/features/appearance-and-tabs.md`
- `docs/features/experience-settings.md`
- `docs/features/local-status-and-completeness.md`

### Verification boundary

No tests, linting, independent review, build, package, runtime interaction, or
capture ran for this source-only appearance/navigation candidate. The local
inventory continues to mark evidence incomplete, and this lane makes no
claim of every-element editing, complete tab management, or packaged-runtime
verification.

## Release code-name metadata

The Windows release workflow now serializes publication without cancelling an
in-flight release. Before a release body is finalized, it reads complete
paginated product release history and assigns `Classic Har Gow · 蝦餃` only
when no older release name or body has already recorded that code name,
`hk-dish-0001`, or its immutable public image URL. The release note links to
the public catalog asset only; it never downloads, copies, bundles, or attaches
that photo to a product release.

### Directly related paths

- `.github/workflows/windows-package.yml`
- `docs/features/release-packaging.md`
- `docs/features/README.md`
- `src/main/offline-docs.cjs`
- `README.md`
- `CHANGELOG.md`
- `ROADMAP.md`

### Verification boundary

The source lane read current product release history and found no previous
record of `Classic Har Gow`, `hk-dish-0001`, or the public photo filename. No
tests, linting, build, package, release, runtime interaction, or capture ran in
this lane. A future workflow execution must provide the actual release-note,
asset, and timing evidence.

### Remaining work

- Present a future assigned code name in the installed application and public
  marketing release surface after an actual release has assigned it.
- Do not treat a release-note hyperlink as an attached, downloaded, or bundled
  dim-sum image.

## Paper JAR CLI control candidate

The Paper JAR CLI lane adds `src/main/paper-cli-profile.cjs`, a typed profile
that constructs only Paper server arguments after `-jar <server.jar>`. It keeps
JVM controls in the existing Runtime profile, rejects raw token, argument-file,
agent, native-agent, class-path, and shell routes, and limits custom paths to
the selected server folder. The renderer adds Paper-only rich controls,
native browse paths, an explicit bounded `--help`/`--version` JAR-evidence
action, and a read-only direct-argv preview. Its world-changing Paper flags are
visibly disabled and rejected by the profile until an exact stored preflight can
be authorized by the existing two-key destructive-confirmation component.

### Directly related paths

- `src/main/paper-cli-profile.cjs`
- `src/main/server-manager.cjs`
- `src/main/main.cjs`
- `src/main/preload.cjs`
- `src/main/java-runtime-manager.cjs`
- `src/main/config-plugin-safety.cjs`
- `src/renderer/index.html`
- `src/renderer/renderer.js`
- `src/renderer/styles.css`
- `docs/features/paper-jar-cli-controls.md`
- `docs/features/README.md`
- `docs/features/local-status-and-completeness.md`
- `CHANGELOG.md`

### Verification boundary

No tests, linting, independent review, build, package, runtime interaction, or
visual capture ran for this candidate under the active fast-delivery workflow.
Its local status inventory remains incomplete until localization, focused tests,
built-artifact interaction, and real capture evidence exist. The explicit JAR
help/version action is source wiring only; no JAR probe was invoked during this
implementation lane.

### Changed areas

- `src/main/server-manager.cjs`: server registry, Paper/Spigot provisioning, dependency bootstrap, lifecycle, plugins, and RCON.
- `src/main/command-runtime-discovery.cjs`: bounded selected-JAR `--help`/`--version` evidence and fixed-query loopback-RCON discovery adapter; it never opens a shell or starts a server lifecycle operation.
- `src/main/buildtools-adapter.cjs`, `command-center-registry.cjs`, `minecraft-management-protocol.cjs`, `credential-vault.cjs`, `desktop-status-model.cjs`, and `java-runtime-manager.cjs`: capability, safety, status, secret-boundary, and version-aware Java runtime modules, including persistent app-managed Java inventory and official Adoptium metadata selection for portable recovery.
- `src/main/buildtools-orchestration.cjs`, `src/main/main.cjs`, `src/main/preload.cjs`, `src/renderer/index.html`, and `src/renderer/renderer.js`: separate typed BuildTools plan-only controller and renderer surface. It previews Java/Git readiness, a controlled workspace/output directory, and direct argv only; it does not download BuildTools, start a process, write a JAR, promote a JAR, or acquire a plugin.
- `src/main/config-plugin-safety.cjs`: lossless `server.properties` updates, Minecraft 1.21.9+ game-rule delivery state, bounded local plugin JAR inspection, dependency/cycle planning, staging, atomic promotion, and rollback records.
- `src/main/server-backup-manager.cjs`: bounded local snapshot inventory, manifest hashing, stopped-server restore staging, official stable Paper update staging, and retained-JAR rollback helpers.
- `docs/features/shared-status-hub-bridge.md` and `docs/features/local-status-and-completeness.md`: an opt-in external Status Hub documentation boundary. It requires explicit transport acceptance before claiming registration, update, inbox polling, or reply delivery; raw replies and credentials remain outside the renderer, history, exports, and logs.
- `src/main/main.cjs` and `src/main/preload.cjs`: desktop process and safe IPC boundary for status, BuildTools planning, runtime inventory, protocol discovery, command planning, and update-state/restart requests.
- `src/renderer/rcon-response-safety.js`, `src/main/main.cjs`, `src/main/preload.cjs`, and `src/renderer/renderer.js`: bounded RCON response envelope that redacts the current vault-only password and credential-shaped values before renderer-visible console or notifier state.
- `src/main/studio-settings.cjs`, `src/main/main.cjs`, and `src/main/preload.cjs`: app-private presentation settings, a watched shared per-user School-mode record, protected shared unlock-credential boundary, and narrow renderer IPC.
- `src/main/narration-schedule-settings.cjs`, `src/main/main.cjs`, `src/main/preload.cjs`, `src/renderer/narrator.js`, and the preferences renderer: persisted optional event narration, platform-only voice enumeration, separate English/Cantonese voice/rate/pitch choices, serialized speech queue, screen-reader yield state, and bounded local-time scheduled language rules. HTTPS API and Home Assistant schedule options are visible but disabled because no validated privileged adapter is implemented.
- `src/main/update-controller.cjs`, `src/renderer/index.html`, and `src/renderer/renderer.js`: approved-feed validation, Electron Squirrel update-state wiring, visible update status, and user-controlled restart handling.
- `src/main/ollama-suite-manager.cjs`, `src/main/main.cjs`, `src/main/preload.cjs`, `src/main/server-manager.cjs`, and the Local Ollama renderer destination: fixed-loopback main-process reads for local API version, installed-model, and running-model summaries, with bounded response validation and no cloud, token, or arbitrary-shell path.
- `src/main/offline-docs.cjs`, `src/main/main.cjs`, `src/main/preload.cjs`, `src/renderer/markdown-renderer.js`, and the documentation destination: a fixed app-bundled feature-article inventory, package-time availability boundary, narrow reader IPC, escaped Markdown output, internal article-link routing, and local documentation search with a bounded regex-builder route.
- `src/main/local-history-service.cjs`, `src/main/offline-docs.cjs`, `src/main/appearance-navigation-settings.cjs`, `src/main/main.cjs`, `src/main/preload.cjs`, `src/main/desktop-status-model.cjs`, `src/main/server-manager.cjs`, `src/renderer/index.html`, `src/renderer/renderer.js`, `src/renderer/styles.css`, and `docs/features/local-history-and-safe-exports.md`: bounded append-only app-private JSONL event metadata, exact offline-documentation inventory registration, appearance-navigation tab registration, source-level IPC/preload and history-tab wiring, completeness inventory, redacted structured exports, local filtering/search, exact unavailable states, and validated VS Code handoff boundaries.
- `src/renderer/`: desktop UI with rich server controls, capability-first management, Command Center, confirmation, backup/update/rollback previews, application-update controls, and Local status destination.
- `src/renderer/experience-copy.js` and the preferences dialog: persisted English/Cantonese/bilingual presentation, independent message-playfulness controls, decorative message emoji preference, display-name label, and School-mode status/recovery controls.
- `src/cli/mss.cjs` and `src/cli/rcon-gateway.cjs`: shared local CLI plus a one-shot protected Electron gateway for fixed-loopback RCON command and stop operations. The CLI rejects password configuration, removes legacy RCON password fields from JSON output, and never carries an RCON credential across its own arguments, environment, stdin, or registry path.
- `docs/features/backups-and-paper-updates.md` and `docs/features/unsigned-automatic-updates.md`: local snapshot/Paper lifecycle and unsigned application-update behavior, failure modes, and credential boundaries.
- `docs/features/local-ollama-suite.md`: local Ollama foundation behavior, disabled capability boundaries, recovery states, privacy constraints, and unrun verification boundary.
- `docs/features/offline-documentation-browser.md`: bundled-documentation behavior, package wiring, local renderer boundary, failure states, and unrun verification boundary.
- `site/`: public marketing and browser-local interaction source, including a local Status destination.
- `.github/workflows/windows-package.yml`: Windows GitHub Actions release workflow source for push and manual dispatch. It serializes non-cancelling release publication, packages unsigned Squirrel assets, validates `Setup.exe`, `RELEASES`, the full `.nupkg`, the `RELEASES` index, and `NotSigned` status; uploads safe evidence; generates line-count release notes; verifies published asset download metadata; and publishes one rerun-unique non-draft release when an Actions run reaches publication. Before finalizing notes, it checks complete prior release history and can record the unused `Classic Har Gow · 蝦餃` / `hk-dish-0001` metadata with a public link only; it omits that code name if reuse or unreadable history prevents an honest assignment, and never copies or attaches a catalog photo.
- `assets/minecraft-server-studio.svg`, `assets/minecraft-server-studio.ico`, and `scripts/generate-app-icon.ps1`: original vector master and reproducible multi-resolution Windows icon source.
- `package.json`: local Windows executable icon plus an immutable commit-pinned Squirrel icon metadata URL.

## BuildTools plan-only orchestration

The BuildTools tab now calls `studio:plan-buildtools`, which is backed by the
new `BuildToolsOrchestrationController`. Its input contract is typed and
bounded: revision, compile target, workspace, derived output-directory name,
final name, compile-if-changed, do-not-update, remapped/source/docs/
experimental/development switches, and an optional positive pull-request
number. It emits an exact direct-argv record with `shell: false`, never a
copy-paste shell string.

The controller consults the existing ServerManager Java and Git discovery APIs
only to surface readiness. It has no downloader, installer, workspace writer,
process runner, JAR validator, promotion/rollback implementation, or plugin
acquisition path. The renderer disables execution and names that state plainly.
Both `--disable-certificate-check` and `--disable-java-check` are rejected;
there is no future-consequence path that makes either bypass acceptable.

### Directly related documentation

- `docs/features/buildtools-orchestration.md`: typed input, Java/Git matrix,
  controlled workspace/output layout, direct-argv presentation, execution
  boundary, and failure recovery.
- `docs/features/spigot-buildtools.md`, `docs/features/server-orchestration.md`,
  and `docs/features/local-status-and-completeness.md`: existing BuildTools and
  completeness documentation now identifies this plan-only surface separately.

### Verification boundary

No tests, linting, build, package, runtime interaction, capture, BuildTools
download, Java/Git installation, process execution, JAR creation, or release
operation ran for this source-only candidate. The `spigot-buildtools` inventory
row retains pending localization, test, capture, and evidence proof records.

## Local history and safe-export foundation

`src/main/local-history-service.cjs` owns an app-private, bounded append-only
JSONL journal for redacted event metadata. The main process records selected
presentation, narrator and schedule, shared-mode, server-record, authenticator,
toy-lock, and optional Status Hub configuration mutations through the service,
while the preload exposes only status, filtered listing, export, and
existing-output-only VS Code handoff methods. The renderer adds the History +
exports tab with date/action/plain-text filtering and its attached regex builder.

The service accepts only a fixed metadata shape, refuses secret-like terms,
URLs, and filesystem paths, preserves an invalid or full journal without
truncating it, atomically writes bounded exports in JSON, JSONL, YAML, TOML,
CSV, TSV, or Markdown, and records a successful export as a new event. It does
not create a Git repository, store snapshots, or provide restoration. The exact
visible unavailable state is:

> Restoration is unavailable because this foundation stores redacted append-only event metadata only; it has not created a Git repository or state snapshots.

`docs/features/local-history-and-safe-exports.md` documents the source-level
seam, limits, omission policy, output formats, and unavailable states. The
article is registered in the exact offline-documentation inventory, and the
inventory row remains incomplete for localization, focused checks, built-artifact
interaction, and captures. No runtime operation, export, editor launch, test,
lint, review, build, package, release, or capture is claimed here.

## Local authenticator and toy-lock foundation

The desktop source now includes a local RFC 6238 authenticator destination and
an independent toy-lock record model. `src/main/totp-engine.cjs` computes
bounded HOTP/TOTP codes with SHA-1, SHA-256, or SHA-512. `src/main/authenticator-service.cjs`
keeps only non-secret metadata in application data and stores each manual
Base32 or `otpauth://totp/` secret through the protected credential vault. The
renderer receives short-lived code snapshots only; it never receives the
original secret.

`src/main/toy-lock-service.cjs` stores per-target metadata separately from
password verifiers or TOTP secrets. Password locks use a salted `scrypt`
verifier in protected storage, TOTP locks retain their manual secret only in
protected storage, and session/minute unlock state remains in memory. The
authenticator tab is the first actively guarded target. Other element records
are intentionally not represented as complete every-element enforcement.

`src/main/main.cjs`, `src/main/preload.cjs`, `src/renderer/index.html`,
`src/renderer/renderer.js`, and `src/renderer/styles.css` expose the local
destination, safe code-only IPC, list search with an anchored regex-builder
route, manual-entry form, independently credentialed lock list, unlock/relock
flow, and an explicit self-service application-data deletion recovery route.

QR pairing and QR import are explicitly unavailable because no bundled
in-process QR renderer/decoder is registered. The app does not simulate either
flow. `docs/features/authenticator-and-toy-locks.md` records the privacy,
failure, scope, and verification boundaries, and the desktop completeness row
now names the implementation and documentation paths while leaving localization,
tests, captures, history, bulk actions, broad context-menu coverage, and runtime
evidence pending.

No tests, linting, runtime interaction, package build, release, or capture was
run for this fast-delivery source candidate.

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

## Local file-converter foundation

The desktop now has a separate local file-converter destination outside the
server editor. It owns a native local source picker, a maximum 64 KiB
byte-signature/text-shape inspection, and an app-private persistent queue
skeleton. Its registry visibly covers Documents/PDF, Images, Audio, Video,
Archives, Structured Data/Spreadsheets, Code/Text, and Binary Encodings.

Every current adapter stays disabled because this package has no verified
bundled offline conversion engine or output validator. The source file is
never written, uploaded, copied, passed to a shell, discovered through PATH,
or claimed to have converted. A queue item says it is awaiting a future
verified bundled adapter rather than reporting a fabricated output.

### Directly related documentation

- `docs/features/file-converter.md`: picker, bounded inspection, catalog,
  queue, regex-helper, failure, privacy, and verification boundaries.
- `docs/features/local-status-and-completeness.md`: registered but incomplete
  `file-converter` inventory row.

### Remaining work

- Ship individually bundled and package-proven offline adapters with explicit
  resource limits and post-write validation before enabling any target format.
- Add actual conversion progress, cancellation, output selection, atomic
  destination writes, loss disclosures, result history, exports, accessibility
  evidence, localization, tests, and built-artifact captures.
- Do not treat signature inspection, a visible disabled adapter, or a queue
  item as evidence that any file conversion succeeded.

### Verification state

This is an ultra-speed candidate. Tests, lint, type checks, reviews, runtime interaction, and screenshots have not been run or claimed. The local status/completeness inventories intentionally show those evidence types as pending rather than verified. The failed package attempt against `7671f55f2cc6642df274d2352015661b534253b1` is superseded by local package evidence pinned to `4f6021fb40380487a6be919695b936ce18b014e5`: the unsigned Squirrel output contains `Setup.exe`, `RELEASES`, and the full `.nupkg`, while `Setup.exe` reports `NotSigned`. That local evidence is not a tag, GitHub Release, deployment, runtime test, or capture. No release, deployment, tag, or publish action was performed here.

The management-protocol source now normalizes discovered method descriptors into an endpoint-bound, time-limited snapshot. A new client may restore only a matching, unexpired method allowlist before invocation. The generic WebSocket client deliberately does not transmit stored management credentials; the desktop reports an authentication-adapter-required state until a documented provider-specific adapter is implemented. This repair was delivered under the speed-delivery boundary; tests, runtime interaction, screenshots, and independent review remain unrun.

## Local Ollama suite foundation

The Local Ollama destination is a narrow local-runtime observation surface. Its main-process-only manager permits only `http://127.0.0.1:11434` and only reads the documented version, installed-model, and running-model endpoints. It returns bounded normalized summaries through `studio:ollama-status` and `studio:refresh-ollama`; no renderer endpoint setting, token, cloud proxy, raw response body, or arbitrary shell command exists in this lane.

The destination can report checking, healthy, unavailable, offline, and rejected-response states. Unavailable deliberately does not guess whether Ollama is absent or merely stopped. The installed and running inventory lists can be refreshed and searched locally, but Model Store catalog, pulls, chat, hardware-fit decisions, and harness launch remain visible disabled boundaries until their full independent workflows are implemented.

### Verification boundary

This source and documentation lane did not run tests, linting, type checks, independent review, build, package, runtime interaction, built-artifact interaction, or captures. It is not proof that Ollama is installed, that a local model can run, or that a catalog, pull, chat, or harness operation exists.

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
- The local-history and safe-export foundation still needs complete mutation coverage, accessibility/localization work, focused checks, packaged-runtime interaction, and real captures. Its append-only redacted journal is not a Git history, backup, snapshot, or restoration implementation.
- Run the repository's normal focused verification after the speed-delivery boundary is lifted.
- Run and inspect the release workflow against an immutable integrated candidate when external delivery authority is available; verify the resulting non-draft release, tag, assets, line-count note, and workflow timing rather than predicting them.
- The settings foundation now includes bounded narrator/schedule, authenticator/toy-lock, converter, local-model, and appearance/tab source modules, but does not yet complete universal localization, personal-vocabulary upload, every-element appearance editing, complete tab management/regex/palette coverage, history, exports, or packaged-runtime evidence. Its status inventory keeps those requirements pending.
- The local Ollama foundation does not yet complete the exhaustive official Model Store, catalog pagination and revision evidence, hardware-fit assessment, batch pulls, streamed chat, capability-gated attachments, registered harness profiles, rollback, offline documentation/troubleshooting, or their required proof set.
- The documentation destination bundles and renders the current feature-article inventory, but local history, notification center, full localization, complete command-palette/tabs coverage, tests, packaged interaction, and captures remain pending.
- Scheduled appearance values, validated external schedule sources, full narrator runtime evidence, broad local-model/converter workflows, universal localization, personal-vocabulary upload, history, exports, and packaged-runtime evidence remain open work. The bounded settings modules above do not stand in for those complete contracts.
