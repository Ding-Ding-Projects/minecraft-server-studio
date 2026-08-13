# Browser-local history and safe exports

This article documents the public companion site's browser-local history and
safe-export foundation. It is separate from the installed application's
app-private local history, Minecraft server backups, server logs, world files,
and any history repository that the desktop application may use.

The companion site is a static browser page. Its history records only actions
that the page itself performed, such as a visitor changing a local preference,
preparing an allowed export, or dismissing a page notification. It does not
observe a server, browser history, a local filesystem, a download manager, an
installed application, a network service, or another browser profile.

## Browser-local record boundary

The general page contract stores a bounded audit list in this origin's local
storage. Each accepted audit record has only a locally generated identifier,
an action, a target label, bounded non-secret detail, and an ISO-style creation
time. The normalized list holds at most 500 records. When storage pressure
requires the contract to compact its state, it retains a bounded recent subset
or continues only in memory for the current page lifetime and reports that
persistence is unavailable.

This browser-local foundation is intentionally not a Git repository, a server
operation log, a source-file snapshot store, a backup, an undo system, or a
restore workflow. It never creates a `.git` directory, calls a server command,
stores a filesystem path, or claims that a related desktop or server action
succeeded.

The independently stored browser-local authenticator and toy-lock module is
outside this record. TOTP secrets, current codes, passwords, password verifiers,
pairing URIs, QR payloads, temporary manual-secret reveals, and Support Tickets
notes are not added to the general history or export model.

## Browsing, filtering, and selection

The local version-history destination presents the bounded page audit list with
an honest empty state. Date, action, and plain-text filters compose against the
same page-owned record set. Plain-text filtering is the default. Its explicit
regular-expression mode uses the page's bounded local regex helper and surfaces
an invalid-pattern result rather than treating it as an empty successful search.
Visitors can select visible filtered records for a safe export or a reviewable
local deletion. The browser never sends a query, pattern, result, selection, or
audit record to a service.

Filtering is limited to the records owned by this page. It must not search
browser history, local files, server output, installed-app records, selected
converter files, or authenticator data. A missing local-storage record is an
empty page-owned history, not proof that an external record was deleted.

## Safe export boundary

The destination may prepare a UTF-8 text export of the selected page audit
records in the explicitly supported `json`, `jsonl`, `csv`, `tsv`, or
`markdown` forms. The source audit records remain unchanged. JSON Lines means
one JSON object per line; CSV and TSV use a bounded union of record fields; and
the Markdown view remains a readable representation of the same selected
records.

The browser handles any user-selected download. The page can record only that
it prepared an in-memory export or requested a browser download; it cannot know
the destination, whether the browser completed the transfer, whether a file was
opened, or whether an installed application imported it. Unsupported formats,
archives, encryption, remote transfer, and desktop-editor handoff remain
unavailable on this static surface rather than being represented as successful.

Exports omit personal-vocabulary replacements, raw credentials, authentication
secrets, passwords, codes, pairing data, local verifier material, source and
converted file bytes, browser file handles, source paths, download locations,
server data, installer assets, external-status secrets, and personal-vocabulary
file metadata. An export is not a backup and must state its bounded
browser-local scope.

## Local deletion boundary

Removing selected history records or clearing the page-owned history is a local
destructive action. Before either mutation, the destination uses the contract's
two independently operated confirmation controls and full-range confirmation
slider. Cancelling, pressing Escape, or leaving the confirmation incomplete
keeps the selected records unchanged. A completed local deletion affects only
this origin's page audit list; it never deletes server files, desktop data,
downloads, browser history, or authenticator/toy-lock records.

## Failure and recovery states

| Situation | Required behavior |
| --- | --- |
| Browser storage unavailable or rejected | Keep only the current in-memory state where possible and identify that persistence did not complete. |
| Malformed persisted record | Reject it through the contract normalizer and use a safe empty/default page state. |
| Invalid regular expression | Keep the visitor's input visible, report the validation problem, and do not silently show an unrelated record set. |
| Empty selection | Explain that no page-owned audit records are available for the requested export. |
| Unsupported export format | Keep the format visibly unavailable with its exact boundary; do not emit guessed or mislabeled text. |
| Browser download declined or interrupted | Leave the local audit records unchanged and do not claim that a file exists or was delivered. |
| Local deletion cancelled or incomplete | Leave every selected page audit record unchanged and return focus to the originating control. |

Clearing this site's storage through the browser clears this browser profile's
page-local contract state. That reset does not alter desktop application data,
server files, world data, another site, or another browser profile.

## Security and privacy

The foundation performs no network request for history or export. It has no
account, backend, analytics, telemetry, cloud synchronization, remote editor,
or desktop bridge. Browser storage is a convenience store for this page, not a
credential vault or security boundary. Visitors must not use it as a source of
truth for Minecraft administration or sensitive records.

## Verification boundary

This article records the source contract and documentation intent. It does not
claim automated tests, linting, review, a built-site interaction, browser
download completion, packaged desktop interaction, deployment verification, or
real captures. Those evidence categories remain pending until independently
run and recorded.

## Suggested articles

- [Browser-local companion-site file converter](browser-local-file-converter.md)
- [Browser-local authenticator, toy locks, and recovery](browser-local-authenticator-and-toy-locks.md)
- [Local history and safe exports](local-history-and-safe-exports.md)
- [Local status and completeness](local-status-and-completeness.md)
