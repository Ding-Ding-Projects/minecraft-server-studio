# Local history and safe exports

This article defines the desktop foundation for recording app-owned event metadata locally and exporting a deliberately bounded, redacted view of those records. It is separate from Minecraft server backups, server-world files, Paper update rollback data, the Status Hub bridge, and any repository in a server folder.

## Delivery and evidence status

This is a source-level feature record for the active fast-delivery lane. It documents the intended append-only history and export contract, but it is **not** proof that a record was written, listed, exported, opened in an editor, or displayed by a packaged application. Tests, linting, review, built-artifact interaction, runtime verification, and captures remain pending unless a later evidence record says otherwise.

An unavailable history store or export adapter must remain visible as unavailable. A disabled action, an empty result, a notification, or this documentation alone is not successful history or export evidence.

## Local history boundary

The history surface is for records owned by Minecraft Server Studio, such as app-managed presentation, narrator and schedule settings, shared-mode changes, server records, authenticator and toy-lock records, optional bridge configuration, and user-initiated history actions. It uses an app-private bounded append-only JSONL journal. It must remain local to the application-data area, must not create a `.git` directory, and must not use a Minecraft server folder as a history repository.

The intended record model is append-only:

- A recorded action adds a new local history event rather than rewriting an older one.
- Each event names its action, time, subject, subject ID, label, and bounded non-secret detail. An unchanged state creates no artificial history event.
- The journal records redacted event metadata only. It does not create a state snapshot, reconstruct a prior configuration, or provide a restore operation.
- History is not cloud synchronization, telemetry, a Status Hub payload, a Minecraft server log, or a claim that a server-side action succeeded.

Minecraft world backups and server-JAR rollback are covered by [Bounded backups and Paper updates](backups-and-paper-updates.md). They are not substitutes for a local application-history event, and this event journal is not a substitute for a restorable server backup.

The source seam is `src/main/local-history-service.cjs`. Its source-level main-process and preload boundary exposes the following methods. These names are not proof that IPC, persistence, or the visible tab has run in a packaged application.

| Operation | Main-process method |
| --- | --- |
| Journal status | `studio:local-history-status` |
| Bounded event listing | `studio:list-local-history` |
| Redacted structured export | `studio:export-local-history` |
| Post-export VS Code handoff | `studio:open-local-history-export-in-vscode` |

The offline documentation inventory registers this article as the exact
`local-history-and-safe-exports` entry in `src/main/offline-docs.cjs`. If that
inventory or its package-time bundle check reports an incomplete state, the app
must show the article as unavailable rather than claiming it was bundled.

## Privacy and redaction

History and export records must retain useful action facts without serializing sensitive values. They must omit, rather than merely hide in the UI:

- RCON passwords, management-provider credentials, enrollment tokens, session keys, and other credential-vault material;
- School-mode unlock material and any authenticator or one-time-password secret, code, URI, or QR payload;
- local personal-vocabulary JSON content, mappings, cache content, source filename, source path, and replacement evidence;
- raw Status Hub replies, response bodies, authorization headers, server console secrets, credential-shaped values, and local paths; and
- unbounded document, world, log, or JAR content that the user did not expressly choose to export.

An export that omits data must say so in the exported metadata and in the completed result. It must not imply that the file is a full backup, a credential transfer, or a portable replacement for protected local storage. The app must keep the source record unchanged if an export fails, is cancelled, cannot be validated, or has no safe adapter.

## History browsing, filters, and search

The source-level journal is bounded to 5,000 records and 4 MiB. It may load that bounded local journal to answer a query, but it never accepts an unbounded history file. Its filters compose with one another:

- **Date range:** native `from` and `to` date controls bound the local query. An invalid or partial typed date remains visible with an inline explanation instead of being silently discarded.
- **Action filter:** the source accepts one registered action at a time: `record-created`, `record-updated`, `settings-changed`, `record-deleted`, `configuration-changed`, or `export-created`.
- **Text search:** plain text is the default. Regex is a deliberate opt-in with a pattern and flags field plus an adjacent builder that inserts literals, character classes, anchors, groups, alternation, and quantifiers.

Regex evaluation remains local. Search and regex input are each bounded to 128 characters; only unique `i` and `m` flags are accepted, and a nested-quantifier guard rejects patterns that could make the bounded journal search unresponsive. Invalid patterns, a no-match result, and a temporarily unavailable history store must be reported honestly; none may be represented as a successful search or a blank list without explanation.

