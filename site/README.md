# Minecraft Server Studio public landing page

This directory is the static, public marketing landing page for Minecraft Server Studio, a Windows desktop application for creating, configuring, and operating Paper and Spigot Minecraft servers.

The landing page describes:

- the Paper and Spigot server choices;
- automatic Java and Git prerequisite setup performed by the installed desktop application;
- local server planning, configuration, lifecycle, and plugin-management capabilities;
- browser-local controls and product destinations such as settings, documentation, file conversion, authenticator and lock management, a deliberately narrow local Ollama observer, local history, notification center, and download states; and
- the verified public installer availability boundary.

## Truthful static boundary

This public page is static. It has no account system, backend, analytics, installer service, server process, remote control channel, network file upload, or credential storage. It presents one static direct link to the verified `Minecraft.Server.Studio-0.1.0-x64-Setup.exe` asset from release `v0.1.0-build.72.1`; after a visitor activates that link, the browser handles the transfer. The page does not monitor, pause, resume, confirm, or install that download.

The published installer is for Windows x64 version 0.1.0 and is unsigned. Windows may show an unknown-publisher or SmartScreen warning. The page links to the asset and release status without claiming that a download or installation completed.

The page does not install prerequisites, download a Paper or Spigot distribution, create server files, start a Minecraft server, or send a console command. It does not retain a selected source file, source path, raw source/output bytes, browser file handle, download location, or a secret. Its deliberately bounded browser-local exceptions are the optional personal-vocabulary JSON control, the file converter, and the Ollama observer. The converter can inspect up to 12 user-selected files, each no larger than 1 MiB, and perform only its explicitly enabled local text/structured-data/encoding transformations. Its browser-local history retains at most 100 sanitized metadata records; it is not a source-file store. PDF, media, archive, and native-workbook conversions remain unavailable. The observer makes three fixed loopback reads only after a visitor explicitly selects **Refresh local Ollama**. It has no editable host, port, path, token, proxy, redirect, or cloud route, and it cannot create, change, remove, copy, pull, or run a model.

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

`index.html` loads `contract.js` before the module `app.js` at the end of the document. The module imports `vocabulary-loader.js`, which is a browser-safe, DOM-free strict validator. The interaction engine hydrates visible settings, notifications, audit history, browser-local status, and completeness state from the contract's version-3 `minecraft-server-studio.site.contract.v2` local-storage record, then persists changes through the contract's documented public methods. It does not maintain a parallel session-storage settings model. Other than the explicit fixed-loopback Ollama observer described below, the engines do not establish a chat bridge, backend connection, desktop command channel, server connection, installer service, or credential store. The static installer anchors remain ordinary browser links and are not transformed into an in-page transfer flow.

The settings preview uses the same contract state that it renders: language mode, English and Cantonese funny levels, theme, density, and dialog emoji preference. The language mode, both tone sliders, and the emoji switch are real persisted browser-local controls on this page; they do not delegate to the desktop app. The command palette registers browser-local destinations through the contract and teleports to the associated preview panel. The personal-vocabulary control accepts only the exact version-1 schema below; malformed, duplicate-key, unsafe, oversized, unsupported, or partial JSON is rejected as a whole before it is cached or applied.

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

## Browser-local language and renamed presentation mode

The settings panel independently persists English and Cantonese funny levels from 1 through 5, together with English, playful Hong Kong-style Cantonese, or bilingual presentation and the notice-emoji preference. The current implementation localizes this settings core and its feedback; the page-wide localization inventory remains explicitly incomplete until every other public surface has equivalent translated copy and verification.

The panel also owns a browser-local, user-renamable presentation mode. Before enabling it, a visitor gives the mode any label and configures a 4–64-character unlock code. The browser uses a fresh local random salt and a SHA-256 verifier; it never saves, exports, logs, or displays the code itself. While active, the page forces English and omits its language, tone, and personal-vocabulary controls rather than merely disabling them. Turning it off or resetting its verifier needs a local verifier match. This is a user-experience lock, not security protection. If the code is forgotten, the recovery path is to clear this site's storage in the browser; that resets this page's local preferences, vocabulary cache, local lock metadata, and verifier, not an installed desktop app or server.

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

## Per-surface completeness inventory

This is a public-source inventory, not a claim that the installed application has been verified. The page seeds the same hand-written surfaces into its browser-local contract inventory and renders the incomplete count in the Status preview. “Static hook present” means the corresponding browser-local preview and source hook are in the page. Localization, automated testing, real interaction, and real-capture evidence remain unverified until separately completed.

| Surface | Implementation | Documentation | Localization | Tests | Capture |
| --- | --- | --- | --- | --- | --- |
| Marketing landing shell | Browser-local source hook | This README | Missing | Missing | Missing |
| Browser-local Status | Browser-local contract view | This README and `CONTRACT.md` | Missing | Missing | Missing |
| Settings and appearance | Browser-local language, funny-level, notice-emoji, personal-vocabulary, renamed presentation-mode, theme, density, accent, safe typography, and bounded appearance-editor controls wired to contract | This README and `CONTRACT.md` | Core only; page-wide localization remains incomplete | Not run in fast-delivery lane | Missing |
| Tab navigation and appearance editor | Browser-local dock, active/order/pin/group state, overflow, current/group/master searches, anchored regex builders, and bounded target editor | This README, `CONTRACT.md`, and `docs/features/appearance-and-tabs.md` | Missing | Not run in fast-delivery lane | Missing |
| Offline documentation | Static source hook | This README | Missing | Missing | Missing |
| File converter | Browser-local bounded text/structured-data/encoding conversion; PDF/media/archive/native-workbook routes remain unavailable | This README, `CONTRACT.md`, and `../docs/features/browser-local-file-converter.md` | Missing | Missing | Missing |
| Authenticator and locks | Static credential-free boundary | This README and `CONTRACT.md` | Missing | Missing | Missing |
| Browser-local Ollama observer | Explicit fixed-loopback `GET` observer with a local last-success snapshot; catalog, pull, chat, delete, copy, hardware fit, and harness remain unavailable | This README, `CONTRACT.md`, and the [feature article](../docs/features/browser-local-ollama-observer.md) | Missing | Not run in fast-delivery lane | Missing |
| Local version history | Browser-local audit preview only | This README and `CONTRACT.md` | Missing | Missing | Missing |
| Notification center | Browser-local notification preview | This README and `CONTRACT.md` | Missing | Missing | Missing |
| Download and release states | Static verified installer anchor | This README | Missing | Missing | Missing |

## GitHub Pages hand-off

The exact static publish source is the repository-relative `site/` directory, whose entry point is `site/index.html`. A Pages workflow may upload that directory directly as its artifact; the included `.nojekyll` marker prevents Jekyll processing. This directory also contains `.openai/hosting.json`, scoped only to this static source and declaring no database or object-storage binding.

The verified public installer is release `v0.1.0-build.72.1`, targeting `b5104a986f4a0c02171852998b4268ef3d328a42`. Its Windows x64 asset is [`Minecraft.Server.Studio-0.1.0-x64-Setup.exe`](https://github.com/Ding-Ding-Projects/minecraft-server-studio/releases/download/v0.1.0-build.72.1/Minecraft.Server.Studio-0.1.0-x64-Setup.exe). The asset is unsigned; keep the page's Windows unknown-publisher or SmartScreen warning next to every direct installer call-to-action. The page must not claim transfer, installation, or runtime success.
