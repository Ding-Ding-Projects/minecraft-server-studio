# Personal vocabulary upload

Minecraft Server Studio includes a local personal-vocabulary JSON setting for
private, user-supplied replacement data. It can change applicable app-facing
copy only after the entire selected payload passes validation. The app ships no
built-in replacement data, sample mappings, template, or inferred defaults.
Until a valid local selection is available, it keeps its original shipped
wording.

## Settings behavior

The Studio preferences surface provides a localized card with an explicit
empty state, loaded state, invalid-input state, replace action, and clear
action. A native picker supplies bytes to the privileged local validator; the
renderer does not receive a source location or raw replacement payload. After
validation, the privileged process applies entries only to a fixed allowlist
of safe settings-card and related notification copy, then supplies the
renderer with a bounded final display-copy projection for that allowlist.

The card has its own plain-text-first search and adjacent anchored regular
expression builder. The existing command palette can locate the settings card
and its load, replace, and clear controls. The feature is local to this
desktop installation; it is not a cloud sync, collaboration, telemetry, or
translation-service route.

When the shared School mode is active, the card and its discovery routes are
not presented. The desktop uses its original shipped wording for the affected
copy while that mode is active. A previously valid local selection is retained
privately and can become effective again only after the mode is turned off.

## Validation contract

The whole selected byte payload is validated before any replacement becomes
effective. Its root record has exactly `schemaVersion` set to `1` and an
`entries` record, with these fixed bounds:

| Limit | Bound |
| --- | ---: |
| Input bytes | 64 KiB |
| Replacement entries | 128 |
| Object nesting depth | 2 |
| Entry-key length | 96 characters |
| Entry-value length | 512 characters |
| Final display-copy string | 2,048 characters |
| Final display-copy projection | 64 KiB |

The validator requires the declared version and exact supported structure. It
rejects malformed JSON, unsupported versions, duplicate members, unknown
fields, unsafe object keys, control characters, non-string replacement data,
values beyond the declared bounds, and payloads that exceed any byte, count,
depth, key-length, value-length, or final-display bound. A rejected selection
never applies partially.

After a successful selection, the privileged process writes only validated
data to an application-private local cache. It revalidates that cache every
time it loads it. A missing, corrupt, stale, or unsupported cache is not used;
the desktop falls back to original shipped wording instead of guessing at a
partial state.

Selecting a replacement leaves the prior valid local selection effective when
the new input is rejected. Choosing **Clear** is different: it purges the
validated cache and returns the affected copy to original shipped wording
immediately.

## Privacy boundary

The feature is local-only. It does not make a network request and does not
upload, synchronize, log, telemeter, export, or store raw replacement data in
local history. The renderer, IPC contracts, status records, safe exports, and
history records do not receive the source name, source location, replacement
entries, or cached payload. It receives only the already-computed bounded
display text for the fixed safe allowlist. A generic settings-change record
may describe the action without reproducing private data.

Replacement processing happens only at the private user-facing text boundary
for that allowlist. Commands, URLs, code, identifiers, external records, and
other technical values retain their original exact spelling. This preference is
not a security boundary and does not turn private replacement data into a
portable export.

## Failure and recovery

| State | Behavior | Recovery |
| --- | --- | --- |
| No valid selection | Original shipped wording remains active. | Select a complete valid JSON payload or keep the default wording. |
| Invalid selection | The rejected payload does not apply, and the previous valid local selection remains active unless it was explicitly cleared. | Correct the input and select it again. |
| Cache missing, corrupt, stale, or unsupported | The cache is rejected and original shipped wording is used. | Select a valid payload again. |
| Explicit clear | The private cache is purged and original shipped wording returns immediately. | Select a new valid payload when desired. |
| School mode active | The setting is unavailable and affected copy uses original shipped wording. | Turn off the shared mode through its local unlock route. |

## Current boundary

This is a bounded local settings foundation. It does not establish complete
application-wide localization, every-surface replacement coverage, shared
cross-app propagation, migration from an older private contract, or
built-artifact evidence. Its controlled text application is limited to the
registered settings-card and related notification copy, not arbitrary
application text. The absence of a valid local selection is an expected state,
not an error and not permission to invent replacement content.

## Verification status

This source and documentation lane was prepared under the active
fast-delivery boundary. Tests, linting, type checks, independent review,
build or package work, runtime interaction, built-artifact interaction, and
visual captures were intentionally not run or claimed. The desktop
completeness inventory records the implementation and documentation paths
while localization breadth, focused verification, packaged interaction, and
capture evidence remain pending.

## Suggested related articles

- [Presentation settings and shared School mode](experience-settings.md)
- [Desktop command palette foundation](desktop-command-palette.md)
- [Local history and safe exports](local-history-and-safe-exports.md)
- [Offline documentation browser](offline-documentation-browser.md)
- [Local status and desktop completeness](local-status-and-completeness.md)
