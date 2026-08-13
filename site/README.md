# Minecraft Server Studio public landing page

This directory is the static, public marketing landing page for Minecraft Server Studio, a Windows desktop application for creating, configuring, and operating Paper and Spigot Minecraft servers.

The landing page describes:

- the Paper and Spigot server choices;
- automatic Java and Git prerequisite setup performed by the installed desktop application;
- local server planning, configuration, lifecycle, and plugin-management capabilities;
- browser-local previews of product destinations such as settings, documentation, file conversion, authenticator and lock management, local Ollama integration, local history, notification center, and download states; and
- the availability boundary for the future installer.

## Truthful static boundary

This public page is static. It has no account system, backend, analytics, installer, server process, remote control channel, file upload, or credential storage. It does not install prerequisites, download a Paper or Spigot distribution, create files, start a Minecraft server, send a console command, convert a file, access an Ollama runtime, or retain a selected file or secret.

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

`index.html` loads `contract.js` before `app.js` at the end of the document. The contract and interaction engines may enrich the browser-local preview state, accessibility announcements, and local demonstration controls. They do not establish a chat bridge, backend connection, desktop command channel, server connection, installer route, or credential store.

The Status destination uses `data-contract-surface="status"` and separate hooks for current state, last updated, local evidence, active local interactions, next steps, and the explicit no-bridge boundary. Its status is intentionally limited to this public page's browser-local state.

## Per-surface completeness inventory

This is a public-source inventory, not a claim that the installed application has been verified. “Static hook present” means the corresponding browser-local preview and source hook are in the page. Localization, automated testing, and real-capture evidence remain unverified until separately completed.

| Surface | Implementation | Documentation | Localization | Tests | Capture |
| --- | --- | --- | --- | --- | --- |
| Marketing landing shell | Static source present | This README | Unverified | Unverified | Unverified |
| Browser-local Status | Static hook present | This README | Unverified | Unverified | Unverified |
| Settings and appearance | Static hook present | This README | Unverified | Unverified | Unverified |
| Offline documentation | Static hook present | This README | Unverified | Unverified | Unverified |
| File converter | Static hook present | This README | Unverified | Unverified | Unverified |
| Authenticator and locks | Static hook present | This README | Unverified | Unverified | Unverified |
| Local Ollama manager | Static hook present | This README | Unverified | Unverified | Unverified |
| Local version history | Static hook present | This README | Unverified | Unverified | Unverified |
| Notification center | Static hook present | This README | Unverified | Unverified | Unverified |
| Download and release states | Static hook present | This README | Unverified | Unverified | Unverified |

## GitHub Pages hand-off

The exact static publish source is the repository-relative `site/` directory, whose entry point is `site/index.html`. A Pages workflow may upload that directory directly as its artifact; the included `.nojekyll` marker prevents Jekyll processing. This directory also contains `.openai/hosting.json`, scoped only to this static source and declaring no database or object-storage binding.

Do not create a download link until a verified public installer release exists. Until then, the page must retain its disabled installer call-to-action and clear availability text.
