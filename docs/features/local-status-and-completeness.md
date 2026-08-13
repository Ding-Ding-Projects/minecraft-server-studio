# Local status and desktop completeness

`src/main/desktop-status-model.cjs` defines a dependency-free, local-only data model for a desktop status destination and its completeness inventory. It is a pure CommonJS module: it does not import a package, read or write a file, start a process, call a Minecraft server, invoke a command, or make a network request.

## Local status snapshot

`createLocalStatusSnapshot(input)` returns an immutable, serializable record with these fields:

| Field | Purpose |
| --- | --- |
| `currentState` | The current local state: idle, running, waiting, blocked, complete, failed, or cancelled. |
| `lastUpdated` | An ISO-8601 timestamp for the snapshot. |
| `activeOperations` | Structured local operations with progress, details, and local evidence identifiers. |
| `events` | Time-stamped local events without a remote event feed. |
| `localEvidence` | Local evidence records, optionally linked to a local path. Network URLs and UNC paths are rejected. |
| `nextSteps` | Explicit next actions, blockers, and evidence identifiers. |
| `bridgeBoundary` | The declared boundary for chat, remote execution, network, and an external Status Hub. |

The boundary is intentionally exact for this local model:

> No chat bridge or external Status Hub bridge exists in this model: it is an in-process, local-only record and does not send, receive, poll, synchronize, or execute through a network, chat service, or external Hub.

Rendering this snapshot in the desktop application does not mean that a button sends a message, that an external status service receives data, or that a server operation was run. The optional [Shared Status Hub bridge](shared-status-hub-bridge.md) in `src/main/shared-status-hub-client.cjs` is a separate main-process integration with its own endpoint validation, protected credential boundary, explicit state machine, and evidence record. It does not change this module into a network client.

## Desktop completeness inventory

`createDesktopCompletenessInventory(input)` supplies a versioned, hand-written template for every desktop surface. Every row contains the same evidence contract:

| Row field | Required evidence |
| --- | --- |
| `implementationPath` | One or more local source paths that implement the surface. |
| `documentationPath` | One or more local documentation paths explaining the surface. |
| `localization` | A proof state, detail, and optional local references for localized copy. |
| `test` | A proof state, detail, and optional local references for automated or focused tests. |
| `capture` | A proof state, detail, and optional local references for a real built-artifact capture. |
| `evidence` | A proof state, detail, and optional local references for implementation or interaction evidence. |

The evaluator is deliberately fail-closed. A row is complete only when both path lists are non-empty and all four proof records are `verified`. `pending`, `blocked`, `not-started`, and `not-applicable` never become completeness proof by themselves.

The template includes these desktop surface rows:

| Identifier | Surface |
| --- | --- |
| `status-destination` | Local status destination |
| `status-hub-bridge` | Optional external Status Hub bridge |
| `server-creation` | Server creation |
| `dependency-bootstrap` | Automatic dependency bootstrap |
| `paper` | Paper setup |
| `spigot-buildtools` | Spigot and BuildTools setup |
| `java-runtime-and-jar-launch` | Persistent managed Java inventory, official recovery metadata, and JAR launch |
| `protocol-management` | Protocol management |
| `command-center` | Command center |
| `plugins` | Plugin management |
| `configuration` | Server configuration |
| `console-and-rcon` | Console and RCON |
| `backups-and-updates` | Backup, restore, and Paper server-JAR update/rollback controls |
| `application-updates` | Unsigned Squirrel application-update controls |
| `settings-appearance-and-localization` | Settings, appearance, and localization |
| `file-converter` | Local file converter |
| `ollama` | Local Ollama service health plus bounded installed/running inventory; complete Model Store, pulls, chat, fit assessment, and harness flows remain separate incomplete capability areas. |
| `authenticator-and-toy-locks` | Authenticator and toy locks |
| `docs-history-and-notifications` | Offline documentation, history, and notifications |
| `changelog-viewer` | Offline bundled version records, local filtering, copy/export, and validated commit handoff |
| `export` | Export |

The dependency-bootstrap row explicitly covers automatic installation rather than a manual prerequisite handoff. Its implementation evidence should identify detection, automatic installation attempts, retry/recovery state, and the rich desktop controls that expose those states.

## Paper JAR CLI inventory boundary

The `paper` row also includes the typed Paper JAR CLI profile in
`src/main/paper-cli-profile.cjs`, its desktop IPC and renderer controls, and
the [Paper JAR CLI controls](paper-jar-cli-controls.md) article. The source
models only direct post-`-jar` Paper tokens and delegates selected-JAR
`--help`/`--version` evidence to the existing bounded Command Center adapter.
It does not make a JAR probe, an argv preview, or a stored profile evidence that
Java launched, Paper accepted an option, a plugin loaded, or a world operation
completed. Its three world-changing upgrade/cache/region options remain
disabled until a stored exact launch preflight is wired to the existing
two-key destructive confirmation flow.

## BuildTools plan inventory boundary

The `spigot-buildtools` row includes both the existing BuildTools adapter and the
separate typed plan-only orchestration controller. The plan-only controller
surfaces a Java/Git requirement matrix, controlled workspace and output paths,
and a direct-argv preview, but leaves execution unavailable. It is not evidence
that BuildTools downloaded, executed, or produced a server JAR.

## Application-update inventory boundary

The `application-updates` row is separate from server backups, server rollback,
plugin update, and world restore. Each row remains incomplete until every
required proof record is verified; an application-update source record is not a
substitute for backup, restore, localization, tests, built-artifact interaction,
or capture evidence.

