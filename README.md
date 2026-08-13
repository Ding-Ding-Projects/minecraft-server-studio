# Minecraft Server Studio

Minecraft Server Studio is a Windows desktop control center for creating, configuring, setting up, and operating local Minecraft servers. It supports Paper and Spigot, gives every supported server setting a structured GUI control, and keeps a companion command-line interface for scripted local administration.

## What it manages

- Create Paper or Spigot servers in a folder selected through the app.
- Select a Minecraft version, memory allocation, server ports, and EULA acceptance before setup.
- Download official Paper builds with publisher-provided SHA-256 validation.
- Preview a typed official BuildTools invocation for a selected Spigot revision, including Java/Git readiness, a controlled workspace/output layout, and direct arguments. The only renderer-facing plan route is `studio:plan-buildtools` / `planBuildTools`, which returns `execution.state: "unavailable"` and `processStarted: false`; the desktop does not expose a preflight or executor route to download, run, promote, roll back, or distribute a server JAR. Spigot provisioning fails closed in this plan-only build rather than treating a preview as a server setup.
- Detect Java and Git, select the Java feature required by the chosen Paper or Spigot/BuildTools revision, install missing tools from Windows package managers, and fall back to an app-private portable toolchain when no package manager is available.
- Plan typed Paper JAR CLI arguments after `-jar server.jar`, including bounded help/version evidence, configuration and plugin-directory paths, world/network overrides, startup/console/JFR controls, and a read-only direct-argv preview. World-changing Paper upgrade/cache/region flags remain disabled until an exact destructive-confirmation preflight is wired.
- Configure gameplay, world generation, network/RCON, Java runtime, resource-pack, plugin, and server-property settings with switches, sliders, number steppers, selects, type-ahead version input, file pickers, and browse controls.
- Start and stop a local Java process safely without a shell, read live output, and send console commands.
- Inspect, dependency-plan, stage, and atomically promote local Paper/Spigot plugin JARs through a file picker without acquiring third-party downloads.
- Inspect local files through a bounded byte-based file-converter queue and review an honest offline adapter catalog. The current package lists unavailable PDF, image, audio, video, archive, structured-data, text, and binary adapters without claiming a conversion engine is bundled.
- Open a validated selected server folder or an existing application-created export in a discovered Visual Studio Code candidate or an explicitly selected local executable. Visual Studio Code is the preferred generated-export handoff; the application uses direct local process arguments and does not claim cloud editing, a guessed output path, or an editor save.
- Use the CLI for setup, foreground operation, protected loopback RCON commands, plugin installation, and configuration automation.
- Discover an advertised Minecraft Server Management Protocol schema with `rpc.discover` before enabling any live protocol operation; use the local console or opt-in RCON fallback where an operation is not advertised.
- Use the capability-first Command Center for structured command families, source badges, typed controls, explicit selected-JAR and live runtime evidence collection, tokenized Minecraft-only raw fallback, and guarded consequential operations.
- Review an independent in-app Local status destination that reports local operations, evidence, next steps, and an honest completeness inventory. An optional main-process Status Hub bridge can be configured separately; it keeps the local destination as the fallback and never reports registration, update, inbox-poll, or reply delivery without an accepted transport response.
- Browse the bundled in-app feature documentation without a network request. The documentation destination reads a fixed packaged inventory, renders Markdown through an isolated escaped renderer, resolves listed feature links inside the app, and keeps plain-text search plus a bounded local regex-builder route.
- Open the bounded desktop command palette with `Ctrl+Shift+F` to find real local destinations, server tabs, bundled documentation records, and non-secret controls. It uses local plain-text or bounded regex search, focuses the exact target, and does not execute a server command or invent an IPC route.
- Browse a dedicated offline changelog destination that parses only the packaged `CHANGELOG.md` and bounded local release metadata. It offers typed local date filtering, plain-text search with an adjacent regex builder, visible missing-date and missing-commit states, filtered copy/Markdown/plain-text export, and a validated user-initiated commit handoff; it never fetches release records at runtime.
- Set persisted language mode, independent English/Cantonese message-playfulness levels, dialog/message emoji decoration, and a display name through Studio preferences; use the shared local School-mode control for a live English-only user-experience state with protected unlock credentials.
- Choose a shipped app-logo preset or a bounded local PNG/JPEG in Studio preferences. The renderer receives only a validated private display asset; the custom mark never changes the package, executable, installer, update, or application-data identity.
- Configure a local appearance and navigation foundation with persisted system/light/dark theme, density, seed color, bounded typography, and direct shell/tab/action targets. The current desktop window has a browser-style server tab workspace with docked accessible orientation, local order/pin/group persistence, overflow, separate current-strip/group/master searches with anchored regex builders, and protected bulk-close previews that exclude pinned and locked tabs by default. The bounded `Ctrl+Shift+F` palette can reveal real local targets; every-element editing, multi-window tab discovery, and complete command-palette coverage remain explicitly unavailable.
- Inspect the fixed local Ollama service through main-process-only reads for version, installed models, and running models. The Local Ollama destination keeps Model Store catalog, pull, chat, and harness controls visibly disabled until their full local workflows exist; it never sends requests to a cloud endpoint or accepts an arbitrary shell command.
- Optionally enable a local event narrator with independently selected English and Cantonese platform voices, rate and pitch controls, serialized speech, and an explicit browser screen-reader-detection limitation; add bounded browser-local schedules for language and appearance values without a network schedule source.
- Use the local authenticator destination for vault-backed RFC 6238 TOTP code snapshots and optional independently credentialed toy-lock records. QR pairing/import, every-element lock wiring, secret export, and synchronization remain explicitly unavailable in this foundation.
- Browse bounded app-private local-history metadata by date, action, plain text, or a local regex builder; create a redacted JSON, JSON Lines, YAML, TOML, CSV, TSV, or Markdown export and open it in VS Code only after a real output exists. This foundation does not create a Git repository, save snapshots, or restore prior state.
- Review a bounded app-private notification center that records only fixed safe summaries, keeps warning/error toasts visible until dismissal, and supports individual or bounded bulk local actions. Clearing selected notification history requires the reusable two-control, full-slider confirmation; it does not alter a server, backup, command, credential, or underlying operation result.
- Open the fictional local Support Tickets recovery desk for a toy lock. It can show and ask the operating system to open the actual application-data folder for a user-directed reset route; it never sends a ticket, calls a network service, displays a credential, or deletes application data.
- Use the public landing page's separate browser-local authenticator for manually entered or `otpauth://totp/` entries, local QR pairing reveal, independently credentialed registered-target toy locks, and its local-only Support Tickets recovery desk. It uses origin-scoped browser storage rather than the desktop vault, makes no network request, and remains incomplete for QR import/decoding, synchronization, secret export, every-element lock coverage, localization, automated tests, and capture evidence.
- Use the public landing page's separate browser-local history view for bounded page-owned audit metadata, local date/action/plain-text/regular-expression filtering, selected-record UTF-8 JSON, JSON Lines, CSV, TSV, or Markdown export, and two-key/full-slider confirmation before deleting page audit records. It never reads server, desktop, browser-history, filesystem, converter-content, or authenticator records; it does not know a browser download destination or completion result.
- Use the public landing page's browser-local notification center to search, dismiss, and clear page-local notification metadata. Clearing dismissed or all records requires two acknowledgements and a full slider, and it affects no server, installer, file, credential, download, or external data.

