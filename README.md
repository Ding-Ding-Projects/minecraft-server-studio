# Minecraft Server Studio public landing page

This directory is the static, public marketing landing page for Minecraft Server Studio, a Windows desktop application for creating, configuring, and operating Paper and Spigot Minecraft servers.

The landing page describes:

- the Paper and Spigot server choices;
- automatic Java and Git prerequisite setup performed by the installed desktop application;
- local server planning, configuration, lifecycle, and plugin-management capabilities;
- browser-local controls and product destinations such as settings, optional event narration, local schedules, companion-site logo customization, documentation, file conversion, authenticator and lock management, a deliberately narrow local Ollama observer, local history with bounded safe exports, notification center, and download states; and
- the verified public installer availability boundary.

## Truthful static boundary

This public page is static. It has no account system, backend, analytics, installer service, server process, remote control channel, or network file upload. It embeds one fixed local manifest for the verified immutable `Minecraft.Server.Studio-0.104.1-x64-Setup.exe` asset from release `v0.1.0-build.104.1`. The page validates that manifest before enabling a user-facing installer action; it will not build, discover, or guess a release URL.

The published installer is for Windows x64 version 0.104.1 and is unsigned. Windows may show an unknown-publisher or SmartScreen warning. A visitor first opens a real start decision that lists the exact release, asset, platform, and signature boundary. Cancelling leaves page-local notification and audit records unchanged. Choosing **Start browser download** activates the immutable asset link as that visitor's browser action, then records only that the page requested a browser handoff. The static page cannot observe download bytes, rate, destination, pause, cancellation, completion, or installation and never presents the handoff record as one of those results.

The page does not install prerequisites, download a Paper or Spigot distribution, create server files, start a Minecraft server, send a console command, make a schedule-source request, or contact a text-to-speech service. It does not retain a selected source file, source path, raw source/output bytes, browser file handle, download location, or a secret. Its deliberately bounded browser-local exceptions are the optional personal-vocabulary JSON control, browser speech synthesis after explicit opt-in, bounded browser-local schedule records, the companion-site logo customizer, the file converter, the Ollama observer, and the separate authenticator/toy-lock module documented below. The logo customizer derives a bounded display-only PNG or JPEG representation from a selected local image after byte and decode checks; it does not retain a source filename, path, `file:` URL, or original source file. The vocabulary control reads user-selected JSON bytes only in the browser so the strict local validator can validate the documented schema before the contract retains a bounded replacement payload in this origin's local storage until the visitor clears it. The converter can inspect up to 12 user-selected files, each no larger than 1 MiB, and perform only its explicitly enabled local text/structured-data/encoding transformations. Its browser-local history retains at most 100 sanitized metadata records; it is not a source-file store. PDF, media, archive, and native-workbook conversions remain unavailable. The observer makes three fixed loopback reads only after a visitor explicitly selects **Refresh local Ollama**. It has no editable host, port, path, token, proxy, redirect, or cloud route, and it cannot create, change, remove, copy, pull, or run a model. The authenticator/toy-lock module uses a separate bounded origin-scoped record, makes no network request, and is excluded from ordinary export, history, and status data.

The notification center retains only bounded page-local notice and audit state. A notification cannot become evidence that a server, local file, installer, browser transfer, or desktop operation occurred. Its destructive confirmation flow may remove only notification metadata in this origin's local-storage record; it cannot create, delete, upload, download, install, or modify a server, file, transfer, desktop record, credential, or external resource.

All server operation and every Ollama capability beyond that read-only browser observer belong exclusively to the installed desktop application, where local paths, prerequisite checks, process status, data handling, and outcomes can be verified.

The landing page includes clearly labelled **illustrative interface previews** only. They are not presented as product screenshots. A real capture can replace an illustrative preview only after it has been obtained from the built desktop artifact.

## Browser-local feature preview hooks

`index.html` exposes explicit `data-contract-surface` and `data-contract-hook` attributes for the static product-preview destinations. They provide stable source hooks for a contract engine without implying that a public website performs desktop-only actions.

The visible destinations are:

- Browser-local status
- Settings and appearance
- Offline documentation
- Local file converter
- Authenticator and toy locks
- Browser-local Ollama observer
- Local version history
- Notification center
- Download and release states

