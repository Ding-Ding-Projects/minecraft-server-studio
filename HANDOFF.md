# Handoff

## Minecraft Server Studio expanded candidate

The application source provides a Windows Electron control center, shared CLI, structured Paper/Spigot settings, local lifecycle control, version-aware Java planning, persistent app-managed Java runtime recovery, BuildTools preflight planning, plugin metadata discovery, a capability-first Command Center, management-protocol discovery, protected credential storage, and automatic Java/Git detection and installation fallback. The companion site is a public marketing surface with browser-local controls only; it does not claim to operate a server.

## Browser-local history and safe-export documentation candidate

The public companion site now has a dedicated documentation record and
per-surface inventory entry for a browser-local history and safe-export
foundation. It describes a maximum of 500 normalized page-owned audit records,
local date/action/plain-text and explicit regular-expression filtering,
selected-record UTF-8 JSON, JSON Lines, CSV, TSV, or Markdown export, and a
two-key/full-slider confirmation before deleting page audit records. The scope stays strictly
browser-local: it excludes desktop application records, Minecraft server data,
browser history, local files, source/output bytes, paths, download locations,
credentials, authenticator/toy-lock material, and transfer-completion claims.

### Directly related paths

- `docs/features/browser-local-history-and-safe-exports.md`
- `docs/features/README.md`
- `site/README.md`
- `site/CONTRACT.md`
- `README.md`
- `CHANGELOG.md`
- `ROADMAP.md`
- `HANDOFF.md`

### Verification boundary

No tests, linting, independent review, build, package, browser interaction,
deployment verification, or screenshots were run or claimed for this
documentation candidate under the active fast-delivery workflow. The record
does not establish a server operation, a desktop export, a browser transfer,
or a real capture; those remain separate evidence requirements.

## Browser-local notification center and destructive-confirmation candidate

The public companion site now documents and exposes bounded origin-local
notification and audit records. The visible center reports only page-local
preview activity; its plain-text/regex discovery, individual/selected
dismissal, and dismissed/all-record clear routes remain origin-local. The clear
routes state the exact affected record count and require two separately
operated acknowledgements plus a 0–100 slider, Emergency exit/Escape, and
focus return before they call `clearNotifications()`. They remove only local
notification metadata and never call a server, change a local file, start or
observe an installer transfer, contact a backend, or authorize a desktop
operation.

The detailed public boundary is in
`docs/features/browser-local-notifications-and-confirmation.md`; the fixed
desktop offline-documentation inventory includes that article. The companion
page documentation in `site/README.md` and `site/CONTRACT.md` explicitly keeps
the notification and confirmation behavior browser-local and confines the
destructive effect to notification metadata.

No tests, linting, review, build, package, browser interaction, screen capture,
Page publication, release, or network request ran in this source-only
fast-delivery lane. Localization breadth, accessible interaction, notification
actions, durable-storage exercise, built-site interaction, and capture evidence
remain unverified.

## Desktop tab workspace documentation candidate

The desktop documentation now describes a one-window server-settings tab workspace. It persists tab order, pin state, group membership/order, collapsed groups, active selection, and dock edge in the strict local appearance/navigation record. It has current-strip, group, and master searches with separate local anchored regular-expression builders, an overflow route, dock-aware tab-list orientation and arrow-key navigation, and bulk-close previews that exclude pinned and locked tabs by default. The workspace neither discovers nor manages tabs outside the current desktop window.

### Directly related paths

- `docs/features/desktop-tab-workspace.md`
- `docs/features/appearance-and-tabs.md`
- `docs/features/local-status-and-completeness.md`
- `docs/features/README.md`
- `src/main/offline-docs.cjs`
- `README.md`
- `ROADMAP.md`
- `CHANGELOG.md`

### Verification boundary

No tests, linting, independent review, build, package, runtime interaction, accessibility validation, or screenshots were run or claimed for this documentation lane under the active fast-delivery workflow. The local completeness inventory keeps localization, test, capture, and interaction evidence pending.