The `settings-appearance-and-localization` row now names the implemented presentation-settings foundation: app-private persisted language modes, independent English/Cantonese message-playfulness values, dialog/message emoji preference, display-name label, a watched shared local School-mode record with a protected unlock-credential boundary, and a separate strict appearance/tab-navigation record. It also records narrator preferences, platform-only voice enumeration and serialized renderer queue, bounded local scheduled-language behavior, persisted theme/density/seed/bounded-typography controls, three direct appearance targets, and a dockable selected-tab/overflow/search foundation. HTTPS API and Home Assistant sources remain visible but disabled because no validated privileged adapter exists in this build. Its localization, test, capture, and complete-evidence fields remain intentionally incomplete because the broader settings, every-element appearance, tab-management, and universal-surface contract is not yet complete.

The update-controller record must distinguish an unconfigured runtime from an
offline or invalid approved public feed, preserve the installed application when
an update fails, and describe the unsigned Squirrel boundary. It must not claim
that an application update installed just because a release was discovered or
downloaded. The only accepted feed is the product-derived public
latest-release path; a visitor or desktop user cannot provide another feed URL.
See [Unsigned automatic updates](unsigned-automatic-updates.md) for the state
and recovery contract.

The settings-appearance-and-localization record also includes the local app-logo manager: shipped presets, byte/signature/dimension/static-image validation for a selected PNG or JPEG, a private derived cache, renderer-only display data, and reset back to the shipped mark. It makes no network request, stores no selected source path, and never changes package, executable, installer, updater, or application-data identity. Its dedicated documentation and inventory proof fields remain pending rather than verified.

## Local Ollama inventory boundary

The `ollama` row currently covers a narrow, main-process-only local foundation:
the fixed `http://127.0.0.1:11434` service version, bounded installed-model
inventory, and bounded running-model inventory. Its implementation never asks a
renderer for an endpoint, cloud credential, proxy, shell command, model name, or
raw API response. A healthy local version response is not proof that a model is
installed, running, compatible, or ready for a requested task.

This row remains incomplete until it independently receives its localized-copy,
focused-test, built-artifact interaction, capture, and evidence records. It
does not inherit proof from server setup, Java installation, the desktop status
destination, or a future application feature. Complete catalog pagination,
hardware-fit assessment, batch pulls, chat, attachments, harness registration,
snapshots, rollback, and offline recovery each need their own implemented and
documented records before they can be treated as available. See [Local Ollama
suite foundation](local-ollama-suite.md) for the current scope and recovery
states.

## File-converter inventory boundary

The `file-converter` row now names the registered source paths for the native
source picker, bounded byte-inspection module, local queue skeleton, disabled
adapter catalog, and renderer destination. That row remains incomplete: source
registration is not evidence that a PDF, image, audio, video, archive,
spreadsheet, text, or binary conversion ran. No output adapter is enabled until
its exact bundled offline dependency, resource bounds, output validator,
localization, tests, built-artifact interaction, and capture evidence are
independently supplied. See [Local file-converter foundation](file-converter.md)
for the present local-only boundary.

## Offline-documentation inventory boundary

The `docs-history-and-notifications` row now includes the source-level offline
documentation-browser foundation. Its implementation is limited to a
hand-written, app-bundled feature-article inventory; a safe main-process
loader; narrow renderer IPC; escaped Markdown rendering; internal article-link
resolution; and a local documentation search with its own regex-builder route.
It does not prove local history, a notification center, full localization,
runtime interaction, or a built-artifact capture. See [Offline documentation
browser](offline-documentation-browser.md) for the package and source-boundary
details.

## Changelog-viewer inventory boundary

The `changelog-viewer` row is independent from both the documentation browser
and the local-history journal. It names a fixed bundled `CHANGELOG.md`, a
bounded package-local release catalog, narrow IPC, local plain-text and regex
search, typed date filtering, copy/export actions, and a validated
user-initiated commit handoff. It does not prove that a release API was read,
that an external commit opened, that a release was installed, or that every
published version has runtime evidence. See [Offline changelog
viewer](changelog-viewer.md) for its exact source and failure boundary.

## Source and evidence boundaries

The module is only a schema and evaluator. It is not source evidence that any server action, installer, converter, authenticator, or local model manager exists. A caller must populate implementation and documentation paths, then attach evidence for the exact desktop surface it has implemented.

The status snapshot accepts only local status data supplied by its caller. It rejects web-style URLs and UNC paths from local-path fields, does not resolve paths, and does not inspect their contents. Evidence records should avoid credentials, RCON passwords, authentication secrets, server-world contents, raw Status Hub replies, and other sensitive data.

The optional bridge record is incomplete unless its implementation and documentation paths are present and its localization, test, capture, and interaction evidence are independently verified. A configured endpoint, attempted connection, or accepted registration cannot verify the unrelated local-status row or any other desktop surface.

## Verification status

This feature record was added during the active speed-delivery workflow. Tests, linting, review, built-artifact interaction, runtime verification, and captures are intentionally recorded as **pending** rather than claimed. No build, package, deployment, commit, release, application-update cycle, or external Status Hub registration/update/poll/reply acceptance is asserted by this documentation alone.

## Suggested related articles

- [Server orchestration](server-orchestration.md)
- [Automatic dependency bootstrap](dependency-bootstrap.md)
- [Spigot BuildTools adapter](spigot-buildtools.md)
- [BuildTools plan-only orchestration](buildtools-orchestration.md)
- [Shared Status Hub bridge](shared-status-hub-bridge.md)
- [Bounded backups and Paper updates](backups-and-paper-updates.md)
- [Unsigned automatic updates](unsigned-automatic-updates.md)
- [Local file-converter foundation](file-converter.md)
- [App-logo customization](app-logo-customization.md)
- [Appearance and tab-navigation foundation](appearance-and-tabs.md)
- [Event narrator and scheduled language settings](narrator-and-scheduled-settings.md)