## Browser-local engine wiring

`index.html` loads `contract.js` before the module `app.js` at the end of the document. The module imports `vocabulary-loader.js`, which is a browser-safe, DOM-free strict validator. The interaction engine hydrates visible settings, logo metadata, notifications, audit history, browser-local status, schedules, and completeness state from the contract's version-5 `minecraft-server-studio.site.contract.v2` local-storage record, then persists changes through the contract's documented public methods. It does not maintain a parallel session-storage settings model. Other than the explicit fixed-loopback Ollama observer described below, the engines do not establish a chat bridge, backend connection, desktop command channel, server connection, installer service, schedule-source adapter, or credential store. The installer controller reads only the embedded fixed manifest, enables an explicit start decision, and hands the resulting immutable asset URL to the browser only after the visitor selects its real link; it has no transfer API or completion observer. `authenticator-locks.js` is a deliberately separate module with its own bounded origin-scoped record; it is not included in the general contract export or audit-history model.

The settings preview uses the same contract state that it renders: language mode, English and Cantonese funny levels, theme, density, and dialog emoji preference. The language mode, both tone sliders, and the emoji switch are real persisted browser-local controls on this page; they do not delegate to the desktop app. The command palette registers browser-local destinations through the contract and teleports to the associated preview panel. The personal-vocabulary control accepts only the exact version-1 schema below; malformed, duplicate-key, unsafe, oversized, unsupported, or partial JSON is rejected as a whole before it is cached or applied.

## Browser-local notification center and destructive confirmation

The Notification center preview renders bounded page-local notices and audit entries. Notices describe only browser-local preview activity; they do not announce a server result, installer transfer, download completion, local file change, or an external operation. The shared contract retains at most 200 notification records and 500 audit records for this origin when browser storage is available. A transient bulk selection is capped at 50 visible records. Individual dismissal marks a record dismissed and adds a local audit event. The center also provides plain-text search, a show-dismissed control, and its own adjacent anchored full regular-expression builder.

Info, success, and progress toasts auto-dismiss after seven seconds while the page stays open. Warning and error toasts remain until dismissed. The center can dismiss selected records and can clear dismissed or all notification metadata. Every clear flow identifies the exact selected count, requires two independently operated acknowledgements and a full 0–100 slider, provides Emergency exit and Escape cancellation, and returns focus to the control that opened it. It calls the contract clear method only after the confirmation state is complete. The affected data is limited to this origin's notification metadata; it cannot delete browser downloads, server data, installed-application data, credentials, local files, or external data.

No notification-center or confirmation action makes a network request. Browser storage is not a security boundary, and an unavailable storage implementation leaves only the current in-memory page state. Complete localization, accessible interaction evidence, action-handler coverage, built-page interaction, and capture evidence are still incomplete. See [Browser-local notification center and destructive confirmation](../docs/features/browser-local-notifications-and-confirmation.md) for the detailed boundary.

## Browser-local installer download handoff

The installer surface does not poll a release API, fetch release metadata, use a latest-release URL, or interpolate an asset name at runtime. It accepts only the exact version-1 `#mss-fixed-installer-manifest` object embedded in `index.html`; the host validates the complete fixed schema, the project path, release tag, release-page URL, asset path, platform, expected file name, and explicit unsigned status before it enables a browser-link action. A malformed, missing, extra-field, or inconsistent manifest disables every installer action and release link rather than supplying a fallback URL.

Each visible installer action opens the same start decision. The decision states that cancellation makes no audit or notification change and shows the exact immutable release facts. Only the **Start browser download** link has the manifest asset URL, so a visitor—not page startup, a timer, or a background task—activates the browser handoff. On that click, the page adds bounded local audit and notification entries that say only that the link was activated. The visible progress and completion cards remain `Unknown` after handoff because a static page cannot read browser transfer bytes, rate, destination, cancellation, completion, or installation. The local history and notification center therefore record a page-local handoff request, never an installer or download result.