## Desktop workflow

1. Open **Create server** and choose Paper or Spigot, a version, a root folder, capacity, and initial network port.
2. Read and accept the Minecraft EULA for that server.
3. Use **Install missing tools** if the Java runtime required by the selected version or Git is not detected. The app uses Winget or Chocolatey where available, then downloads a user-scoped portable Java/Git fallback itself. The app never requires a manual prerequisite installation before setup can continue.
4. Select **Set up server**. Paper is downloaded from the Paper API. Spigot provisioning is unavailable in this plan-only BuildTools build; use the desktop BuildTools tab only to review its typed direct-argv preview through `studio:plan-buildtools`. It has no renderer/preload preflight or execution route and does not execute or distribute a JAR.
5. Edit the structured controls on the General, World, Gameplay, Network, Runtime, Paper JAR CLI, BuildTools, Live management, Command Center, Plugins, Console, and Local status tabs.
6. Start the server and use the local console. Enable RCON and save its protected password in the desktop app only when the external CLI must issue commands to a running server.

## Command-line interface

After dependencies are installed, use the same local registry as the desktop application:

```text
npm run start:cli -- list
npm run start:cli -- versions
npm run start:cli -- install-deps java git
npm run start:cli -- create --name "Weekend Paper" --root "D:\\Minecraft" --software paper --version 1.21.4 --memory 6 --accept-eula
npm run start:cli -- setup <server-id>
npm run start:cli -- start <server-id>
npm run start:cli -- command <server-id> "say Hello from RCON"
npm run start:cli -- stop <server-id>
npm run start:cli -- plugin-install <server-id> "D:\\Downloads\\ExamplePlugin.jar"
npm run start:cli -- config <server-id> --set pvp=false --set max-players=40
```