## Public companion-site appearance and tab-navigation documentation candidate

The public companion site now has documentation and a per-surface inventory entry for a browser-local appearance and tab-navigation foundation. Its independent local state covers system/light/dark theme, density, accent, safe typography, bounded appearance-target controls, left/right/top/bottom tab docking, active/order/pin/group state, overflow, and separate current-strip, group, and master tab searches with anchored regular-expression builders. It remains a page-local feature only: it does not alter the installed application, operate a Minecraft server, manage an installer transfer, send an account request, or contact a backend.

### Directly related paths

- `site/README.md`
- `site/CONTRACT.md`
- `docs/features/appearance-and-tabs.md`
- `docs/features/README.md`
- `CHANGELOG.md`
- `ROADMAP.md`
- `HANDOFF.md`

### Verification boundary

No tests, linting, independent review, build, package, runtime interaction, deployment verification, or screenshots were run or claimed for this documentation candidate under the active fast-delivery workflow. The documentation intentionally does not state universal completion. Localization, interaction, test, and capture evidence remain incomplete until real implementation and proof are recorded independently.

## Browser-local companion-site logo customization candidate

The public companion site has a browser-local logo-customization foundation.
It exposes Studio Aqua, Server Slate, and World Spruce as shipped rendered
presets, plus a bounded local PNG/JPEG route. The page validates actual image
bytes, source size, decoded dimensions, and pixel area before retaining only a
downscaled, bounded PNG/JPEG data URL with format, dimensions, fit,
background, and focal-point metadata. It never retains a selected file path or
filename, sends the image to a network service, or changes desktop-app,
package, installer, updater, or release identity.

The local preset search has its own anchored regular-expression builder.
School mode shows the shipped Studio Aqua mark and suppresses custom-logo
input, custom image data, and custom mark rendering while retaining the prior
browser-local preference. Reset clears only the derived browser-local custom
representation and returns to Studio Aqua; it never changes the source file.

### Directly related paths

- `site/contract.js`
- `site/app.js`
- `site/index.html`
- `site/styles.css`
- `docs/features/site-logo-customization.md`
- `docs/features/README.md`
- `CHANGELOG.md`
- `ROADMAP.md`
- `HANDOFF.md`

### Verification boundary

No tests, linting, independent review, browser interaction, build, package,
release, Pages publication, deployment verification, or real capture ran for
this source and documentation candidate. It does not establish browser decode
compatibility, persisted storage availability, localized or assistive-technology
operation, a deployed public-site interaction, or desktop-app rendering. Those
remain explicit follow-up evidence items.
## Browser-local landing-page authenticator and toy-lock candidate

The public landing page now has a separate `site/authenticator-locks.js` module
that keeps a bounded origin-scoped browser-storage record for manually entered
Base32 or `otpauth://totp/` TOTP entries, local RFC 4226/6238 code snapshots,
current/next/countdown display, an adjacent regex builder, deliberate local QR
pairing reveal, independently credentialed registered-target toy locks, and a
local-only Support Tickets recovery desk. It uses browser Web Crypto, makes no
network request, does not contact the desktop app, and never adds a secret,
password, verifier, current code, URI, QR payload, or optional ticket note to
the ordinary page export/history/status model.

The browser-storage record is not a credential vault or security boundary. QR
image/clipboard/camera import and decoding, cross-device synchronization,
secret export, every-rendered-element lock wiring, full operational
localization, automated tests, built-site interaction, and capture evidence
remain incomplete. No test, lint, review, browser interaction, capture, build,
package, release, Page publish, or GitHub mutation was run in this lane.

## Browser-local marketing narrator and schedule candidate

The public `site/` source now carries an optional browser event narrator and a local schedule editor. Narration is disabled by default and uses actual browser `speechSynthesis` voices only after a visitor enables it. It observes late `voiceschanged` delivery, persists separate English and Cantonese `voiceURI` choices or automatic selection, preserves a missing saved choice, uses one serialized queue for English-then-Cantonese bilingual events, bounds rate and pitch, and states when the browser cannot provide a matching voice or reliably identify a screen reader. The page makes no text-to-speech request.

