# Browser-local installer download handoff

The public Minecraft Server Studio landing page offers a narrowly bounded installer handoff for one already verified, immutable GitHub Release asset. It is not an installer service, download manager, browser extension, desktop bridge, or release-discovery client.

## Behavior

`site/index.html` embeds the complete version-1 `#mss-fixed-installer-manifest` record for release `v0.1.0-build.104.1`, version `0.104.1`, the Windows x64 asset `Minecraft.Server.Studio-0.104.1-x64-Setup.exe`, and the matching immutable release and asset URLs. `site/app.js` accepts no alternate source: it validates the exact field set, release tag format, version, platform, expected asset name, project release path, URL consistency, and explicit unsigned status before enabling an installer control.

Every installer control opens the same start decision. The dialog shows the exact release, asset name, platform, and unsigned-warning boundary before the browser receives an asset link. **Cancel**, Escape, and ordinary dialog dismissal change no browser-local audit record or notification. Only the dialog's **Start browser download** link receives the validated immutable asset URL, so a visitor activates the browser handoff deliberately rather than a page load, timer, command palette action, or background task doing so.

After link activation, the page may write bounded browser-local audit and notification metadata that says only that a browser handoff was requested. The Downloads panel makes the progress and completion boundary explicit: the static site cannot observe transfer bytes, rate, destination, pause, resume, browser cancellation, completion, checksum verification, installer execution, or application installation. It therefore marks each of those results as unknown rather than simulating them.

The browser-local command palette includes **Review verified installer download**. Selecting it reveals the Downloads panel and opens the same start decision; it does not start the link automatically.

## Configuration and persistence

The fixed manifest is source-controlled static page data, not a user setting and not a latest-release lookup. The page never polls GitHub or another service for a replacement URL. The normal browser-local contract may retain at most its existing bounded notification and audit metadata describing a link activation. It does not store a browser download identifier, destination, file handle, byte count, asset copy, download state, or completion result.

The dialog uses the native browser dialog path when available and an accessible bounded fallback otherwise. It returns focus to the opening control on cancellation, provides visible focus styles, needs no motion to communicate state, and remains internally scrollable on narrow viewports.

## Failure modes

- A missing, malformed, overlong, extra-field, inconsistent, or unsupported manifest leaves installer buttons and release links unavailable. The page does not construct a fallback URL.
- A release tag, version, asset name, or project path that does not exactly agree with the fixed manifest is rejected before a browser link is enabled.
- Browser storage being unavailable affects only the page-local audit and notification record. It does not turn an unrecorded link activation into a failed or successful download.
- A browser blocking, redirecting, cancelling, or completing a link is outside the page's observable surface. The page does not retry, poll, or label any of those outcomes.

## Security and privacy

The handoff controller has no fetch call, token, credential, installer service, service worker, extension channel, background worker, or configurable endpoint. It never reads browser download history, a download destination, a local file, an installed application, or a server. The source asset remains on its verified immutable release URL; the page neither downloads, copies, bundles, hashes, or attaches the installer.

The installer is explicitly unsigned. The start decision and page copy retain the Windows unknown-publisher or SmartScreen warning. Browser-local history and notifications are not evidence that a transfer, hash verification, installation, or application launch occurred.

## Verification boundary

This source-only fast-delivery lane intentionally did not run tests, linting, review, browser interaction, built-site capture, packaging, deployment, release publication, or a real installer transfer. The hand-written companion-site inventory records implementation and documentation while retaining localization breadth, test, interaction, and capture proof as incomplete.

## Suggested articles

- [Windows release packaging metadata](release-packaging.md)
- [Unsigned automatic updates](unsigned-automatic-updates.md)
- [Browser-local notification center and destructive confirmation](browser-local-notifications-and-confirmation.md)
- [Browser-local history and safe exports](browser-local-history-and-safe-exports.md)