The command palette indexes **Review verified installer download** and opens the exact start decision after revealing the Downloads panel. The dialog uses the native browser dialog path where available, keeps Escape/cancel non-destructive, returns focus to its opening control, has a visible focus treatment, contains no motion-dependent result, and is bounded and internally scrollable on narrow viewports. This source lane did not run tests, browser interaction, built-site capture, or deployment verification. See [Browser-local installer download handoff](../docs/features/browser-local-installer-download-handoff.md) for the full behavior, failure, privacy, and evidence boundary.

## Browser-local file converter

The `file-converter` surface is an independently functional browser-local
slice, not a decorative desktop-app preview. It accepts up to 12 files through
the browser's file input, rejects a source above 1 MiB, and inspects at most
the first 512 bytes before admitting a record to the current-page queue. The
queue holds up to 24 items. Detection and adapter eligibility use bounded bytes
and content validation rather than a filename extension or MIME value alone.

The only enabled local routes are UTF-8 text to UTF-8 text; valid JSON, CSV,
or TSV to JSON, CSV, TSV, or deliberately limited YAML-style text; and any
bounded source bytes to Base64 or hexadecimal text. Base64 and hexadecimal are
encodings rather than media, PDF, archive, or workbook conversion. PDF, image,
audio, video, archive, and native-workbook cards stay visible but disabled with
their exact missing parser/encoder reason. A category owns its own plain-text
filter and adjacent anchored pattern helper; pattern mode is explicit and does
not share state across categories.

The visitor previews an eligible output and explicitly chooses Download before
the browser creates a file. The browser decides the download location. The
existing browser-local contract retains at most 100 metadata-only conversion
records: `id`, sanitized `sourceName`, `sourceType`, `sourceBytes`,
`detectedKind`, `category`, `targetType`, `targetFormat`, `targetName`,
`status`, `adapterId`, `createdAt`, `updatedAt`, `downloadRequestedAt`, and `reason`.
It never retains source/output bytes, preview text, browser file handles, a
source path, or a download location. See
[`docs/features/browser-local-file-converter.md`](../docs/features/browser-local-file-converter.md)
for the full behavior, failure, privacy, and verification boundary.

```json
{
  "version": 1,
  "replacements": [
    { "from": "ordinary source text", "to": "local replacement text" }
  ]
}
```

The JSON payload is limited to 64 KiB in UTF-8, three structural levels, 250 records, nonempty 128-code-point `from` strings, and 512-code-point `to` strings. It is not uploaded or shared. The loader rejects malformed UTF-8, duplicate object keys (including escaped equivalents), unknown fields, unsafe keys, unsupported versions, invalid Unicode, and incomplete cache envelopes. The contract revalidates its browser-local cache on startup and the page revalidates the payload again before display or text replacement. Clearing the visible control clears only this browser-local payload.

## Browser-local history and safe exports

The local version-history destination is a browser-local view of the general
page contract's bounded audit records. It contains only page-owned action
metadata: an identifier, action, target, bounded non-secret detail, and creation
time. The normalized history has a maximum of 500 records. Date, action,
plain-text, and explicit local regular-expression filters compose over that
same bounded record set, and visitors may select visible filtered records. It
does not read or write a Minecraft server log, a desktop application record,
browser history, local files, selected converter bytes, source paths, download
locations, or authenticator/toy-lock records.

The history view uses an honest empty state, plain-text filtering by default,
and a local bounded regular-expression option. Its safe exports are limited to
UTF-8 `json`, `jsonl`, `csv`, `tsv`, and `markdown` representations of selected
page audit records. A browser download request does not reveal a destination or
prove transfer completion. The page never exports personal-vocabulary values,
credentials, secrets, TOTP codes, passwords, verifiers, pairing data, file
content, server data, installer assets, external-status data, or
personal-vocabulary file metadata. Removing selected records or clearing the
page audit list uses the contract's two-key/full-slider local destructive
confirmation and affects no desktop, server, download, browser-history, or
authenticator data. See
[`docs/features/browser-local-history-and-safe-exports.md`](../docs/features/browser-local-history-and-safe-exports.md)
for the full failure, privacy, reset, and verification boundary.

## Browser-local authenticator, pairing QR, and toy locks

`authenticator-locks.js` implements a separate, bounded local record at
`minecraft-server-studio.site.authenticator-locks.v1`. It exists because a
static page has no operating-system credential vault. The record belongs only
to this origin in this browser profile; it is not synchronized to another
browser, device, account, server, chat, or installed application. Browser
storage is not a security boundary.