`start` intentionally stays attached to the foreground process so output remains observable. `command` and `stop` use a one-shot Electron main-process gateway for RCON. Before either command, open the desktop app on the same Windows account, enable RCON in the Network tab, and save its protected password for that server. The CLI sends only the server ID and Minecraft command to the gateway; it has no password option and rejects `config --set rcon.password=...`. The gateway fixes RCON to `127.0.0.1`, requires the desktop app's default local registry, and redacts its bounded response before the CLI prints it. `MSS_DATA_DIR` remains available for the other local CLI operations, but `command` and `stop` deliberately reject it until an explicit shared-profile design exists.

## Build on a new Windows machine

Run `build.bat` from the repository root. It detects or installs Node.js LTS, installs project dependencies, builds the runnable Electron directory, and then offers to launch it. Use `build.bat /s`, `build.bat --silent`, or `SILENT=1 build.bat` for a non-interactive build.

Run `build-installer.bat` to create the unsigned Squirrel.Windows installer assets. It derives the expected configured dotted `Setup.exe` filename from the current source `package.json` version, reports its SHA-256, and verifies that the installer is unsigned rather than retaining a stale hard-coded version string. The script builds only; it does not mint a release version, create a tag, release, or upload.

## GitHub Actions release workflow

The Windows release workflow at `.github/workflows/windows-package.yml` runs for every GitHub push and for manual `workflow_dispatch` runs. It builds the Windows Squirrel.Windows package with signing disabled, then verifies the expected release set before publication:

- one workflow-local stable application version, `0.<run-number>.<attempt>`;
- the version-matched generated `Setup.exe` installer;
- the `RELEASES` index and exactly one row for the version-matched full package;
- the version-matched full `.nupkg` package; and
- the installer signature state, which must be `NotSigned`.

Each workflow execution uploads safe package evidence, including the bounded Squirrel output and build context, even when an earlier packaging step fails. It also runs `node scripts/line-count.cjs --format markdown` to create the release-note line-count table from the tagged source tree. The table separates source, tests, styles/markup, documentation, workflows/configuration, other hand-written text, and generated text; it also records tracked-file exclusions and surviving-line automation-versus-human attribution.

When the workflow reaches publication, it creates one new non-draft GitHub Release with a rerun-unique provenance tag, attaches the validated unsigned Squirrel assets, and includes the line-count table plus verified workflow timing in the release notes. The installer-facing version is injected into the packaged application by Electron Builder at release time; the checked-in `package.json` and lockfile remain unchanged. A pre-existing provenance tag stops publication rather than replacing release assets. The release remains unsigned by design and may trigger the operating system's unknown-publisher warning. It serializes publication and uses the complete current public dim-sum catalog/asset inventory plus complete prior product release history to select the first unused verified catalog record when one is available. The note records the bilingual code name, record, source revision, catalog release, and a public image hyperlink only. This consumer workflow never downloads, copies, bundles, or attaches the photo; it explicitly does not claim an attached dim-sum image because that would conflict with the consumer-photo policy. If public metadata is unavailable or every eligible record is used, the release notes honestly omit the code name without blocking publication. See [Windows release packaging metadata](docs/features/release-packaging.md) and [unsigned automatic updates](docs/features/unsigned-automatic-updates.md) for the exact versioning and failure boundary. The workflow does not run tests or lint jobs; package production and release evidence are not test or runtime-interaction evidence.

