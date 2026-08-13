# Offline documentation browser

Minecraft Server Studio includes a desktop documentation destination for the feature articles in `docs/features`. The main process exposes only a hand-written article inventory through narrow IPC methods. The renderer can list that inventory, search its article titles and summaries, read one selected bundled article, and render Markdown through its isolated renderer.

## Behavior

- Documentation is read only from the app-bundled `docs/features` directory.
- The browser lists the fixed inventory of feature articles, shows a truthful incomplete state when any expected article is unavailable, and never downloads a replacement.
- Article selection accepts an inventory identifier only. The application does not accept a local path, URL, or arbitrary Markdown source from the renderer.
- Markdown is rendered through one renderer-owned escaped output path. Raw HTML from an article is text, not executable markup.
- Relative links to another listed feature article resolve inside the documentation destination. Links that do not identify a bundled article are not fetched by the application.
- Documentation search starts in plain-text mode. Its adjacent regex-builder route accepts a bounded raw pattern, flags, sample text, guided pattern tokens, validation feedback, and a local matching preview before the pattern is applied to the article list.

The documentation search uses the JavaScript `RegExp` dialect supplied by the installed Electron renderer. The builder exposes `i` (case-insensitive), `m` (multiline), and `s` (dot-all) flags. Pattern input is limited to 256 characters, sample input to 4,096 characters, and each bundled article's searchable local text to a bounded projection. Nested repeating groups and control characters are rejected before matching; an invalid pattern leaves the visible article list unchanged until the user repairs it or returns to plain-text mode.

## Packaging configuration

`package.json` includes `docs/features/**/*` in the packaged application and invokes `scripts/verify-offline-docs-bundle.cjs` before both Windows package commands. The checker reads the same hand-written inventory that the main-process library uses and fails package production when a listed article is missing, not a regular file, empty, too large, or outside the fixed documentation directory. It also fails when a Markdown article appears in `docs/features` without a matching hand-written inventory record, so adding an article requires adding its explicit bundle registration in the same change.

The checker is packaging wiring, not runtime-interaction evidence. Development and packaged runs both use the same fixed inventory and source-path boundary; neither mode fetches feature documentation from the network.

## Failure and recovery states

The browser reports an incomplete bundled-documents state when an expected article cannot be read. It leaves available articles visible, labels the missing state, and does not silently substitute remote content. A malformed article, symbolic link, NUL-containing source, per-article size excess, or total collection size excess is treated as unavailable. Restoring a valid tracked feature article and rebuilding the package is the recovery path.

If the renderer's Markdown helper is unavailable, the destination displays a local rendering-unavailable message rather than inserting raw Markdown into the page. If a regex pattern is invalid or rejected by the bounded evaluator, the document list is not replaced with a guessed result.

## Security and privacy

The main process accepts only a regular non-symlink documentation root and resolves only filenames in the fixed inventory, rejecting paths that leave that root. The renderer cannot request an arbitrary file, URL, or external Markdown payload through the documentation IPC surface. The feature articles are shipped locally; the documentation browser makes no documentation fetch, telemetry request, analytics call, or third-party asset request.

The renderer treats Markdown as authored text rather than executable content. Its isolated renderer escapes raw HTML, does not activate script-like markup, and hands internal article navigation back to the app-owned inventory. Documentation content does not receive Node, filesystem, credential, or network privileges.

## Verification boundary

This source lane intentionally did not run tests, linting, reviews, packaging, built-artifact interaction, or screen captures. The package checker is wired but was not executed in this delivery pass. The local completeness inventory records implementation and documentation paths while keeping localization, test, capture, and complete interaction evidence pending.

## Suggested related articles

- [Local status and desktop completeness](local-status-and-completeness.md)
- [Presentation settings and shared School mode](experience-settings.md)
- [Server orchestration](server-orchestration.md)