The schedule editor stores at most 100 version-1 local rules in contract schema version 4. It supports language mode, theme, density, accent color, browser-safe font-family fallback stacks, font scale, and font weight; optional local date/time bounds; every-day or explicit weekday selection; cross-midnight anchoring to the prior start date/weekday; equal-time inactive rules; highest-priority then lexical-id resolution; edit and two-key/full-slider-confirmed remove paths; and an adjacent bounded regular-expression builder for saved-rule search. HTTPS and Home Assistant choices remain visible but unavailable because the static page has no privileged adapter, validation path, or credential store, and no request is made. The renamed presentation mode hides narrator/schedule controls, cancels queued speech, and pauses overrides while retaining saved browser-local preferences.

### Directly related paths

- `site/index.html`
- `site/app.js`
- `site/contract.js`
- `site/styles.css`
- `site/README.md`
- `site/CONTRACT.md`
- `site/NARRATOR_AND_SCHEDULE.md`
- `CHANGELOG.md`
- `ROADMAP.md`

### Verification boundary

No tests, linting, review, build, package, browser interaction, screen capture, Page publication, release, or network request ran in this source-only fast-delivery lane. The browser-local completeness inventory remains in progress and explicitly leaves localization breadth, accessibility validation, runtime speech/voice behavior, local-storage persistence, schedule transitions, built-artifact interaction, and capture evidence unverified.

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
and bulk close remain unavailable and are shown as such in the preferences
inventory. A later bounded `Ctrl+Shift+F` palette can reveal known local
targets, but does not complete application-wide command-palette coverage.

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

## Desktop command-palette foundation

The desktop renderer now has a bounded command palette opened by
`Ctrl+Shift+F`; `Ctrl+K` has no competing binding. It builds a local index from
actual renderer destinations, visible server tabs/panels, loaded bundled
offline-document records, and non-secret DOM controls. Plain-text search is
the default, with a bounded local regular-expression builder, result/status
feedback, and keyboard arrows, `Enter`, and `Escape`.

Activating a result reveals the owning destination, settings dialog, or server
tab, then scrolls, focuses, and briefly highlights the exact real element. One
immediate update preference mirrors the existing `#updates-enabled` toggle
through its existing change handler. The palette excludes password, credential,
token, and secret controls; it does not run a server command, contact RCON,
start a process, or add a new IPC route.

### Directly related paths

- `src/renderer/index.html`
- `src/renderer/renderer.js`
- `src/renderer/styles.css`
- `src/main/offline-docs.cjs`
- `docs/features/desktop-command-palette.md`
- `docs/features/local-status-and-completeness.md`
- `docs/features/README.md`
- `README.md`
- `CHANGELOG.md`
- `ROADMAP.md`
- `HANDOFF.md`

### Verification boundary

No tests, linting, independent review, build, package, runtime interaction,
accessibility review, or screen capture ran or is claimed for this
source-level fast-delivery lane. This foundation does not claim a complete
application index, complete localization, voice behavior, rich execution
controls, packaged-runtime evidence, or capture evidence.

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

## Workflow-local Squirrel application versioning

The Windows release workflow now derives an updater-facing stable application
version as `0.<GITHUB_RUN_NUMBER>.<GITHUB_RUN_ATTEMPT>` before packaging. It
uses Electron Builder's `-c.extraMetadata.version` route so the packaged
Electron metadata, Squirrel full package, Setup filename, and `RELEASES` row
share the same version without rewriting the checked-in `package.json` or
lockfile. The existing GitHub Release tag stays a separate provenance value in
the `v<source-version>-build.<run>.<attempt>` form.

The workflow rejects malformed Actions metadata, an invalid computed version,
a setup/full-package name that does not match the computed version, missing or
duplicate matching `RELEASES` rows, and an existing release tag. It no longer
replaces an existing release's assets. The local installer script likewise
derives its configured dotted Setup filename from the local source version
instead of retaining a stale hard-coded `0.1.0` filename, but it does not mint
a release version or publish a release.