The installed updater reads Electron's packaged runtime version rather than the checked-in development baseline or the provenance tag. It accepts only strict three-part numeric Squirrel package names from the fixed HTTPS `RELEASES` index, selects the newest validated full package independently of row order, refuses a package older than the installed application, and pins Electron's native updater to the approved release directory discovered by that same check. That comparison changes neither the application identifier nor its data location.

## Security and operational boundaries

- Server Java commands use direct executable arguments with `shell: false`; the app does not compose user settings into shell commands.
- The app keeps its own server registry and portable toolchain in the per-user application-data directory. It does not write a `.git` directory into server folders.
- Paper downloads are selected from official project metadata and validated when the upstream API provides a SHA-256 value.
- Spigot BuildTools planning uses a dedicated workspace and controlled output directory outside the server home and source repository. Java and Git are detected through the existing app controls; the current desktop plan-only surface uses only `studio:plan-buildtools` and does not expose preflight, execution, download, promotion, or rollback of a JAR.
- The management protocol is TLS-first and stores any bearer credential reference through protected storage. The generic WebSocket transport does not invent a provider-specific bearer handshake; it never enables methods before `rpc.discover` advertises them and is not a Paper HTTP API.
- Command discovery never scrapes or invents commands. It runs only selected-JAR `--help`/`--version` probes with direct Java arguments, or user-selected fixed `help`, `plugins`, and Paper `paper` queries against an already-running local console or protected loopback RCON route. Every bounded response keeps source, route, timestamp, truncation, and failure state; plugin descriptor metadata remains non-executable until live runtime evidence confirms the command name.
- Paper JAR CLI controls build only typed server tokens after `-jar`; the Runtime profile owns JVM tokens before it. The app rejects raw argument strings, argument files, Java/native agents, class-path routes, and shell syntax, and requires custom Paper configuration/plugin/PID paths to remain inside the selected server folder.
- RCON passwords and management bearer credentials are stored through the operating system protected-storage boundary and omitted from the local registry, exports, and console logs. Minecraft still requires its active RCON password in its local configuration; treat the server folder as sensitive.
- Authenticator secrets and toy-lock password verifiers remain in protected credential storage; the metadata store and renderer receive only non-secret entry/lock details and short-lived code snapshots. Toy locks are user-experience speed bumps, not encryption or security; the UI names the local application-data deletion recovery route.
- Support Tickets is a fictional local recovery surface, not an external support channel. It does not request or reveal credentials, make a network request, or delete the application-data folder; the operating system file manager opens that folder only when the user selects the recovery action.
- The CLI never accepts an RCON password from command-line arguments, environment variables, stdin, or `servers.json`. Its one-shot local gateway reads the app-private protected value only under the same Windows account, uses it only for a fixed loopback connection, and emits no credential data.
- Plugins are local JARs selected through the operating-system file picker. Minecraft Server Studio calculates SHA-256 and inspects bounded JAR, manifest, descriptor, dependency, duplicate, and cycle evidence before staging, but it does not claim to audit or trust third-party plugin safety.
- The optional Status Hub bridge is HTTPS-only except for an explicitly enabled HTTP development route at the exact numeric loopback host `127.0.0.1` or `::1`. Once an eligible endpoint and vault enrollment token are available, the main process generates and stores a fresh session key through `CredentialVault`; it is not returned by the Hub. Enrollment tokens and session keys are not accepted by renderer forms, placed in exports, or copied into local status history. An attempted connection does not claim external delivery.

## Companion Sites source

The `site/` directory contains a Pages-ready public marketing landing page with browser-local interaction equivalents, optional browser speech only after opt-in, bounded local schedule rules, and a separate local Status destination. Its browser state remains local to the visitor and it never claims to install, create, launch, operate, or contact a Minecraft server. Its narrow Ollama observer is idle until a visitor explicitly refreshes it; it can read only `GET /api/version`, `GET /api/tags`, and `GET /api/ps` from the fixed `http://127.0.0.1:11434` origin, retains only a bounded non-secret browser-session snapshot, and leaves catalog, pull, chat, delete, copy, hardware-fit, and harness features visibly unavailable. It loads `contract.js` before `app.js` and keeps unavailable desktop-only operations visibly unavailable until an installed app or verified release provides them.