The visible authenticator accepts either bounded manual Base32 fields or a
bounded standard `otpauth://totp/` URI. It calculates RFC 4226/HOTP and RFC
6238/TOTP codes through browser Web Crypto using SHA-1, SHA-256, or SHA-512,
six through eight digits, and the explicitly offered 15, 30, 45, 60, or
90-second periods. The list shows the current code, next code, and a readable
countdown, and its local search defaults to plain text with an anchored regular
expression builder.

An explicit **Reveal pairing QR** action renders a QR code entirely in the
browser for the standard TOTP URI. It also makes the same Base32 secret visible
for 60 seconds as a manual alternative, then removes it from the rendered
surface. The QR module uses no service, CDN, image fetch, camera, clipboard
import, or QR-image decoder. Pairing URIs longer than the bundled QR Version
10-L byte capacity are reported honestly; the entry remains usable and the
manual route remains available. Before the browser marks a revealed pairing
confirmed, the visitor must type the current code from the paired authenticator
back into the local confirmation field. A mismatch leaves the pairing marked
unconfirmed.

Toy locks are opt-in, per registered target, and independently credentialed.
Each lock can use a local PBKDF2 password verifier or a local SHA-1/30-second
TOTP secret. Unlock state remains in memory and returns to locked after a page
reload. The registered targets currently cover the authenticator tab, entry
list, and pairing reveal; this is not a claim that every rendered element on
the entire site is locked. These controls are a for-fun user-experience speed
bump, not encryption, access control, or protection from anyone who can access
the same browser profile.

The local **Support Tickets** desk records only a ticket number, category, and
local status. Any optional note is discarded before the ticket is saved. It
states directly that nothing is sent, no ticket exists outside the browser, no
network request is made, no data is collected, and nobody is reading it. The
recovery route is to clear this site's storage in browser settings. A visible
two-key/full-slider control can erase only this module's local record; it does
not alter the installed app, a server, downloads, or another site.

No authenticator or toy-lock secret, password, OTP, URI, QR payload, or manual
reveal enters the page's ordinary exports, the general contract audit/history
record, status model, telemetry, source repository, or a network request.
This implementation has no QR image import, QR clipboard import, camera scan,
cross-device synchronization, secret export, every-element lock coverage,
localized operational copy, automated test result, built-site interaction, or
capture evidence yet.

## Browser-local language and renamed presentation mode

The settings panel independently persists English and Cantonese funny levels from 1 through 5, together with English, playful Hong Kong-style Cantonese, or bilingual presentation and the notice-emoji preference. The current implementation localizes this settings core and its feedback; the page-wide localization inventory remains explicitly incomplete until every other public surface has equivalent translated copy and verification.

The panel also owns a browser-local, user-renamable presentation mode. Before enabling it, a visitor gives the mode any label and configures a 4–64-character unlock code. The browser uses a fresh local random salt and a SHA-256 verifier; it never saves, exports, logs, or displays the code itself. While active, the page forces English and omits its language, tone, and personal-vocabulary controls rather than merely disabling them. Turning it off or resetting its verifier needs a local verifier match. This is a user-experience lock, not security protection. If the code is forgotten, the recovery path is to clear this site's storage in the browser; that resets this page's local preferences, vocabulary cache, local lock metadata, and verifier, not an installed desktop app or server.

## Browser-local narrator and schedules

The settings preview includes an optional event narrator that is **off by default**. When a visitor turns it on, the page uses the browser's real `speechSynthesis` capability and waits for late `voiceschanged` delivery before it lists voices. English and Cantonese each save a separate non-empty browser `voiceURI` choice, with **Choose automatically** as the default; a display name is never treated as a stable choice. A saved identity that is unavailable remains stored; the page explains whether a compatible automatic voice can be used, whether a browser voice may need network access, or whether that language will remain silent. It never sends narration text to a service, and it does not claim that a browser can reliably identify a screen reader.

