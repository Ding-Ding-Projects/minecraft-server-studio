# Local status and desktop completeness

`src/main/desktop-status-model.cjs` defines a dependency-free, local-only data model for a future desktop status destination and its completeness inventory. It is a pure CommonJS module: it does not import a package, read or write a file, start a process, call a Minecraft server, invoke a command, or make a network request.

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

The boundary is intentionally exact:

> No chat bridge or external Status Hub bridge exists: this model is an in-process, local-only record and does not send, receive, poll, synchronize, or execute through a network, chat service, or external Hub.

Rendering this snapshot in the desktop application does not mean that a button sends a message, that an external status service receives data, or that a server operation was run. A separate, explicitly designed and protected integration would be required for any of those behaviors.

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
| `server-creation` | Server creation |
| `dependency-bootstrap` | Automatic dependency bootstrap |
| `paper` | Paper setup |
| `spigot-buildtools` | Spigot and BuildTools setup |
| `java-runtime-and-jar-launch` | Java runtimes and JAR launch |
| `protocol-management` | Protocol management |
| `command-center` | Command center |
| `plugins` | Plugin management |
| `configuration` | Server configuration |
| `console-and-rcon` | Console and RCON |
| `backups-and-updates` | Backups and updates |
| `settings-appearance-and-localization` | Settings, appearance, and localization |
| `file-converter` | Local file converter |
| `ollama` | Local Ollama suite |
| `authenticator-and-toy-locks` | Authenticator and toy locks |
| `docs-history-and-notifications` | Documentation, history, and notifications |
| `export` | Export |

The dependency-bootstrap row explicitly covers automatic installation rather than a manual prerequisite handoff. Its implementation evidence should identify detection, automatic installation attempts, retry/recovery state, and the rich desktop controls that expose those states.

## Source and evidence boundaries

The module is only a schema and evaluator. It is not source evidence that any server action, installer, converter, authenticator, or local model manager exists. A caller must populate implementation and documentation paths, then attach evidence for the exact desktop surface it has implemented.

The status snapshot accepts only local status data supplied by its caller. It rejects web-style URLs and UNC paths from local-path fields, does not resolve paths, and does not inspect their contents. Evidence records should avoid credentials, RCON passwords, authentication secrets, server-world contents, and other sensitive data.

## Verification status

This feature record was added during the active speed-delivery workflow. Tests, linting, review, built-artifact interaction, runtime verification, and captures are intentionally recorded as **pending** rather than claimed. No build, package, deployment, commit, release, or external Status Hub verification is asserted by this documentation.

## Suggested related articles

- [Server orchestration](server-orchestration.md)
- [Automatic dependency bootstrap](dependency-bootstrap.md)
- [Spigot BuildTools adapter](spigot-buildtools.md)