### Directly related paths

- `.github/workflows/windows-package.yml`
- `build-installer.bat`
- `docs/features/unsigned-automatic-updates.md`
- `docs/features/release-packaging.md`
- `README.md`
- `ROADMAP.md`
- `CHANGELOG.md`
- `HANDOFF.md`

### Verification boundary

No tests, linting, build, package, release, runtime interaction, or capture
ran in this source-only fast-delivery lane. The next GitHub Actions workflow
must demonstrate a new non-draft release with a version-matched Setup
executable, full `.nupkg`, and exact `RELEASES` row before this change is
claimed as delivery proof.

## Local app-logo customization foundation

The desktop source now keeps app-logo choices in a separate versioned private store. The main process owns native file selection, actual-byte inspection, PNG/JPEG signature and dimension validation, static-image restrictions, packaged-decoder validation, bounded cache promotion, reset, and atomic settings writes. The renderer receives no selected source path or file URL; it renders a shipped preset or a bounded derived display representation only after validation.

The preferences card exposes Studio Aqua, Server Slate, and World Spruce marks; a local PNG/JPEG picker; crop, fit, focal-point, background, and color controls; an adjacent bounded regex builder for its own preset search; and reset. The visible mark falls back to Studio Aqua while shared School mode is effective. No executable icon, application ID, installer metadata, update-feed address, package name, or application-data identity changed.

Directly related source and documentation paths are src/main/logo-manager.cjs, src/main/main.cjs, src/main/preload.cjs, src/main/offline-docs.cjs, src/main/server-manager.cjs, src/renderer/experience-copy.js, src/renderer/index.html, src/renderer/renderer.js, src/renderer/styles.css, docs/features/app-logo-customization.md, docs/features/experience-settings.md, and docs/features/local-status-and-completeness.md. The app-logo article is registered in the fixed offline-documentation inventory beside the preserved appearance/tab article.

No tests, linting, independent review, build, package, runtime interaction, or capture ran for this source-only candidate. This section does not claim conversion, packaged rendering, or a release.

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
- `src/main/buildtools-orchestration.cjs`, `src/main/main.cjs`, `src/main/preload.cjs`, `src/main/server-manager.cjs`, `src/renderer/index.html`, and `src/renderer/renderer.js`: separate typed BuildTools plan-only controller and renderer surface. Its only renderer-facing plan route is `studio:plan-buildtools` / `planBuildTools`; `studio:buildtools-preflight` and `studio:execute-buildtools-plan` are not registered or exposed. It previews Java/Git readiness, a controlled workspace/output directory, and direct argv only; it returns unavailable execution with `processStarted: false` and does not download BuildTools, start a process, write a JAR, promote or roll back a JAR, or acquire a plugin. Spigot provisioning fails closed instead of treating a plan as a setup request.
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
only to surface readiness. The only renderer-facing plan route remains
`studio:plan-buildtools` / `planBuildTools`, which calls
`BuildToolsOrchestrationController.createPlan()` and returns
`execution.state: "unavailable"` with `processStarted: false`. Neither
`studio:buildtools-preflight` nor `studio:execute-buildtools-plan` is
registered in the main process or exposed through preload, so the retained
legacy ServerManager preflight is not a desktop capability. Its
`executeBuildToolsPlan()` method itself now fails closed with an unavailable
error, so it cannot download, run, promote, or roll back a JAR even if another
future caller reached it. There is no renderer-reachable downloader, installer,
workspace writer, process runner, JAR validator, promotion/rollback
implementation, or plugin acquisition path. Spigot provisioning likewise
returns an unavailable plan-only state rather than converting a typed preview
into a server setup.
The renderer disables execution and names that state plainly. Both
`--disable-certificate-check` and `--disable-java-check` are
rejected; there is no future-consequence path that makes either bypass
acceptable.

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

