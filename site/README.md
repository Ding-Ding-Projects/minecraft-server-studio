# Minecraft Server Studio public landing page

This directory is the static, public marketing landing page for Minecraft Server Studio, a Windows desktop application for creating, configuring, and operating Paper and Spigot Minecraft servers.

The landing page describes:

- the Paper and Spigot server choices;
- automatic Java and Git prerequisite setup performed by the installed desktop application;
- local server planning, configuration, lifecycle, and plugin-management capabilities;
- browser-local previews of product destinations such as settings, documentation, file conversion, authenticator and lock management, local Ollama integration, local history, notification center, and download states; and
- the verified public installer availability boundary.

## Truthful static boundary

This public page is static. It has no account system, backend, analytics, installer service, server process, remote control channel, network file upload, or credential storage. It presents one static direct link to the verified `Minecraft.Server.Studio-0.1.0-x64-Setup.exe` asset from release `v0.1.0-build.65.1`; after a visitor activates that link, the browser handles the transfer. The page does not monitor, pause, resume, confirm, or install that download.

The published installer is for Windows x64 version 0.1.0 and is unsigned. Windows may show an unknown-publisher or SmartScreen warning. The page links to the asset and release status without claiming that a download or installation completed.

The page does not install prerequisites, download a Paper or Spigot distribution, create files, start a Minecraft server, send a console command, convert a file, or access an Ollama runtime. It does not retain a selected source file, source file name, source path, or a secret. Its one local file-reading exception is the optional personal-vocabulary JSON control: it reads the user-selected JSON bytes only in the browser so the strict local validator can validate the documented schema before the contract retains a bounded replacement payload in this origin's local storage until the visitor clears it.

Those operations belong exclusively to the installed desktop application, where local paths, prerequisite checks, process status, data handling, and outcomes can be verified.

The landing page includes clearly labelled **illustrative interface previews** only. They are not presented as product screenshots. A real capture can replace an illustrative preview only after it has been obtained from the built desktop artifact.

## Browser-local feature preview hooks

`index.html` exposes explicit `data-contract-surface` and `data-contract-hook` attributes for the static product-preview destinations. They provide stable source hooks for a contract engine without implying that a public website performs desktop-only actions.

The visible destinations are:

- Browser-local status
- Settings and appearance
- Offline documentation
- Local file converter
- Authenticator and toy locks
- Local Ollama suite manager
- Local version history
- Notification center
- Download and release states

## Browser-local engine wiring

`index.html` loads `contract.js` before the module `app.js` at the end of the document. The module imports `vocabulary-loader.js`, which is a browser-safe, DOM-free strict validator. The interaction engine hydrates visible settings, notifications, audit history, browser-local status, and completeness state from the contract's version-3 `minecraft-server-studio.site.contract.v2` local-storage record, then persists changes through the contract's documented public methods. It does not maintain a parallel session-storage settings model. The engines do not establish a chat bridge, backend connection, desktop command channel, server connection, installer service, or credential store. The static installer anchors remain ordinary browser links and are not transformed into an in-page transfer flow.

The settings preview uses the same contract state that it renders: language mode, English and Cantonese funny levels, theme, density, and dialog emoji preference. The language mode, both tone sliders, and the emoji switch are real persisted browser-local controls on this page; they do not delegate to the desktop app. The command palette registers browser-local destinations through the contract and teleports to the associated preview panel. The personal-vocabulary control accepts only the exact version-1 schema below; malformed, duplicate-key, unsafe, oversized, unsupported, or partial JSON is rejected as a whole before it is cached or applied.

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

## Per-surface completeness inventory

This is a public-source inventory, not a claim that the installed application has been verified. The page seeds the same hand-written surfaces into its browser-local contract inventory and renders the incomplete count in the Status preview. “Static hook present” means the corresponding browser-local preview and source hook are in the page. Localization, automated testing, real interaction, and real-capture evidence remain unverified until separately completed.

| Surface | Implementation | Documentation | Localization | Tests | Capture |
| --- | --- | --- | --- | --- | --- |
| Marketing landing shell | Browser-local source hook | This README | Missing | Missing | Missing |
| Browser-local Status | Browser-local contract view | This README and `CONTRACT.md` | Missing | Missing | Missing |
| Settings and appearance | Browser-local language, funny-level, notice-emoji, personal-vocabulary, and renamed presentation-mode controls wired to contract | This README and `CONTRACT.md` | Core only; page-wide localization remains incomplete | Not run in fast-delivery lane | Missing |
| Offline documentation | Static source hook | This README | Missing | Missing | Missing |
| File converter | Static unavailable-capability boundary | This README and `CONTRACT.md` | Missing | Missing | Missing |
| Authenticator and locks | Static credential-free boundary | This README and `CONTRACT.md` | Missing | Missing | Missing |
| Local Ollama manager | Static no-runtime-query boundary | This README and `CONTRACT.md` | Missing | Missing | Missing |
| Local version history | Browser-local audit preview only | This README and `CONTRACT.md` | Missing | Missing | Missing |
| Notification center | Browser-local notification preview | This README and `CONTRACT.md` | Missing | Missing | Missing |
| Download and release states | Static verified installer anchor | This README | Missing | Missing | Missing |

## GitHub Pages hand-off

The exact static publish source is the repository-relative `site/` directory, whose entry point is `site/index.html`. A Pages workflow may upload that directory directly as its artifact; the included `.nojekyll` marker prevents Jekyll processing. This directory also contains `.openai/hosting.json`, scoped only to this static source and declaring no database or object-storage binding.

The verified public installer is release `v0.1.0-build.65.1`, targeting `d29b2b254ae6759ec821c923f243a8e65227d63c`. Its Windows x64 asset is [`Minecraft.Server.Studio-0.1.0-x64-Setup.exe`](https://github.com/Ding-Ding-Projects/minecraft-server-studio/releases/download/v0.1.0-build.65.1/Minecraft.Server.Studio-0.1.0-x64-Setup.exe). The asset is unsigned; keep the page's Windows unknown-publisher or SmartScreen warning next to every direct installer call-to-action. The page must not claim transfer, installation, or runtime success.