Both narration queues English first and Cantonese second. The page uses one serialized queue, debounces ordinary rapid events for 250 milliseconds, applies a per-category cooldown, replaces queued superseded event lines, and exposes bounded shared rate (`0.5`–`2`) and pitch (`0`–`2`) controls. It never begins narration until the visitor has opted in and a page event occurs. While the renamed presentation mode is active, the narrator controls are omitted and queued speech is cancelled; saved browser-local preferences remain available when the mode is unlocked.

The schedule editor saves at most 100 version-1 browser-local rules. It supports language mode, theme, density, accent color, a browser-safe font family fallback stack, font scale, and font weight. Each rule contains a label, enabled state, local start/end dates, optional local start/end times, every-day or explicit weekday selection, and priority. The browser's local timezone is shown with daylight-saving behavior. Rules resolve by highest priority, then stable rule identifier in ascending lexical order. A normal time window includes its start and excludes its end; an equal start/end window is stored but inactive; a cross-midnight window belongs to the prior start date and weekday after midnight. Schedules do not overwrite the saved base settings, and the base returns when a rule stops matching.

Validated HTTPS and Home Assistant choices are shown as unavailable. This static page has no privileged network adapter, no endpoint-validation route, and no protected credential store, so it makes no request for either choice. While the renamed presentation mode is active, schedules remain stored but do not override the forced English presentation. The saved-rule search has a local plain-text default and its own adjacent regular-expression builder. See [the detailed narrator and schedule article](NARRATOR_AND_SCHEDULE.md) and [the contract reference](CONTRACT.md).

Removing a saved rule identifies the exact local rule, requires two independent acknowledgements and a full confirmation slider, includes an Emergency exit action and Escape cancellation, and leaves the saved base settings unchanged. It does not use a browser prompt or a desktop action.

The Status destination uses `data-contract-surface="status"` and separate hooks for current state, last updated, local evidence, active local interactions, next steps, and the explicit no-bridge boundary. Its status is intentionally limited to this public page's browser-local state.

## Browser-local Ollama observer

The public page has one narrow, user-triggered Ollama observation route. It does not run at page load, on a timer, after an installer click, or after any other page control. A visitor must select **Refresh local Ollama** before the browser begins a request.

Each refresh may make only these `GET` requests to the literal fixed origin `http://127.0.0.1:11434`:

- `/api/version` for a normalized local service-version summary;
- `/api/tags` for a bounded installed-model summary; and
- `/api/ps` for a bounded running-model summary.

There is no endpoint field, host chooser, port setting, path setting, proxy, redirect follow-up, token, account, cloud fallback, request body, or remote transport. The observer uses a bounded abort timeout and validates status, fixed response URL, declared and actual response bytes, JSON shape, text sizes, and collection sizes before it renders a response. It rejects the entire refresh instead of applying a partial or raw response.

The page states the exact result without guessing:

| Visible state | Meaning |
| --- | --- |
| Not checked | No request has been made from this page. |
| Refreshing | A visitor-triggered bounded read is in progress. |
| Local service healthy | All allowed reads returned accepted, bounded data. |
| Local service unavailable | The browser could not complete the fixed local read; this does not diagnose whether the service is absent or stopped. |
| Browser or CORS blocked | The browser did not make a readable local response available. This can mean CORS, mixed-content or privacy blocking, or an unavailable local runtime; the page cannot distinguish or bypass those conditions. |
| Browser capability unsupported | The required browser request or cancellation capability is unavailable. |
| Local response rejected | A response arrived but failed the allowed status, content, size, or JSON validation. |

After a successful refresh, the page may retain a bounded, normalized, non-secret last-success snapshot in this origin's `sessionStorage` for the current browser session only. It retains only the displayable service version and observation time plus, for each installed or running model, the safe name, size, VRAM size, modification or expiry timestamp, family, parameter-size label, and quantization label. It never retains raw response bodies, headers, credentials, prompt data, local paths, digests, or an endpoint chosen by a visitor. A retained snapshot is visibly stale until the next accepted refresh and never proves that the service or a model is available now.

Installed and running summaries have their own browser-local plain-text search and regex route. Filtering operates only on the already accepted local snapshot; it neither sends a query to Ollama nor changes a model.