## Local Support Tickets recovery desk

The desktop candidate adds a fictional, local-only Support Tickets desk for
the toy-lock recovery route. It can create a locally numbered record with a
category, description, severity, and status, then present a canned local
response. The record is not sent to a service, email address, or person, and
the app does not claim that a remote ticket exists.

The resolution shows the exact application-data folder for the current
installation and can ask the operating system file manager to open it. The
application does not delete that folder, its contents, a credential, or a toy
lock. A user who chooses to reset local application data must do so themselves
after reviewing the wider effect on their Studio data.

The route is available from the toy-lock unlock prompt, toy-lock settings, and
Help. It never requests, renders, or exports a password, TOTP code, TOTP secret,
or protected credential-vault value. Folder-resolution and file-manager-launch
failures remain local and report an honest unavailable or failed state rather
than creating a fake external escalation.

### Directly related documentation

- `docs/features/support-tickets.md`: local-only scope, entry routes,
  application-data-folder handoff, privacy boundary, failure behavior, and
  unrun verification boundary.
- `docs/features/authenticator-and-toy-locks.md`: the associated toy-lock
  model and user-directed recovery boundary.

### Verification boundary

No tests, linting, build, package, installed-app interaction, screen capture,
or external delivery ran for this fast-delivery candidate. The source and
documentation do not prove that the file manager launched, that the local
ticket UI rendered, or that a recovery reset occurred.

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

## Offline changelog viewer

The desktop now has a dedicated offline changelog destination that stays
available without a selected server. `src/main/changelog-library.cjs` accepts
only the package-local `CHANGELOG.md` and a versioned bounded release catalog.
It parses version/date/category/change/commit records, retains missing dates
and missing commits as visible states, and never queries a release API at
runtime. The renderer supplies local plain-text search, a bounded adjacent
regex builder, typed ISO/local-order date filters, filtered copy, and native
Markdown/plain-text export. A recorded full SHA can open only the fixed
repository commit route through a main-process user action; renderer code
cannot supply a URL or filesystem path.

`package.json` includes `CHANGELOG.md`. The package route creates an ignored
package-local release-catalog snapshot from local tags, and recognizes the
current Actions run tag/commit when those workflow values are available. The
checked-in catalog remains the source baseline for development and failures
before the generated snapshot exists.

### Directly related paths

- `src/main/changelog-library.cjs`
- `src/main/release-catalog.json`
- `scripts/generate-release-catalog.cjs`
- `scripts/verify-offline-changelog-bundle.cjs`
- `src/main/main.cjs`
- `src/main/preload.cjs`
- `src/renderer/experience-copy.js`
- `src/renderer/index.html`
- `src/renderer/renderer.js`
- `src/renderer/styles.css`
- `docs/features/changelog-viewer.md`
- `docs/features/local-status-and-completeness.md`

### Verification boundary

This fast-delivery source lane did not run tests, linting, independent review,
packaging, runtime interaction, or captures. The dedicated local completeness
row keeps localization, test, capture, and complete evidence pending. The
package-generated catalog mechanism is source wiring only; it is not proof of
an installed app, a valid external commit page, or complete historical release
coverage.

## Browser-local Ollama observer

The public marketing page now owns a deliberately narrow browser-only local
Ollama observation route. It is idle until a visitor selects **Refresh local
Ollama**. A refresh may issue only `GET /api/version`, `GET /api/tags`, and
`GET /api/ps` at the literal `http://127.0.0.1:11434` origin. There is no
editable endpoint, host, port, path, proxy, redirect, token, account, cloud
fallback, request body, background polling, desktop IPC, or arbitrary local
request path.

The observer aborts bounded requests and accepts only bounded, normalized
version, installed-model, and running-model summaries. It reports healthy,
unavailable, browser-or-CORS-blocked, unsupported-browser, and
rejected-response states without guessing across those outcomes. It may retain
only a normalized
non-secret browser-session last-success snapshot, which retains only service
version/observation time and safe model name, size, VRAM size, modification
or expiry timestamp, family, parameter-size, and quantization fields. It
omits raw responses, digests, endpoints, credentials, prompts, and local
paths, and remains visibly stale until a later accepted refresh. Installed
and running summaries have local
plain-text and regex search; filtering never makes another request.

