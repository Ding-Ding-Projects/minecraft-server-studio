# Browser-local companion-site changelog viewer

The public companion site includes a browser-local changelog preview at the
`changelog-preview` surface. It is independent of the installed application's
offline changelog viewer and is deliberately smaller: it renders a committed,
static catalog that is shipped with the site source.

## Behavior and configuration

The surface is registered as the `browser-local-changelog-viewer` contract
surface and command-palette destination. It provides a bounded, local view of
the committed catalog with these controls:

- Plain-text filtering is the default; an explicit regular-expression mode
  filters the same in-memory catalog through the companion site's bounded
  local regex route.
- A local date filter composes with the text/regex filter. Both operate only
  on the static catalog records already present in the page.
- Visitors may select the currently visible records, then use **Copy current
  selection** or request a UTF-8 Markdown or plain-text browser download.

Selection and filter state are current-page UI state only. The viewer does not
persist visitor selections, queries, regex patterns, dates, or copied text to
browser storage. It renders only catalog fields committed with the site;
missing release facts are shown as missing rather than inferred from a tag,
release API, repository history, or an installed application.

Updating the shown catalog is a source-and-deployment change. It is not a
visitor setting, does not have an endpoint, and cannot refresh itself after
the page has loaded.

## Static and download boundaries

The viewer makes no runtime request to a release service, source-control host,
API, server, installed desktop application, local filesystem, or loopback
endpoint. It does not query tags, inspect local Git data, compare a shown
release with the current page, or prove that a listed release is still
available.

Copying formats the selected static records locally. A requested Markdown or
plain-text download is handed to the browser as UTF-8 text. The page does not
learn the download destination, whether a browser policy blocked it, whether a
file was saved, or whether a recipient later opened the file. No CSV, JSON,
archive, encrypted export, external-editor handoff, network transfer, or
desktop import is represented as available by this browser-local slice.

## Failure and privacy behavior

| Situation | Required browser-local behavior |
| --- | --- |
| The committed catalog has no matching records | Show an honest empty result; do not request a remote substitute. |
| A date or regex value is invalid | Keep the visitor's input visible and show a local validation state instead of silently widening or replacing the result set. |
| No records are selected | Explain that there is nothing selected to copy or download; do not generate a guessed export. |
| A browser blocks clipboard or download access | Keep the catalog and current selection unchanged, report only that the request did not complete in the browser, and do not claim a file exists. |
| A catalog field is absent or malformed | Treat the affected local record as unavailable rather than inventing release facts or fetching another source. |

The surface does not accept a user-supplied URL, file, release body, commit
SHA, credential, server response, local path, or download location. It does
not add catalog text or selection state to the companion site's audit history,
general exports, notification record, personal-vocabulary cache, authenticator
store, or external status model. Browser storage is not used as a release
record or security boundary for this feature.

## Verification boundary

This source lane documents a static browser-local implementation boundary. It
does not claim tests, linting, independent review, package/build verification,
deployed-site interaction, clipboard/download completion, accessibility
verification, or real captures. Those evidence categories remain pending until
they are independently run and recorded.

## Suggested related articles

- [Offline changelog viewer](changelog-viewer.md)
- [Browser-local history and safe exports](browser-local-history-and-safe-exports.md)
- [Browser-local notification center and destructive confirmation](browser-local-notifications-and-confirmation.md)
- [Local status and completeness](local-status-and-completeness.md)