The companion site also independently provides a deliberately bounded local converter for selected files: UTF-8 text, validated JSON/CSV/TSV, a limited YAML-style text target, and Base64/hex encodings. It accepts no more than 12 files at a time, each up to 1 MiB, detects eligible routes from bounded local bytes/content rather than an extension, and stores no file path or raw source/output bytes in browser storage. PDF, image, audio, video, archive, and native workbook conversion remain visibly unavailable because the site does not bundle a suitable local parser/encoder. Its separate history view retains at most 500 page-owned audit records, supports local date/action/plain-text/regular-expression filters, requires a two-key/full-slider confirmation for local history deletion, and can prepare only selected-record UTF-8 JSON, JSON Lines, CSV, TSV, or Markdown output. This public browser feature is separate from the desktop file-converter and local-history foundations and never calls the desktop application.

The companion site also has a bounded browser-local notification center. Its notices and audit records describe page-local preview events only; info, success, and progress toasts auto-dismiss after seven seconds while warning and error notices remain until dismissed. The center supports local plain-text and regular-expression discovery, individual/selected dismissal, and two-acknowledgement/full-slider confirmation before clearing only local notification metadata. It does not start or confirm a server operation, browser transfer, installer action, desktop action, or file change. See [Browser-local notification center and destructive confirmation](docs/features/browser-local-notifications-and-confirmation.md) for the local-storage, privacy, and verification boundaries.

## Documentation

- [Server lifecycle and Paper/Spigot setup](docs/features/server-orchestration.md)
- [Automatic dependency installation](docs/features/dependency-bootstrap.md)
- [Version-aware Java runtime and launch profiles](docs/features/java-runtime-and-launch.md)
- [Paper JAR CLI controls](docs/features/paper-jar-cli-controls.md)
- [Spigot BuildTools planning](docs/features/spigot-buildtools.md)
- [BuildTools plan-only orchestration](docs/features/buildtools-orchestration.md)
- [Command Center](docs/features/command-center.md)
- [Presentation settings and shared School mode](docs/features/experience-settings.md)
- [App-logo customization](docs/features/app-logo-customization.md)
- [Appearance and tab-navigation foundation](docs/features/appearance-and-tabs.md)
- [Desktop command palette foundation](docs/features/desktop-command-palette.md)
- [Event narrator and scheduled language settings](docs/features/narrator-and-scheduled-settings.md)
- [Browser-local narrator and schedules](site/NARRATOR_AND_SCHEDULE.md)
- [Local authenticator and toy-lock foundation](docs/features/authenticator-and-toy-locks.md)
- [Support Tickets recovery desk](docs/features/support-tickets.md)
- [CLI RCON gateway](docs/features/cli-rcon-gateway.md)
- [Local Ollama suite foundation](docs/features/local-ollama-suite.md)
- [Browser-local Ollama observer](docs/features/browser-local-ollama-observer.md)
- [Windows release packaging metadata](docs/features/release-packaging.md)
- [Local file-converter foundation](docs/features/file-converter.md)
- [Browser-local companion-site file converter](docs/features/browser-local-file-converter.md)
- [Browser-local history and safe exports](docs/features/browser-local-history-and-safe-exports.md)
- [Browser-local notification center and destructive confirmation](docs/features/browser-local-notifications-and-confirmation.md)
- [External editor integration](docs/features/external-editor-integration.md)
- [Local status and completeness](docs/features/local-status-and-completeness.md)
- [Local history and safe exports](docs/features/local-history-and-safe-exports.md)
- [Desktop notifications and destructive confirmation](docs/features/desktop-notifications-and-destructive-confirmation.md)
- [Shared Status Hub bridge](docs/features/shared-status-hub-bridge.md)
- [Offline documentation browser](docs/features/offline-documentation-browser.md)
- [Offline changelog viewer](docs/features/changelog-viewer.md)
- [Feature documentation index](docs/features/README.md)
- [Changelog](CHANGELOG.md)
- [Handoff](HANDOFF.md)