The public page remains intentionally unable to discover a Model Store
catalog, pull, chat, delete, copy, assess hardware fit, or register/launch a
harness. Each is visible as an unavailable browser-only boundary. None is
simulated, forwarded to a desktop app, or redirected to a cloud service.

### Directly related paths

- `site/app.js`
- `site/index.html`
- `site/styles.css`
- `site/README.md`
- `site/CONTRACT.md`
- `docs/features/browser-local-ollama-observer.md`
- `docs/features/README.md`

### Verification boundary

This fast-delivery lane did not run tests, linting, independent review,
build, package, live browser interaction, packaged-runtime interaction, or
captures. It is not proof that a specific browser can access a local Ollama
service, that CORS permits the response, that a listed model runs, or that
the unavailable desktop workflows exist. The public-source completeness
inventory retains its localization, test, interaction, and capture evidence
as incomplete.

### Remaining work

- Keep the fixed browser request allowlist and no-request-before-refresh
  rule covered by dedicated interaction evidence after the fast-delivery
  boundary is lifted.
- Implement full Ollama catalog, pull, chat, model mutation, hardware-fit,
  and harness workflows only in a separately scoped desktop surface with its
  required security, offline, accessibility, and runtime proof.

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
- The settings foundation now includes bounded narrator/schedule, authenticator/toy-lock, converter, local-model, appearance/tab, and `Ctrl+Shift+F` command-palette source modules, but does not yet complete universal localization, personal-vocabulary upload, every-element appearance editing, complete tab management/regex/palette coverage, history, exports, or packaged-runtime evidence. Its status inventory keeps those requirements pending.
- The local Ollama foundation does not yet complete the exhaustive official Model Store, catalog pagination and revision evidence, hardware-fit assessment, batch pulls, streamed chat, capability-gated attachments, registered harness profiles, rollback, offline documentation/troubleshooting, or their required proof set.
- The documentation destination bundles and renders the current feature-article inventory, and the bounded palette can reveal loaded documentation records, but local history, notification center, full localization, complete command-palette/tabs coverage, tests, packaged interaction, and captures remain pending.
- Scheduled appearance values, validated external schedule sources, full narrator runtime evidence, broad local-model/converter workflows, universal localization, personal-vocabulary upload, history, exports, and packaged-runtime evidence remain open work. The bounded settings modules above do not stand in for those complete contracts.

## Browser-local companion-site file converter

The public `site/` source now contains an independently browser-local,
deliberately bounded conversion slice. It admits up to 12 selected files per
action, each up to 1 MiB, sniffs no more than the first 512 bytes before a
queue record, and keeps up to 24 files only for the open page. The durable
browser-local history contains at most 100 metadata-only records with bounded
`id`, sanitized `sourceName`, `sourceType`, `sourceBytes`, `detectedKind`,
`category`, `targetType`, `targetFormat`, `targetName`, `status`, `adapterId`,
`createdAt`, `updatedAt`, `downloadRequestedAt`, and `reason` fields. This timestamp records only a browser download request, never a destination or completion result. It never stores
a source path, browser file handle, download location, preview text, source
bytes, or output bytes.

Enabled routes are limited to UTF-8 text, validated JSON/CSV/TSV, a deliberately
limited YAML-style target, and Base64/hex encodings. PDF, images, audio, video,
archives, and native workbooks stay visible but unavailable with an exact
missing parser/encoder reason. No browser upload, remote converter, desktop
bridge, shell, server action, or download-location tracking exists.

### Directly related documentation

- `docs/features/browser-local-file-converter.md`: detailed browser-local
  behavior, bounds, available routes, unavailable adapters, privacy, failure
  handling, configuration, and verification boundary.
