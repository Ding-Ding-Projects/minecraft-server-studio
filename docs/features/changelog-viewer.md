# Offline changelog viewer

Minecraft Server Studio includes a dedicated offline changelog destination. It presents only version records shipped inside the installed application; it does not call a release API, query tags, download notes, or replace missing content from the network while the app is running.

## Bundled record sources

The main-process `LocalChangelogLibrary` reads two fixed package-local sources:

- `CHANGELOG.md`, which carries curated version categories and change descriptions when they are recorded; and
- a bounded release catalog under `src/main/`, which records locally known release tags, dates, and full commit SHAs.

`package.json` explicitly includes `CHANGELOG.md` in the packaged app. Before either supported package command runs, `scripts/generate-release-catalog.cjs` creates an ignored package-local snapshot from the checked-in baseline. A real Git checkout or linked worktree enriches that baseline from valid local release tags, resolving every release-form tag to its commit. A GitHub source archive has no `.git` metadata, so it retains the checked-in records exactly instead of failing or inventing tag, date, or commit facts. `scripts/verify-offline-changelog-bundle.cjs` verifies that the fixed changelog and catalog parse into at least one bounded record. In a GitHub Actions package run, the generator also adds the deterministic current run tag, commit, and recorded workflow-start date so that the newly published build can list itself offline. Incomplete workflow metadata stops generation instead of assigning a guessed date. The installed application reads the generated snapshot when present and otherwise uses the checked-in local baseline.

The checked-in baseline is maintained with `git fetch --tags` followed by `node scripts/generate-release-catalog.cjs --refresh-baseline`; that command writes the same local-only catalog to the ignored package snapshot and to `src/main/release-catalog.json`, which is then reviewed and committed as source data. This makes an ordinary development launch, filtered date search, text or regex search, copy, and export see the same known release records without a runtime network route. The generator and viewer use a 2,048-record fail-closed ceiling: if a known record would exceed it, packaging stops and the documented capacity must be expanded rather than silently discarding older releases.

The catalog has a fixed schema, a record-count bound, full-SHA validation, ISO-date validation, and duplicate-tag rejection. A corrupt generated catalog does not silently fall back to a different source; the viewer reports its fixed local source as unavailable. A release record without categorized notes states that absence instead of inventing a summary.

## Browsing and filtering

The destination is available even when no Minecraft server is selected. It shows the bundled record state, total local record count, and source boundary, then renders each record's version, recorded date, categories, changes, and commit state.

- Plain-text search is the default and searches only bounded local record text.
- The adjacent regex builder accepts a bounded ECMAScript pattern, `i`, `m`, and `s` flags, a local sample, and guided literal, class, anchor, group, alternation, and quantifier tokens. Nested repeating groups and control characters are refused before matching.
- The start and end date fields accept `YYYY-MM-DD` plus the current computer's numeric date order. Invalid or partial dates remain visible with an inline explanation. A date range excludes undated records and tells the user how many were omitted.
- A recorded commit SHA becomes a user-initiated main-process external-browser action. The renderer cannot pass a URL or arbitrary path; only a validated SHA is accepted and the destination URL is fixed to this repository's commit route. A missing SHA remains a visible missing-commit state.

The established presentation settings localize navigation and surrounding UI labels where the current copy framework supports them. Version numbers, dates, release tags, commit SHAs, and recorded changelog facts stay exact. Non-blocking toast framing and narrator handoff use the existing presentation settings; complete destination localization is still pending.

## Copy and export

Copy and export operate on exactly the records currently visible after the valid filters. The renderer creates the clipboard text locally. Markdown and plain-text export requests cross a narrow IPC surface containing only an allowlisted format and current record identifiers; the main process re-reads the fixed local records, opens the native save dialog, and atomically writes the selected output. A cancelled dialog writes nothing. No release metadata, note, tag, or commit content is fetched during copy or export.

## Failure and security boundaries

The renderer cannot supply a filesystem path, URL, arbitrary Markdown, raw release response, or unbounded export payload. The main process accepts only regular non-symlink bundled inputs within the app's fixed paths and applies byte limits before parsing. When the fixed changelog or catalog is missing, malformed, oversized, or unsupported, the viewer reports the local failure and does not substitute an online page.

The release catalog is release metadata, not proof that every tagged release was installed, launched, or verified. A recorded SHA is a local record only until a user explicitly opens it externally. The destination does not display credentials, user paths, server contents, or private local-history data.

## Verification boundary

`npm run test:release-catalog-archive` copies only the manifest, generator, and checked-in baseline into a temporary directory with no `.git` entry, runs the real generator, and requires its records to equal the baseline exactly. It proves the archive fallback and no-invented-metadata boundary; it does not prove packaging, runtime interaction, accessibility, or captures.

## Suggested related articles

- [Offline documentation browser](offline-documentation-browser.md)
- [Windows release packaging metadata](release-packaging.md)
- [Local history and safe exports](local-history-and-safe-exports.md)
- [Local status and desktop completeness](local-status-and-completeness.md)