## Safe export contract

The foundation uses a small, explicit local export registry rather than guessing a format from an extension. Its initial UTF-8 representations are:

| Representation | Intended use | Safety boundary |
| --- | --- | --- |
| JSON | Structured record exchange | Includes schema/version and omission metadata; never vault data. |
| JSONL | Line-oriented record streams | Emits one metadata line followed by bounded redacted record lines. |
| YAML | Structured record exchange | Includes schema/version and omission metadata; never vault data. |
| TOML | Structured record exchange | Includes schema/version and omission metadata; never vault data. |
| CSV | Flat tabular summaries | Does not silently flatten nested sensitive content. |
| TSV | Flat tabular summaries | Uses the same fields and omission policy as CSV. |
| Markdown | Human-readable filtered history | States omissions and restoration unavailability beside the bounded records. |

The registry rejects an unavailable format, malformed filters, a request beyond 1,000 matching records, or an output above 1 MiB instead of creating a guessed, truncated, mislabeled, or partially written file. The source emits only redacted metadata fields and carries the omission notice in every representation; it does not serialize a field whose omission policy is unclear.

Exports are generated into the app-private export area through a private temporary file and atomic replacement. The source validates the selected format, filters, and bounded rendered byte count before the atomic write. A later packaged-artifact interaction must prove the complete output path and result presentation; this article does not claim a parser round-trip or completed user-visible export.

The app may offer an external-editor handoff only after an export has an actual, validated generated output path. An **Open in VS Code** action must point at that exact output file or its containing workspace folder. It must remain unavailable after cancellation, a validation failure, absent generated output, or when no editor executable has been detected; it must never construct a guessed path or claim that an editor opened.

## Unavailable and recovery states

The surface must preserve the user's ability to understand what happened when a local facility is unavailable:

| State | Required user-facing result |
| --- | --- |
| Local history store unavailable | Keep the attempted mutation's result distinct from record durability and identify that the event was not recorded. |
| Protected-storage boundary unavailable | Do not serialize a substitute secret into history or export; report the unavailable boundary. |
| No safe export adapter | Reject the requested format with the exact unavailable-format reason; a later UI must not present it as successful. |
| Invalid search or date input | Preserve the supplied value, describe the error inline, and do not run a different query. |
| Export validation or atomic-write failure | Leave the journal unchanged, retain no completed export result, and report the failure without exposing sensitive content. |
| External editor unavailable | Keep the completed generated export available through its real path and state that VS Code is unavailable or was not detected. |

No unavailable state authorizes a network upload, a cloud fallback, PATH-based converter discovery, or a credential-bearing diagnostic dump.

## No snapshot or restore path

This foundation intentionally stores redacted append-only event metadata only. It does not create a Git repository, state snapshots, restore points, or a configuration-reconstruction path. The visible unavailable state is exact:

> Restoration is unavailable because this foundation stores redacted append-only event metadata only; it has not created a Git repository or state snapshots.

Export format choice, search mode, date and action filters, and external-editor preference are local user choices. Resetting a filter or preference must not rewrite the journal. Any future retention, pruning, snapshot, or restore feature requires its own documented data model, destructive-action boundary where applicable, and independent evidence.

## Verification boundary

The following evidence is still required before this feature can be marked verified:

- focused checks for append-only event recording, redaction, schema bounds, every enabled and unavailable export format, atomic rollback, and editor handoff;
- package and runtime interaction proving a record can be browsed, filtered by date/action/plain text/regex, exported, and opened only from a validated output path;
- accessibility and narrow-layout evidence for the filters, regex builder, results, disabled states, and recovery copy; and
- real built-artifact captures for populated history, invalid search, unavailable store, successful export, failed export, and editor-unavailable states.

Until that evidence exists, this article must not be used to claim that the complete local-history, export, notification, or external-editor contract is implemented.

## Suggested related articles

- [Local status and desktop completeness](local-status-and-completeness.md)
- [Presentation settings and shared School mode](experience-settings.md)
- [RCON response safety](rcon-response-safety.md)
- [Shared Status Hub bridge](shared-status-hub-bridge.md)
- [Bounded backups and Paper updates](backups-and-paper-updates.md)