- `site/README.md` and `site/CONTRACT.md`: public static-site and contract
  limits for the local converter.

### Remaining work

- Do not broaden the available set without separately bounded parsing,
  validation, loss disclosure, output validation, accessibility work, and
  evidence.
- PDF, media, archive, and native-workbook conversion remain unavailable.
- The fast-delivery lane has not provided tests, linting, independent review,
  build/package verification, runtime interaction, or captures for this
  browser-local feature.

## External editor integration

The external-editor foundation is owned by
`src/main/external-editor-service.cjs`. It discovers bounded local Visual Studio
Code candidates, including supported `PATH`, standard, current-user,
machine-wide, Insiders, and portable layouts. The compact preference surface
can refresh discovery, choose a local `.exe` or folder through native pickers,
reset to automatic selection, and open the current validated server root.

The service stores only a validated executable path in an app-private atomic
JSON record and derives its display label locally. Before a handoff it rechecks
a canonical absolute `.exe`, existing file identity, bounded strings, and the
selected target. It uses direct
arguments with `shell: false`; no arbitrary command text, flags, environment
expansion, URL, or script is accepted.

Visual Studio Code is the shared route for a selected server root, a
path-redacted app-private handoff record, and an existing verified local-history
export. The service creates the handoff record only in its fixed app-private
area and never guesses a user target path. Launch and validation errors remain
concise and omit server and editor paths from logs and local history. The
feature does not install an editor, contact a network service, transfer files,
or claim that the external editor saved or applied a change.

### Directly related documentation

- `docs/features/external-editor-integration.md`: behavior, selection and
  validation boundary, direct-launch behavior, recovery states, local-only
  privacy boundary, incomplete-export boundary, and verification status.
- `docs/features/README.md`, `README.md`, `ROADMAP.md`, and `CHANGELOG.md`:
  indexed public feature record and current scope.

### Verification boundary

No tests, linting, type checks, independent review, build, package, runtime
interaction, built-artifact interaction, capture, release, or deployment ran
for this fast-delivery source and documentation lane. The completion inventory
must keep localization, focused verification, packaged interaction, and capture
evidence pending until independently recorded.

### Remaining work

- Add complete application-wide export coverage before representing every
  record as editor-openable.
- Add localized recovery copy, focused verification, packaged interaction, and
  real capture evidence.
- Keep editor discovery limited to the documented local executable routes and
  preserve the direct non-shell launch boundary.

## Desktop notification center and destructive confirmation

`src/main/notification-center-service.cjs` now owns a bounded atomic
app-private JSON notification record. It accepts only fixed safe severity/title/detail
summaries, rejects credential-related text, server output, command content,
paths, URLs, and secret material, and retains at most 500 records with a
100-record action selection. `src/main/main.cjs` exposes narrow snapshot,
record, dismiss, restore, reviewed-clear-preview, and clear IPC routes;
`src/main/preload.cjs` exposes the matching safe renderer facade.

The renderer now records a fixed safe summary for each toast without passing its
dynamic message to persistence. Info/success toasts close after five seconds,
progress after eight seconds, and warning/error toasts remain until a user
dismisses them. The Notification center destination has plain-text-first
search with a local regex builder, individual dismiss/restore/clear controls,
and bounded selected dismiss/restore/clear actions. Clearing is a real local
record removal, guarded by the reusable two-control/full-slider confirmation;
the main process rejects a stale selection digest.

The existing confirmation dialog now retains focus-return information,
supports Escape/Emergency exit, shows slider progress and a short completion
state, and gates callback execution until both controls and 100% slider are
complete. Existing backup, restore, Paper update/rollback, and command callers
continue through that same surface. This source lane does not claim that every
destructive action in the product is covered.

No tests, linting, review, build/package work, runtime interaction, or captures
ran under the fast-delivery boundary. Follow-up work must add localization,
complete notification export/history behavior, exhaustive destructive-action
coverage, focused verification, packaged interaction, accessibility proof, and
real captures before treating the feature as complete evidence.