The observer is not a browser implementation of the full Ollama suite manager. Model Store catalog discovery, pulls, chat, delete, copy, hardware-fit assessment, and harness launch remain visible unavailable boundaries with their exact browser-only reason. The page does not turn any of those controls into a desktop bridge, an arbitrary local command, or a hidden request.

See the [browser-local Ollama observer article](../docs/features/browser-local-ollama-observer.md) for the complete scope, failure, privacy, and verification boundary.

## Browser-local appearance and tab-navigation foundation

The companion site has its own browser-local appearance and tab-navigation foundation. It affects only this public page in the current browser profile and is independent of the installed application. The page does not use these controls to operate a Minecraft server, change a local desktop setting, manage an installer transfer, or call a backend.

The site persists validated local choices for system/light/dark theme, density, accent, and safe typography. Its appearance editor exposes bounded local accent, font-scale, and font-weight controls for the page, tab strip, and selected tab, plus a reset path for the values this foundation manages. The setting is stored through the one contract record described in `CONTRACT.md`; a browser-storage failure leaves the page usable for the current visit but must be presented as a persistence failure rather than as a saved preference.

Registered companion-site destinations use browser-style tabs. Visitors can dock the strip at the left, right, top, or bottom. Side docks expose vertical tab semantics and Up/Down navigation; top and bottom docks expose horizontal semantics and Left/Right navigation. The browser-local tab model persists the dock edge, derived orientation, active selection, visible order, pinning, groups, group order, and collapsed-group state. When tabs do not fit, a real overflow surface remains available instead of silently clipping labels.

Three separate discovery routes are provided for the current strip, the browser-local group list, and the companion site's master tab list. Each route starts with plain text and has its own adjacent anchored regular-expression builder. Query, pattern, flags, validation feedback, and candidate labels remain local to that search route. These builders never search an installed application, browser history, local files, or a remote service.

This is a bounded foundation, not a claim of complete appearance editing or tab management. Every-element editors, complete typography and color tooling, all menu/dropdown builders, complete bulk-close behavior, cross-window discovery, full localization, accessibility verification, built-artifact interaction, and real captures remain incomplete until separately implemented and evidenced.

## Browser-local companion-site logo customization

The Settings and appearance destination independently exposes three
browser-rendered shipped marks: Studio Aqua, Server Slate, and World Spruce.
Its local preset list starts with plain-text filtering and supplies an adjacent
anchored regular-expression builder for that exact list. The page does not use
the search to inspect browser history, local folders, the installed app, or a
network service.

A visitor can choose a PNG or JPEG through the browser's local file picker.
The page checks actual bytes rather than trusting the extension or MIME label,
limits the selected source to 512 KiB, rejects unsupported or malformed data,
limits decoded dimensions to 4,096 pixels per side and 4,000,000 pixels total,
then creates a display-only PNG or JPEG of no more than 512 logical pixels per
side. Only that bounded derived data URL and safe rendering metadata can be
kept in this page's contract record. A source filename, source path, browser
file handle, `file:` URL, and original source file are not retained. The
derived data URL is omitted from regular browser-local exports and generic
history details.

For a custom display image, fit, transparent or solid-color background, and
horizontal/vertical focal point controls update the page mark only. They never
change an application identifier, executable name, installer identity, update
feed, release asset, local server, or desktop-app configuration. **Reset logo**
restores Studio Aqua and removes the derived custom representation from this
site's local storage; it never changes the original selected file. While the
browser-local presentation mode is active, custom-logo input and rendering are
omitted and Studio Aqua is rendered until the local unlock flow turns the mode
off. See
[the focused logo-customization article](../docs/features/site-logo-customization.md)
for failure behavior and the current verification boundary.

## Per-surface completeness inventory

This is a public-source inventory, not a claim that the installed application has been verified. The page seeds the same hand-written surfaces into its browser-local contract inventory and renders the incomplete count in the Status preview. “Static hook present” means the corresponding browser-local preview and source hook are in the page. Localization, automated testing, real interaction, and real-capture evidence remain unverified until separately completed.

| Surface | Implementation | Documentation | Localization | Tests | Capture |
| --- | --- | --- | --- | --- | --- |
| Marketing landing shell | Browser-local source hook | This README | Missing | Missing | Missing |
| Browser-local Status | Browser-local contract view | This README and `CONTRACT.md` | Missing | Missing | Missing |
| Settings and appearance | Browser-local language, funny-level, notice-emoji, personal-vocabulary, renamed presentation-mode, theme, density, accent, safe typography, bounded appearance-editor, narrator, and schedule controls wired to contract | This README, `CONTRACT.md`, and `NARRATOR_AND_SCHEDULE.md` | Core only; page-wide localization remains incomplete | Not run in fast-delivery lane | Missing |
| Tab navigation and appearance editor | Browser-local dock, active/order/pin/group state, overflow, current/group/master searches, anchored regex builders, and bounded target editor | This README, `CONTRACT.md`, and `docs/features/appearance-and-tabs.md` | Missing | Not run in fast-delivery lane | Missing |
| Narrator and scheduled settings | Actual browser speech capability and bounded version-1 local schedule rules; no schedule-source network path | This README, `CONTRACT.md`, and `NARRATOR_AND_SCHEDULE.md` | English baseline only; broader localization incomplete | Not run in fast-delivery lane | Missing |
| Browser-local companion-site logo | Shipped CSS/markup presets plus byte-validated bounded PNG/JPEG display representation, fit/background/focal controls, reset, and School-mode fallback | This README, `CONTRACT.md`, and `../docs/features/site-logo-customization.md` | English-first; incomplete | Not run in fast-delivery lane | Missing |
| Offline documentation | Static source hook | This README | Missing | Missing | Missing |
| File converter | Browser-local bounded text/structured-data/encoding conversion; PDF/media/archive/native-workbook routes remain unavailable | This README, `CONTRACT.md`, and `../docs/features/browser-local-file-converter.md` | Missing | Missing | Missing |
| Authenticator and locks | Browser-local TOTP, QR pairing reveal, toy-lock, and local Support Tickets source | This README, `CONTRACT.md`, and `../docs/features/browser-local-authenticator-and-toy-locks.md` | English-first; incomplete | Not run in fast-delivery lane | Missing |
| Browser-local Ollama observer | Explicit fixed-loopback `GET` observer with a local last-success snapshot; catalog, pull, chat, delete, copy, hardware fit, and harness remain unavailable | This README, `CONTRACT.md`, and the [feature article](../docs/features/browser-local-ollama-observer.md) | Missing | Not run in fast-delivery lane | Missing |
| Local version history and safe exports | Browser-local bounded audit browsing, local regex filtering, and selected-record UTF-8 export; no server/filesystem/credential history | This README, `CONTRACT.md`, and `../docs/features/browser-local-history-and-safe-exports.md` | Missing | Not run in fast-delivery lane | Missing |
| Notification center | Bounded browser-local notices/audit entries, local plain-text/regex search, and a two-acknowledgement/full-slider flow that clears only page-local notification metadata | This README, `CONTRACT.md`, and `../docs/features/browser-local-notifications-and-confirmation.md` | English baseline; broader localization incomplete | Not run in fast-delivery lane | Missing |
| Download and release states | Validated fixed manifest, real start decision, user-triggered immutable browser link, and bounded local handoff metadata; browser transfer and completion remain unobservable | This README, `CONTRACT.md`, and `docs/features/browser-local-installer-download-handoff.md` | English-first; incomplete | Not run in fast-delivery lane | Missing |

## GitHub Pages hand-off

The exact static publish source is the repository-relative `site/` directory, whose entry point is `site/index.html`. A Pages workflow may upload that directory directly as its artifact; the included `.nojekyll` marker prevents Jekyll processing. This directory also contains `.openai/hosting.json`, scoped only to this static source and declaring no database or object-storage binding.

The verified public installer is release `v0.1.0-build.104.1`, targeting `371858e62b159c7519bb6b9736e3384705da88a3`. Its Windows x64 asset is [`Minecraft.Server.Studio-0.104.1-x64-Setup.exe`](https://github.com/Ding-Ding-Projects/minecraft-server-studio/releases/download/v0.1.0-build.104.1/Minecraft.Server.Studio-0.104.1-x64-Setup.exe). The asset is unsigned; keep the page's Windows unknown-publisher or SmartScreen warning inside every start decision. The page must not guess another asset URL or claim transfer, installation, or runtime success.
